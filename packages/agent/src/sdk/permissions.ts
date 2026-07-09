import type { PermissionDecision } from './types.js';

export interface PendingPermission { id: string; toolName: string; input: Record<string, unknown>; title?: string; displayName?: string }
export type PermissionResultLike = { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: unknown[] } | { behavior: 'deny'; message: string };
export interface PermissionController {
  canUseTool: (toolName: string, input: Record<string, unknown>, options: { signal?: AbortSignal; suggestions?: unknown[]; title?: string; displayName?: string }) => Promise<PermissionResultLike>;
  resolve(id: string, decision: PermissionDecision): boolean;
  abortAll(): void;
  snapshot(): PendingPermission[];
}

interface Entry { req: PendingPermission; resolve: (r: PermissionResultLike) => void; suggestions?: unknown[]; input: Record<string, unknown> }

// Outils d'édition locale : auto-autorisés en mode acceptEdits.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export function createPermissionController(broadcast: (req: PendingPermission) => void, getMode: () => string = () => ''): PermissionController {
  const pending = new Map<string, Entry>();
  let counter = 0;

  const DENY_USER: PermissionResultLike = { behavior: 'deny', message: "Refusé par l'utilisateur" };
  const DENY_ABORT: PermissionResultLike = { behavior: 'deny', message: 'Interrompu' };

  return {
    canUseTool(toolName, input, options) {
      if (options.signal?.aborted) return Promise.resolve(DENY_ABORT);
      // Le chip "mode" est autoritaire : il court-circuite la carte de permission.
      const mode = getMode();
      if (mode === 'bypassPermissions') return Promise.resolve({ behavior: 'allow', updatedInput: input });
      if (mode === 'acceptEdits' && EDIT_TOOLS.has(toolName)) return Promise.resolve({ behavior: 'allow', updatedInput: input });
      const id = `perm-${++counter}`;
      const req: PendingPermission = { id, toolName, input, title: options.title, displayName: options.displayName };
      return new Promise<PermissionResultLike>((resolve) => {
        pending.set(id, { req, resolve, suggestions: options.suggestions, input });
        options.signal?.addEventListener('abort', () => {
          if (pending.delete(id)) resolve(DENY_ABORT);
        });
        broadcast(req);
      });
    },
    resolve(id, decision) {
      const entry = pending.get(id);
      if (!entry) return false;
      pending.delete(id);
      // updatedInput est requis pour que le SDK ré-exécute réellement l'outil.
      if (decision === 'allow-once') entry.resolve({ behavior: 'allow', updatedInput: entry.input });
      else if (decision === 'allow-always') entry.resolve({ behavior: 'allow', updatedInput: entry.input, updatedPermissions: entry.suggestions });
      else entry.resolve(DENY_USER);
      return true;
    },
    abortAll() {
      for (const [, entry] of pending) entry.resolve(DENY_ABORT);
      pending.clear();
    },
    snapshot() {
      return [...pending.values()].map((e) => e.req);
    },
  };
}
