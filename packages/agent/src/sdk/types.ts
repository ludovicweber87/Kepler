export type StreamEvent =
  | { event: 'session'; data: { id: string; model: string; permissionMode: string; cwd: string; tools: string[] } }
  | { event: 'thinking'; data: { text: string } }
  | { event: 'assistant'; data: { text: string } }
  | { event: 'tool_use'; data: { id: string; name: string; input: unknown } }
  | { event: 'tool_result'; data: { tool_use_id: string; content: unknown; truncated?: boolean } }
  | { event: 'result'; data: { is_error: boolean; text: string; session_id: string; num_turns: number; usage: unknown; total_cost_usd: number } };

export type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';
