import type { StreamEvent } from './types.js';

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export function deriveLogs(event: StreamEvent): { log_type: string; content: string }[] {
  if (event.event === 'tool_use') {
    const { name, input } = event.data;
    const inp = (input ?? {}) as Record<string, unknown>;
    if (FILE_TOOLS.has(name)) {
      const path = String(inp.file_path ?? inp.path ?? name);
      return [{ log_type: 'file_change', content: path }];
    }
    if (name === 'Bash') {
      const cmd = String(inp.command ?? '');
      if (/\bgit\s+commit\b/.test(cmd)) {
        const m = cmd.match(/-m\s+["']([^"']+)["']/);
        return [{ log_type: 'commit', content: m ? m[1] : cmd }];
      }
      return [{ log_type: 'info', content: cmd.slice(0, 200) }];
    }
    return [];
  }
  if (event.event === 'tool_result') {
    return []; // les erreurs d'outil sont visibles dans le chat ; pas de doublon de log ici
  }
  if (event.event === 'result') {
    // Le résumé concis de fin de tour est produit séparément (turnSummarizer).
    // Ici on ne remonte que les erreurs.
    return event.data.is_error ? [{ log_type: 'error', content: event.data.text }] : [];
  }
  return [];
}
