import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StreamDelta, StreamEvent } from './types.js';

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

/**
 * Messages transitoires du SDK (`includePartialMessages`) → delta diffusable.
 * Renvoie `null` pour tout le reste. Les deltas de texte/réflexion d'un
 * sous-agent (`parent_tool_use_id` non nul) sont ignorés : ils s'entrelaceraient
 * avec ceux de l'agent principal dans le même brouillon côté client. Leurs blocs
 * complets continuent d'arriver via `mapMessage`, comme avant.
 */
export function mapDelta(msg: SDKMessage): StreamDelta | null {
  const anyMsg = msg as unknown as {
    type: string; subtype?: string; parent_tool_use_id?: string | null; [k: string]: unknown;
  };

  if (anyMsg.type === 'stream_event') {
    if (anyMsg.parent_tool_use_id) return null;
    const ev = anyMsg.event as { type?: string; delta?: Record<string, unknown> } | undefined;
    if (ev?.type !== 'content_block_delta') return null;
    const d = ev.delta ?? {};
    if (d.type === 'text_delta' && typeof d.text === 'string' && d.text)
      return { kind: 'text', text: d.text };
    if (d.type === 'thinking_delta' && typeof d.thinking === 'string' && d.thinking)
      return { kind: 'thinking', text: d.thinking };
    return null; // input_json_delta / signature_delta : rien à peindre
  }

  if (anyMsg.type === 'tool_progress') {
    return {
      kind: 'tool_progress',
      toolUseId: String(anyMsg.tool_use_id ?? ''),
      toolName: String(anyMsg.tool_name ?? ''),
      elapsedSeconds: Math.round(Number(anyMsg.elapsed_time_seconds ?? 0)),
    };
  }

  if (anyMsg.type === 'system' && anyMsg.subtype === 'api_retry') {
    return {
      kind: 'api_retry',
      attempt: Number(anyMsg.attempt ?? 0),
      maxRetries: Number(anyMsg.max_retries ?? 0),
      delayMs: Number(anyMsg.retry_delay_ms ?? 0),
    };
  }

  return null;
}
