import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as store from './transcriptStore.js';

// Injecte une DB en mémoire via le hook de test (voir implémentation __setDbForTests).
let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE agent_chat_messages (
    id TEXT PRIMARY KEY, agent_session_id TEXT NOT NULL, seq INTEGER NOT NULL,
    role TEXT NOT NULL, event_type TEXT NOT NULL, content TEXT, created_at TEXT);`);
  store.__setDbForTests(db);
});

test('nextSeq = 1 quand vide', () => {
  assert.equal(store.nextSeq('s1'), 1);
});

test('append puis load conserve l ordre par seq', () => {
  store.appendEvent('s1', 1, 'assistant', { event: 'assistant', data: { text: 'a' } });
  store.appendEvent('s1', 2, 'assistant', { event: 'assistant', data: { text: 'b' } });
  const rows = store.loadTranscript('s1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seq, 1);
  assert.deepEqual(rows[1].event, { event: 'assistant', data: { text: 'b' } });
  assert.equal(store.nextSeq('s1'), 3);
});

test('tool_result volumineux est tronqué avec marqueur', () => {
  const big = 'x'.repeat(60_000);
  store.appendEvent('s1', 1, 'tool', { event: 'tool_result', data: { tool_use_id: 't1', content: big } });
  const [row] = store.loadTranscript('s1');
  const data = (row.event as { data: { content: string; truncated?: boolean } }).data;
  assert.equal(data.truncated, true);
  assert.ok(data.content.length <= store.TRUNCATE_LIMIT);
});

test('isolation par session', () => {
  store.appendEvent('s1', 1, 'assistant', { event: 'assistant', data: { text: 'a' } });
  assert.equal(store.loadTranscript('s2').length, 0);
});
