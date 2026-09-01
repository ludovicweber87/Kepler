export type StreamEvent =
  | { event: 'session'; data: { id: string; model: string; permissionMode: string; cwd: string; tools: string[] } }
  | {
      event: 'user';
      data: {
        text: string;
        images?: { name: string; url: string }[];
        files?: { name: string; url: string; mediaType: string }[];
      };
    }
  | { event: 'thinking'; data: { text: string } }
  | { event: 'assistant'; data: { text: string } }
  | { event: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { event: 'tool_result'; data: { tool_use_id: string; content: unknown; truncated?: boolean } }
  | { event: 'role_switch'; data: { name: string } }
  | { event: 'result'; data: { is_error: boolean; text: string; session_id: string; num_turns: number; usage: unknown; total_cost_usd: number } };

export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';

/**
 * Événements transitoires : diffusés aux clients pour le rendu « vivant » du tour
 * en cours (tokens, progression d'outil, retry API), jamais persistés ni
 * séquencés. Le bloc complet correspondant arrive ensuite en `StreamEvent` et
 * fait autorité — un client qui les ignore ne perd rien.
 */
export type StreamDelta =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_progress'; toolUseId: string; toolName: string; elapsedSeconds: number }
  | { kind: 'api_retry'; attempt: number; maxRetries: number; delayMs: number };
