import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { findClaude } from '../helpers.js';
import { makePromptQueue, type PromptQueue } from './promptQueue.js';
import { mapMessage } from './mapMessage.js';
import { createPermissionController, type PermissionController, type PendingPermission, type PendingQuestion, type QuestionAnswers } from './permissions.js';
import type { PermissionDecision } from './types.js';
import * as transcript from './transcriptStore.js';
import { extractLastUserText } from './retryLastUser.js';
import { deriveLogs } from './activityDeriver.js';
import { summarizeTurn } from './turnSummarizer.js';
import { getDb } from '../db.js';
import { buildNotification } from '../notifications/build.js';
import { insertAndEmit } from '../notifications/insert.js';
import { randomUUID } from 'node:crypto';
import { saveAttachment, extForMediaType } from './attachments.js';
import type { ChatImageInput } from './promptQueue.js';
import {
  autoRenameBranch,
  isAutoNamed,
  moveWorktreeDir,
  persistWorktreePath,
  readSessionRow,
} from './autoRename.js';

export interface StreamSocket { send(data: string): void; readyState?: number }
export interface StartParams { cwd: string; systemPrompt?: string; model?: string; effort?: string; permissionMode?: string; resumeClaudeSessionId?: string; mcpServers?: Record<string, unknown>; retryLastUser?: boolean; observeOnly?: boolean; initialPrompt?: string }
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
  turnActions: string[];
  systemPrompt?: string;
  mcpServers?: Record<string, unknown>;
  // Auto-rename : époque du runLoop (invalide l'ancien loop après un restart),
  // génération LLM en cours, et move de worktree différé au prochain idle.
  epoch: number;
  renameInFlight: boolean;
  pendingMove?: { newName: string };
  // Changement de persona demandé pendant un tour : restart différé au prochain idle.
  pendingSystemPrompt?: boolean;
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

  // Reprise d'un run interrompu : si le dernier event persisté est un message
  // user resté sans réponse, on re-pousse son texte dans la queue SDK. Pas
  // d'appendEvent ni de broadcast 'user' → aucune bulle dupliquée (elle est déjà
  // dans le transcript rejoué). No-op si l'agent est déjà occupé.
  function maybeRetryLastUser(s: SessionState, history: { seq: number; event: import('./types.js').StreamEvent }[]) {
    if (s.busy) return;
    const text = extractLastUserText(history);
    if (!text) return;
    s.busy = true;
    s.queue.push(text);
  }

  async function runLoop(sessionId: string, s: SessionState) {
    const epoch = s.epoch;
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
          for (const log of deriveLogs(ev)) {
            writeActivityLog(sessionId, log.log_type, log.content);
            if (log.log_type === 'file_change' || log.log_type === 'commit' || log.log_type === 'info') {
              (s.turnActions ??= []).push(`${log.log_type}: ${log.content}`);
            }
          }
          if (ev.event === 'result') {
            const actions = s.turnActions ?? [];
            s.turnActions = [];
            if (!ev.data.is_error) {
              const finalText = ev.data.text;
              // Non bloquant : n'attend pas la synthèse pour rendre la main.
              void summarizeTurn(finalText, actions).then((sum) =>
                writeActivityLog(sessionId, 'summary', sum),
              );
            }
            try {
              const type = ev.data.is_error ? 'agent_error' : 'agent_done';
              insertAndEmit(getDb(), buildNotification({
                type,
                title: '',
                url: `/workbench?session=${sessionId}`,
                entityRef: { kind: 'session', id: sessionId },
                payload: { session: sessionId },
                dedupeParts: [sessionId, String(ev.data.num_turns)],
              }));
            } catch (err) { console.error('[notifications] agent result notif failed', err); }
          }
          broadcast(s, { type: 'stream-event', seq, ...ev });
          // Fin de tour + move en attente → on déplace le dossier du worktree
          // maintenant que la session est idle, puis on redémarre le query SDK
          // avec le nouveau cwd (resume → contexte préservé, transparent client).
          if (ev.event === 'result' && s.pendingMove && !s.busy) {
            const { newName } = s.pendingMove;
            s.pendingMove = undefined;
            void applyWorktreeMove(sessionId, s, newName);
          }
          // Changement de persona demandé pendant le tour : restart soft maintenant
          // que la session est idle (le move, s'il y en a un, l'a déjà couvert).
          else if (ev.event === 'result' && s.pendingSystemPrompt && !s.busy) {
            s.pendingSystemPrompt = false;
            void restartQuery(sessionId, s).catch((err) =>
              console.error('[persona] restart du query SDK a échoué :', err),
            );
          }
        }
      }
      if (!s.closed && epoch === s.epoch) broadcast(s, { type: 'stream-closed', reason: 'generator-ended' });
    } catch (err) {
      if (!s.closed && epoch === s.epoch) broadcast(s, { type: 'stream-error', message: err instanceof Error ? err.message : String(err), fatal: true });
    } finally {
      // Un restart (auto-rename) incrémente l'époque : l'ancien loop ne doit
      // alors ni tuer les permissions ni retirer la session de la map.
      if (epoch === s.epoch) {
        s.perms.abortAll();
        sessions.delete(sessionId);
      }
    }
  }

  /** Options du query SDK, reconstruites depuis l'état courant de la session. */
  function buildQueryOptions(s: SessionState, cwd: string, resumeId: string | null): Record<string, unknown> {
    const options: Record<string, unknown> = {
      cwd,
      pathToClaudeCodeExecutable: findClaude(),
      env: cleanEnv(),
      permissionMode: s.permissionMode,
      // Requis par le SDK pour autoriser le mode 'bypassPermissions' (défaut :
      // l'agent n'invite jamais à confirmer), au démarrage comme via le chip.
      allowDangerouslySkipPermissions: true,
      canUseTool: s.perms.canUseTool,
    };
    if (s.model) options.model = s.model;
    if (s.effort) options.effort = s.effort;
    if (s.systemPrompt) options.systemPrompt = s.systemPrompt;
    if (s.mcpServers) options.mcpServers = s.mcpServers;
    if (resumeId) options.resume = resumeId;
    return options;
  }

  /**
   * Restart soft du query SDK avec un nouveau cwd : nouvelle queue (les messages
   * arrivés pendant le restart y sont bufferisés), fermeture propre de l'ancien
   * query, relance avec `resume` → le contexte de conversation est préservé.
   */
  async function restartQuery(sessionId: string, s: SessionState, newCwd: string = s.cwd) {
    s.epoch++;
    const oldQ = s.q;
    const oldQueue = s.queue;
    s.queue = makePromptQueue();
    s.cwd = newCwd;
    oldQueue.close();
    try { await oldQ.return?.(); } catch { /* ignore */ }
    const resumeId = s.claudeSessionId ?? readClaudeSessionId(sessionId);
    // Tout restart relance le query avec l'état courant (dont systemPrompt) via
    // buildQueryOptions : le changement de persona en attente est donc appliqué.
    s.pendingSystemPrompt = false;
    s.q = queryFn({ prompt: s.queue.iterable, options: buildQueryOptions(s, newCwd, resumeId) } as never) as unknown as QueryLike;
    sessions.set(sessionId, s);
    void runLoop(sessionId, s);
    broadcast(s, readyPayload(s, true));
  }

  /**
   * Applique le move différé : `git worktree move` + DB + restart du query.
   * Si un nouveau tour a démarré entre-temps, re-diffère au prochain idle.
   * Échec du move → warn, la branche garde son nom, le dossier reste (dégradation douce).
   */
  async function applyWorktreeMove(sessionId: string, s: SessionState, newName: string): Promise<string | null> {
    if (s.busy) { s.pendingMove = { newName }; return null; }
    const row = readSessionRow(sessionId);
    if (!row?.worktree_path) return null;
    const newPath = moveWorktreeDir(row.worktree_path, newName);
    if (!newPath) return null;
    persistWorktreePath(row.id, newPath);
    try {
      await restartQuery(sessionId, s, newPath);
    } catch (err) {
      console.error('[autoRename] restart du query SDK a échoué :', err);
    }
    return newPath;
  }

  /**
   * Déclenche la génération de nom (async, en parallèle du tour) si la branche
   * de la session est encore auto-générée (`wip-`). Échec → silencieux, on
   * retentera au prochain message utilisateur.
   */
  function maybeStartAutoRename(sessionId: string, s: SessionState) {
    if (s.renameInFlight || s.pendingMove) return;
    const row = readSessionRow(sessionId);
    if (!row || !isAutoNamed(row.branch) || !row.worktree_path) return;
    s.renameInFlight = true;
    void autoRenameBranch(sessionId, row)
      .then((newName) => {
        if (!newName) return;
        // Tour encore en cours → move différé à la fin de tour (runLoop) ;
        // session déjà idle → move immédiat.
        if (s.busy) s.pendingMove = { newName };
        else void applyWorktreeMove(sessionId, s, newName);
      })
      .catch(() => { /* retentera au prochain message */ })
      .finally(() => { s.renameInFlight = false; });
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
        const history = transcript.loadTranscript(sessionId);
        if (params.retryLastUser) maybeRetryLastUser(existing, history);
        send(ws, { type: 'stream-history', events: history });
        send(ws, readyPayload(existing, true));
        return;
      }
      // Observer attaching to a session that no longer lives (e.g. a pipeline
      // step just finished): replay the persisted transcript then close. Never
      // spin up a fresh SDK agent for a read-only observer.
      if (params.observeOnly) {
        send(ws, { type: 'stream-history', events: transcript.loadTranscript(sessionId) });
        send(ws, { type: 'stream-closed' });
        return;
      }
      const queue = makePromptQueue();
      const s: SessionState = {
        q: undefined as unknown as QueryLike,
        queue,
        perms: createPermissionController((req: PendingPermission) => broadcast(s, { type: 'stream-permission-request', ...req }), () => s.permissionMode, (req: PendingQuestion) => {
          broadcast(s, { type: 'stream-question-request', ...req });
          try {
            insertAndEmit(getDb(), buildNotification({
              type: 'agent_blocked',
              title: '',
              url: `/workbench?session=${sessionId}`,
              entityRef: { kind: 'session', id: sessionId },
              payload: { session: sessionId },
              dedupeParts: [sessionId, req.id],
            }));
          } catch (err) { console.error('[notifications] agent_blocked notif failed', err); }
        }),
        clients: new Set([ws]),
        claudeSessionId: null,
        model: params.model ?? '', effort: params.effort ?? '', permissionMode: params.permissionMode ?? 'bypassPermissions',
        busy: false,
        closed: false,
        seq: transcript.nextSeq(sessionId),
        cwd: params.cwd,
        createdAt: Date.now(),
        turnActions: [],
        systemPrompt: params.systemPrompt,
        mcpServers: params.mcpServers,
        epoch: 0,
        renameInFlight: false,
      };
      const resumeId = params.resumeClaudeSessionId ?? readClaudeSessionId(sessionId);
      const options = buildQueryOptions(s, params.cwd, resumeId ?? null);

      s.q = queryFn({ prompt: queue.iterable, options } as never) as unknown as QueryLike;
      sessions.set(sessionId, s);
      const history = transcript.loadTranscript(sessionId);
      if (params.retryLastUser) maybeRetryLastUser(s, history);
      send(ws, { type: 'stream-history', events: history });
      send(ws, readyPayload(s, false));
      void runLoop(sessionId, s);
      // Démarrage depuis une issue : injecte le prompt initial comme premier message
      // utilisateur, une seule fois (garde transcript vide → idempotent aux reconnexions
      // WS et aux redémarrages serveur, le message étant persisté dès l'envoi).
      if (params.initialPrompt && history.length === 0) {
        s.busy = true;
        const seq = s.seq++;
        const ev = { event: 'user', data: { text: params.initialPrompt } } as const;
        transcript.appendEvent(sessionId, seq, 'user', ev);
        broadcast(s, { type: 'stream-event', seq, ...ev });
        s.queue.push(params.initialPrompt, []);
        maybeStartAutoRename(sessionId, s);
      }
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
      maybeStartAutoRename(sessionId, s);
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
    /**
     * Changement de persona à chaud : le SDK n'a pas de setter du system prompt,
     * on le change donc via un restart soft avec `resume` (contexte préservé).
     * Aucun message n'est envoyé au modèle → zéro token consommé pour le switch.
     * Un event `role_switch` est persisté dans le transcript (marqueur visuel, non
     * transmis au modèle). Si l'agent travaille, le restart est différé au prochain idle.
     */
    setSystemPrompt(sessionId: string, prompt: string, personaName?: string) {
      const s = sessions.get(sessionId);
      if (!s) return;
      s.systemPrompt = prompt || undefined;
      if (personaName) {
        const seq = s.seq++;
        const ev = { event: 'role_switch', data: { name: personaName } } as const;
        transcript.appendEvent(sessionId, seq, 'system', ev);
        broadcast(s, { type: 'stream-event', seq, ...ev });
      }
      if (s.busy) {
        s.pendingSystemPrompt = true;
        return;
      }
      void restartQuery(sessionId, s).catch((err) =>
        console.error('[persona] restart du query SDK a échoué :', err),
      );
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
    /**
     * Move manuel (clic droit → renommer) sur une session SDK vivante : différé
     * en fin de tour si l'agent travaille, immédiat sinon. 'no-session' → le
     * caller (route git) fait le move lui-même, aucun process à ménager.
     */
    async requestWorktreeMove(sessionId: string, newName: string): Promise<{ status: 'moved' | 'deferred' | 'no-session'; worktreePath?: string }> {
      const s = sessions.get(sessionId);
      if (!s) return { status: 'no-session' };
      if (s.busy) {
        s.pendingMove = { newName };
        return { status: 'deferred' };
      }
      const newPath = await applyWorktreeMove(sessionId, s, newName);
      return newPath ? { status: 'moved', worktreePath: newPath } : { status: 'deferred' };
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
