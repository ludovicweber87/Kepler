import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude } from '../helpers.js';
import { makePromptQueue, type PromptQueue } from './promptQueue.js';
import { mapMessage } from './mapMessage.js';
import { createPermissionController, type PermissionController, type PendingPermission } from './permissions.js';
import type { PermissionDecision } from './types.js';
import * as transcript from './transcriptStore.js';
import { deriveLogs } from './activityDeriver.js';
import { getDb } from '../db.js';
import { randomUUID } from 'node:crypto';

export interface StreamSocket { send(data: string): void; readyState?: number }
export interface StartParams { cwd: string; systemPrompt?: string; model?: string; effort?: string; permissionMode?: string; resumeClaudeSessionId?: string }
export type QueryFn = typeof realQuery;

interface QueryLike extends AsyncIterable<unknown> {
  setModel?(model?: string): Promise<void>;
  setPermissionMode?(mode: string): Promise<void>;
  applyFlagSettings?(settings: unknown): Promise<void>;
  interrupt?(): Promise<unknown>;
  return?(v?: unknown): Promise<IteratorResult<unknown>>;
}

interface SessionState {
  q: QueryLike;
  queue: PromptQueue;
  perms: PermissionController;
  clients: Set<StreamSocket>;
  claudeSessionId: string | null;
  model: string; effort: string; permissionMode: string;
  busy: boolean;
  closed: boolean;
  seq: number;
}

function cleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  return env;
}

export function createSdkAgentManager(deps?: { queryFn?: QueryFn }) {
  const queryFn = deps?.queryFn ?? realQuery;
  const sessions = new Map<string, SessionState>();

  function send(ws: StreamSocket, payload: unknown) {
    if (ws.readyState === undefined || ws.readyState === 1) {
      try { ws.send(JSON.stringify(payload)); } catch { /* socket mort */ }
    }
  }
  function broadcast(s: SessionState, payload: unknown) {
    for (const ws of s.clients) send(ws, payload);
  }
  function readyPayload(s: SessionState, attached: boolean) {
    return {
      type: 'stream-ready',
      attached,
      claudeSessionId: s.claudeSessionId,
      model: s.model, effort: s.effort, permissionMode: s.permissionMode,
      busy: s.busy,
      pendingPermissions: s.perms.snapshot(),
    };
  }

  async function runLoop(sessionId: string, s: SessionState) {
    try {
      for await (const msg of s.q) {
        for (const ev of mapMessage(msg as never)) {
          if (ev.event === 'session') {
            s.claudeSessionId = ev.data.id;
            persistClaudeSessionId(sessionId, ev.data.id);
          }
          if (ev.event === 'result') s.busy = false;
          const seq = s.seq++;
          const role = ev.event === 'tool_result' ? 'tool'
            : ev.event === 'thinking' || ev.event === 'assistant' || ev.event === 'tool_use' ? 'assistant'
            : 'system';
          transcript.appendEvent(sessionId, seq, role, ev);
          for (const log of deriveLogs(ev)) writeActivityLog(sessionId, log.log_type, log.content);
          broadcast(s, { type: 'stream-event', seq, ...ev });
        }
      }
      if (!s.closed) broadcast(s, { type: 'stream-closed', reason: 'generator-ended' });
    } catch (err) {
      if (!s.closed) broadcast(s, { type: 'stream-error', message: err instanceof Error ? err.message : String(err), fatal: true });
    } finally {
      s.perms.abortAll();
      sessions.delete(sessionId);
    }
  }

  function persistClaudeSessionId(sessionId: string, claudeId: string) {
    const d = getDb();
    if (!d) return;
    try {
      d.prepare('UPDATE agent_sessions SET claude_session_id = ? WHERE session_id = ? AND (claude_session_id IS NULL OR claude_session_id != ?)')
        .run(claudeId, sessionId, claudeId);
    } catch { /* best-effort */ }
  }
  function readClaudeSessionId(sessionId: string): string | null {
    const d = getDb();
    if (!d) return null;
    try {
      const row = d.prepare('SELECT claude_session_id AS c FROM agent_sessions WHERE session_id = ?').get(sessionId) as { c: string | null } | undefined;
      return row?.c ?? null;
    } catch { return null; }
  }
  function writeActivityLog(sessionId: string, logType: string, content: string) {
    const d = getDb();
    if (!d) return;
    try {
      const row = d.prepare('SELECT id FROM agent_sessions WHERE session_id = ?').get(sessionId) as { id: string } | undefined;
      if (!row) return;
      d.prepare('INSERT INTO agent_activity_logs (id, agent_session_id, content, log_type) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), row.id, content, logType);
    } catch { /* best-effort */ }
  }

  return {
    has(sessionId: string) { return sessions.has(sessionId); },

    startOrAttach(sessionId: string, ws: StreamSocket, params: StartParams) {
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.clients.add(ws);
        send(ws, { type: 'stream-history', events: transcript.loadTranscript(sessionId) });
        send(ws, readyPayload(existing, true));
        return;
      }
      const queue = makePromptQueue();
      const s: SessionState = {
        q: undefined as unknown as QueryLike,
        queue,
        perms: createPermissionController((req: PendingPermission) => broadcast(s, { type: 'stream-permission-request', ...req })),
        clients: new Set([ws]),
        claudeSessionId: null,
        model: params.model ?? '', effort: params.effort ?? '', permissionMode: params.permissionMode ?? 'acceptEdits',
        busy: false,
        closed: false,
        seq: transcript.nextSeq(sessionId),
      };
      const options: Record<string, unknown> = {
        cwd: params.cwd,
        pathToClaudeCodeExecutable: findClaude(),
        env: cleanEnv(),
        permissionMode: s.permissionMode,
        canUseTool: s.perms.canUseTool,
      };
      if (params.model) options.model = params.model;
      if (params.effort) options.effort = params.effort;
      if (params.systemPrompt) options.systemPrompt = params.systemPrompt;
      const resumeId = params.resumeClaudeSessionId ?? readClaudeSessionId(sessionId);
      if (resumeId) options.resume = resumeId;

      s.q = queryFn({ prompt: queue.iterable, options } as never) as unknown as QueryLike;
      sessions.set(sessionId, s);
      send(ws, { type: 'stream-history', events: transcript.loadTranscript(sessionId) });
      send(ws, readyPayload(s, false));
      void runLoop(sessionId, s);
    },

    sendUserMessage(sessionId: string, text: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.busy = true;
      s.queue.push(text);
    },
    setModel(sessionId: string, model?: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.model = model ?? '';
      void s.q.setModel?.(model)?.catch(() => {});
    },
    setEffort(sessionId: string, effort: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.effort = effort;
      // Pas de q.setEffort ; on tente applyFlagSettings (à valider en intégration).
      void s.q.applyFlagSettings?.({ effort })?.catch(() => {});
    },
    setPermissionMode(sessionId: string, mode: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.permissionMode = mode;
      void s.q.setPermissionMode?.(mode)?.catch(() => {});
    },
    interrupt(sessionId: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.perms.abortAll();
      void s.q.interrupt?.()?.catch(() => {});
    },
    resolvePermission(sessionId: string, id: string, decision: PermissionDecision) {
      sessions.get(sessionId)?.perms.resolve(id, decision);
    },
    detach(sessionId: string, ws: StreamSocket) {
      sessions.get(sessionId)?.clients.delete(ws);
    },
    stop(sessionId: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.closed = true;
      s.perms.abortAll();
      s.queue.close();
      void s.q.return?.()?.catch(() => {});
      broadcast(s, { type: 'stream-closed', reason: 'stopped' });
      sessions.delete(sessionId);
    },
  };
}
