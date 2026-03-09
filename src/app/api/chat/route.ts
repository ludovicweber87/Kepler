import { spawn } from "child_process";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { prompt, cwd, sessionId } = await request.json();

    if (!prompt || !cwd) {
      return new Response(JSON.stringify({ error: "prompt and cwd are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--dangerously-skip-permissions",
    ];

    // Continue conversation if we have a session
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const proc = spawn("claude", args, {
          cwd,
          env: { ...process.env, PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" },
        });

        let buffer = "";

        proc.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);

              // Extract session ID from first message
              if (msg.session_id) {
                send("session", { id: msg.session_id });
              }

              if (msg.type === "assistant" && msg.message?.content) {
                for (const block of msg.message.content) {
                  if (block.type === "text") {
                    send("text", { text: block.text });
                  } else if (block.type === "tool_use") {
                    send("tool_use", { name: block.name, input: block.input });
                  }
                }
              }

              if (msg.type === "tool" && msg.message?.content) {
                for (const block of msg.message.content) {
                  if (block.type === "tool_result") {
                    send("tool_result", {
                      name: block.tool_use_id,
                      result: typeof block.content === "string"
                        ? block.content.slice(0, 500)
                        : JSON.stringify(block.content).slice(0, 500),
                    });
                  }
                }
              }

              if (msg.type === "result") {
                send("result", {
                  text: msg.result || "",
                  cost: msg.cost_usd,
                  duration: msg.duration_ms,
                  sessionId: msg.session_id,
                });
              }
            } catch {
              // Skip malformed lines
            }
          }
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trim();
          if (text) send("error", { text });
        });

        proc.on("close", () => {
          controller.close();
        });

        proc.on("error", (err) => {
          send("error", { text: err.message });
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Failed to start chat" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
