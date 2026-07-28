import { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { readBody, sendSSE, startSSE, sendError, findClaude, cleanClaudeEnv } from '../helpers.js';

export async function handleChatRoutes(req: IncomingMessage, res: ServerResponse) {
	try {
		const { prompt, cwd, sessionId } = await readBody<{
			prompt: string;
			cwd: string;
			sessionId?: string;
		}>(req);

		if (!prompt || !cwd) return sendError(res, 'prompt and cwd are required', 400);

		const CLAUDE_BIN = findClaude();
		const args = ['-p', prompt, '--output-format', 'stream-json', '--dangerously-skip-permissions'];

		if (sessionId) {
			args.push('--resume', sessionId);
		}

		startSSE(res);

		const proc = spawn(CLAUDE_BIN, args, {
			cwd,
			env: {
				...cleanClaudeEnv(),
				PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
			} as NodeJS.ProcessEnv,
		});

		let buffer = '';

		proc.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const msg = JSON.parse(line);

					if (msg.session_id) {
						sendSSE(res, 'session', { id: msg.session_id });
					}

					// Incremental streaming deltas
					if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') {
						sendSSE(res, 'text', { text: msg.delta.text });
					}

					if (msg.type === 'assistant' && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === 'tool_use') {
								sendSSE(res, 'tool_use', { name: block.name, input: block.input });
							}
						}
					}

					if (msg.type === 'tool' && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === 'tool_result') {
								sendSSE(res, 'tool_result', {
									name: block.tool_use_id,
									result:
										typeof block.content === 'string'
											? block.content.slice(0, 500)
											: JSON.stringify(block.content).slice(0, 500),
								});
							}
						}
					}

					if (msg.type === 'result') {
						sendSSE(res, 'result', {
							text: msg.result || '',
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

		proc.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString().trim();
			if (text) sendSSE(res, 'error', { text });
		});

		proc.on('close', () => {
			res.end();
		});

		proc.on('error', (err) => {
			sendSSE(res, 'error', { text: err.message });
			res.end();
		});
	} catch (err) {
		sendError(res, err instanceof Error ? err.message : 'Failed to start chat');
	}
}
