import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../db.js';
import { NOW_ISO } from '../helpers.js';
import type { StreamEvent } from './types.js';

export const TRUNCATE_LIMIT = 50_000;

// Hook de test : permet d'injecter une DB en mémoire.
let _override: Database.Database | null = null;
export function __setDbForTests(db: Database.Database | null) { _override = db; }
function db(): Database.Database | null { return _override ?? getDb(); }

function truncateEvent(event: StreamEvent): StreamEvent {
  if (event.event !== 'tool_result') return event;
  const content = event.data.content;
  const str = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  if (str.length <= TRUNCATE_LIMIT) return event;
  return { event: 'tool_result', data: { ...event.data, content: str.slice(0, TRUNCATE_LIMIT), truncated: true } } as StreamEvent;
}

export function appendEvent(sessionId: string, seq: number, role: string, event: StreamEvent): void {
  const d = db();
  if (!d) return;
  const safe = truncateEvent(event);
  d.prepare(
    `INSERT INTO agent_chat_messages (id, agent_session_id, seq, role, event_type, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ${NOW_ISO})`,
  ).run(randomUUID(), sessionId, seq, role, safe.event, JSON.stringify(safe));
}

export function loadTranscript(sessionId: string): { seq: number; event: StreamEvent }[] {
  const d = db();
  if (!d) return [];
  const rows = d.prepare(
    'SELECT seq, content FROM agent_chat_messages WHERE agent_session_id = ? ORDER BY seq ASC',
  ).all(sessionId) as { seq: number; content: string }[];
  return rows.map((r) => ({ seq: r.seq, event: JSON.parse(r.content) as StreamEvent }));
}

export function nextSeq(sessionId: string): number {
  const d = db();
  if (!d) return 1;
  const row = d.prepare(
    'SELECT MAX(seq) AS m FROM agent_chat_messages WHERE agent_session_id = ?',
  ).get(sessionId) as { m: number | null };
  return (row?.m ?? 0) + 1;
}
