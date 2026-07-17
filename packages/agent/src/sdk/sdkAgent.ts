import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude } from '../helpers.js';
import { makePromptQueue, type PromptQueue } from './promptQueue.js';
import { mapMessage } from './mapMessage.js';
import { createPermissionController, type PermissionController, type PendingPermission, type PendingQuestion, type QuestionAnswers } from './permissions.js';
import type { PermissionDecision } from './types.js';
import * as transcript from './transcriptStore.js';
import { deriveLogs } from './activityDeriver.js';
import { getDb } from '../db.js';
import { randomUUID } from 'node:crypto';
import { saveAttachment, extForMediaType } from './attachments.js';
import type { ChatImageInput } from './promptQueue.js';

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
  cwd: string;
  createdAt: number;
}

export interface ActiveSdkSession { sessionId: string; cwd: string; createdAt: number; busy: boolean }

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
      pendingQuestions: s.perms.snapshotQuestions(),
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

    // Sessions SDK vivantes (chat modal) — pas de tmux, invisibles sinon dans "actifs".
    listActive(): ActiveSdkSession[] {
      return [...sessions.entries()].map(([sessionId, s]) => ({
        sessionId, cwd: s.cwd, createdAt: s.createdAt, busy: s.busy,
      }));
    },

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
        perms: createPermissionController((req: PendingPermission) => broadcast(s, { type: 'stream-permission-request', ...req }), () => s.permissionMode, (req: PendingQuestion) => broadcast(s, { type: 'stream-question-request', ...req })),
        clients: new Set([ws]),
        claudeSessionId: null,
        model: params.model ?? '', effort: params.effort ?? '', permissionMode: params.permissionMode ?? 'bypassPermissions',
        busy: false,
        closed: false,
        seq: transcript.nextSeq(sessionId),
        cwd: params.cwd,
        createdAt: Date.now(),
      };
      const options: Record<string, unknown> = {
        cwd: params.cwd,
        pathToClaudeCodeExecutable: findClaude(),
        env: cleanEnv(),
        permissionMode: s.permissionMode,
        // Requis par le SDK pour autoriser le mode 'bypassPermissions' (défaut :
        // l'agent n'invite jamais à confirmer), au démarrage comme via le chip.
        allowDangerouslySkipPermissions: true,
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

    sendUserMessage(sessionId: string, text: string, images?: ChatImageInput[]) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.busy = true;
      // Persiste le tour utilisateur dans le transcript (rejouable au refresh) et
      // l'émet aux clients : c'est l'écho serveur qui fait foi, pas d'optimiste client.
      // Les pièces jointes sont écrites sur disque ; seuls {name,url} vont en DB (pas de base64).
      // Type non supporté rejeté une seule fois, en amont : ni persisté, ni transmis au SDK
      // (un media_type invalide ferait rejeter tout le tour par l'API Anthropic).
      const validImages = (images ?? []).filter((img) => extForMediaType(img.mediaType) !== null);
      const saved: { name: string; url: string }[] = [];
      for (const img of validImages) {
        const res = saveAttachment(sessionId, img.mediaType, img.data);
        if (res) saved.push({ name: img.name, url: res.url });
      }
      const seq = s.seq++;
      const ev = {
        event: 'user',
        data: { text, ...(saved.length ? { images: saved } : {}) },
      } as const;
      transcript.appendEvent(sessionId, seq, 'user', ev);
      broadcast(s, { type: 'stream-event', seq, ...ev });
      s.queue.push(text, validImages);
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
      // Pas de setter dédié : la clé Settings est `effortLevel` (low|medium|high|xhigh).
      // 'max' n'existe pas côté live (uniquement à l'init via Options.effort) → clamp xhigh.
      const effortLevel = effort === 'max' ? 'xhigh' : effort;
      void s.q.applyFlagSettings?.({ effortLevel })?.catch(() => {});
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
      s.busy = false;
      void s.q.interrupt?.()?.catch(() => {});
      // Le SDK n'émet pas toujours de `result` après une interruption ; on notifie
      // explicitement pour que le composer repasse en idle (reprise possible).
      broadcast(s, { type: 'stream-event', seq: s.seq++, event: 'result', data: { interrupted: true } });
    },
    resolvePermission(sessionId: string, id: string, decision: PermissionDecision) {
      sessions.get(sessionId)?.perms.resolve(id, decision);
    },
    resolveQuestion(sessionId: string, id: string, answers: QuestionAnswers) {
      sessions.get(sessionId)?.perms.resolveQuestion(id, answers);
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
