import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StreamEvent } from './types.js';

interface Block { type: string; [k: string]: unknown }

function blocksOf(msg: unknown): Block[] {
  const content = (msg as { message?: { content?: unknown } }).message?.content;
  return Array.isArray(content) ? (content as Block[]) : [];
}

export function mapMessage(msg: SDKMessage): StreamEvent[] {
  const anyMsg = msg as unknown as { type: string; subtype?: string; [k: string]: unknown };

  if (anyMsg.type === 'system' && anyMsg.subtype === 'init') {
    return [{
      event: 'session',
      data: {
        id: String(anyMsg.session_id ?? ''),
        model: String(anyMsg.model ?? ''),
        permissionMode: String(anyMsg.permissionMode ?? ''),
        cwd: String(anyMsg.cwd ?? ''),
        tools: Array.isArray(anyMsg.tools) ? (anyMsg.tools as string[]) : [],
      },
    }];
  }

  if (anyMsg.type === 'assistant') {
    const out: StreamEvent[] = [];
    for (const b of blocksOf(anyMsg)) {
      if (b.type === 'thinking') out.push({ event: 'thinking', data: { text: String(b.thinking ?? '') } });
      else if (b.type === 'text') out.push({ event: 'assistant', data: { text: String(b.text ?? '') } });
      else if (b.type === 'tool_use') out.push({ event: 'tool_use', data: { id: String(b.id ?? ''), name: String(b.name ?? ''), input: b.input } });
    }
    return out;
  }

  if (anyMsg.type === 'user') {
    const out: StreamEvent[] = [];
    for (const b of blocksOf(anyMsg)) {
      if (b.type === 'tool_result') out.push({ event: 'tool_result', data: { tool_use_id: String(b.tool_use_id ?? ''), content: b.content } });
    }
    return out;
  }

  if (anyMsg.type === 'result') {
    return [{
      event: 'result',
      data: {
        is_error: Boolean(anyMsg.is_error),
        text: String(anyMsg.result ?? ''),
        session_id: String(anyMsg.session_id ?? ''),
        num_turns: Number(anyMsg.num_turns ?? 0),
        usage: anyMsg.usage,
        total_cost_usd: Number(anyMsg.total_cost_usd ?? 0),
      },
    }];
  }

  return []; // tout le reste = bruit filtré
}
