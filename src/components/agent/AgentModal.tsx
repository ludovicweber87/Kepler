"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueBody?: string;
  localPath: string;
}

interface ToolUseEntry {
  name: string;
  input?: unknown;
  result?: string;
}

interface DisplayEntry {
  id: number;
  type: "user" | "assistant";
  content: string;
  tools?: ToolUseEntry[];
}

const markdownSx = {
  "& p": { m: 0, lineHeight: 1.7 },
  "& p + p": { mt: 1 },
  "& ul, & ol": { pl: 3, my: 0.5 },
  "& code": {
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: "0.8em",
    bgcolor: "rgba(255,255,255,0.06)",
    px: 0.75,
    py: 0.25,
    borderRadius: 1,
  },
  "& pre": {
    bgcolor: "#1A1A1A",
    borderRadius: 1,
    p: 1.5,
    overflow: "auto",
    my: 1,
    "& code": { bgcolor: "transparent", p: 0 },
  },
  "& a": { color: "primary.light" },
};

export default function AgentModal({
  open,
  onClose,
  owner,
  repo,
  issueNumber,
  issueTitle,
  issueBody,
  localPath,
}: AgentModalProps) {
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setInput("");
      setLoading(false);
      setSessionId(null);
      idRef.current = 0;
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    setEntries((prev) => [...prev, { id: idRef.current++, type: "user", content: text }]);
    setInput("");
    setLoading(true);

    // Build prompt: first message includes issue context
    const isFirst = !sessionId;
    const prompt = isFirst
      ? `Work on GitHub issue #${issueNumber}: ${issueTitle}\n${issueBody ? `\nIssue description:\n${issueBody}\n` : ""}\nUser request: ${text}`
      : text;

    const assistantId = idRef.current++;
    setEntries((prev) => [...prev, { id: assistantId, type: "assistant", content: "", tools: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, cwd: localPath, sessionId }),
      });

      if (!res.ok || !res.body) {
        setEntries((prev) =>
          prev.map((e) => (e.id === assistantId ? { ...e, content: `Erreur: ${res.status}` } : e))
        );
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      const toolUses: ToolUseEntry[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const match = part.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
          if (!match) continue;

          const [, event, dataStr] = match;
          const data = JSON.parse(dataStr);

          if (event === "session") {
            setSessionId(data.id);
          }

          if (event === "text") {
            assistantText += data.text;
            setEntries((prev) =>
              prev.map((e) => (e.id === assistantId ? { ...e, content: assistantText } : e))
            );
          }

          if (event === "tool_use") {
            toolUses.push({ name: data.name, input: data.input });
            setEntries((prev) =>
              prev.map((e) => (e.id === assistantId ? { ...e, tools: [...toolUses] } : e))
            );
          }

          if (event === "tool_result") {
            const last = toolUses[toolUses.length - 1];
            if (last) last.result = data.result;
            setEntries((prev) =>
              prev.map((e) => (e.id === assistantId ? { ...e, tools: [...toolUses] } : e))
            );
          }

          if (event === "result") {
            if (data.sessionId) setSessionId(data.sessionId);
            if (data.text && !assistantText) {
              assistantText = data.text;
              setEntries((prev) =>
                prev.map((e) => (e.id === assistantId ? { ...e, content: assistantText } : e))
              );
            }
          }

          if (event === "error") {
            assistantText += `\n\n**Error:** ${data.text}`;
            setEntries((prev) =>
              prev.map((e) => (e.id === assistantId ? { ...e, content: assistantText } : e))
            );
          }
        }
      }
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === assistantId
            ? { ...e, content: `Erreur: ${err instanceof Error ? err.message : "Unknown"}` }
            : e
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId, localPath, issueNumber, issueTitle, issueBody]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#1E1E1E",
          maxWidth: 800,
          height: "80vh",
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <SmartToyRoundedIcon sx={{ color: "primary.main" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            Claude — #{issueNumber}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 350,
              color: "text.secondary",
            }}
          >
            {issueTitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <Chip
            icon={<FolderOpenRoundedIcon sx={{ fontSize: "14px !important" }} />}
            label={`${owner}/${repo}`}
            size="small"
            sx={{
              height: 24,
              fontSize: "0.7rem",
              bgcolor: "rgba(255,255,255,0.05)",
              "& .MuiChip-icon": { color: "text.secondary" },
            }}
          />
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2.5,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#3A3A3A", borderRadius: 3 },
        }}
      >
        {entries.length === 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              opacity: 0.5,
            }}
          >
            <SmartToyRoundedIcon sx={{ fontSize: 40, color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              Ask Claude to work on this issue
            </Typography>
          </Box>
        )}

        {entries.map((entry) => (
          <Box key={entry.id}>
            {entry.type === "user" && (
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Box
                  sx={{
                    bgcolor: alpha("#7C5CFF", 0.15),
                    borderRadius: 1,
                    borderBottomRightRadius: 4,
                    px: 2,
                    py: 1.5,
                    maxWidth: "80%",
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {entry.content}
                  </Typography>
                </Box>
              </Box>
            )}

            {entry.type === "assistant" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {entry.tools && entry.tools.length > 0 && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                    {entry.tools.map((tool, i) => (
                      <Box
                        key={i}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.75,
                          py: 0.5,
                          px: 1.5,
                          borderRadius: 1,
                          bgcolor: alpha("#F59E0B", 0.06),
                          width: "fit-content",
                        }}
                      >
                        <BuildRoundedIcon sx={{ fontSize: 13, color: "warning.main" }} />
                        <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 500 }}>
                          {tool.name}
                        </Typography>
                        {tool.input && typeof tool.input === "object" && "file_path" in (tool.input as Record<string, unknown>) ? (
                          <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "0.7rem" }}>
                            {String((tool.input as Record<string, unknown>).file_path)}
                          </Typography>
                        ) : null}
                        {tool.input && typeof tool.input === "object" && "command" in (tool.input as Record<string, unknown>) ? (
                          <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "0.7rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {String((tool.input as Record<string, unknown>).command)}
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Box>
                )}

                {entry.content && (
                  <Box
                    sx={{
                      bgcolor: "rgba(255,255,255,0.04)",
                      borderRadius: 1,
                      borderBottomLeftRadius: 4,
                      px: 2,
                      py: 1.5,
                      maxWidth: "85%",
                      ...markdownSx,
                    }}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {entry.content}
                    </ReactMarkdown>
                  </Box>
                )}

                {!entry.content && (!entry.tools || entry.tools.length === 0) && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1 }}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">
                      Claude is thinking...
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        ))}

        {loading && entries.length > 0 && entries[entries.length - 1]?.type === "user" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Claude is thinking...
            </Typography>
          </Box>
        )}

        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          placeholder="Message Claude..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          multiline
          maxRows={4}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    sx={{ color: input.trim() ? "primary.main" : "text.secondary" }}
                  >
                    <SendRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
              sx: {
                bgcolor: "rgba(255,255,255,0.04)",
                borderRadius: 1,
                "&.Mui-focused": { bgcolor: "rgba(255,255,255,0.06)" },
              },
            },
          }}
        />
      </Box>
    </Dialog>
  );
}
