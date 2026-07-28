/**
 * Intégration : lance le serveur agent, ouvre un WebSocket, exerce
 * stream-init → stream-user-message → assistant+result, puis un 2e tour
 * sur la même session (persistance). Sortie non-zéro si un assert échoue.
 *
 * Usage : node packages/agent/scripts/it-single-turn.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4599;
const cwd = mkdtempSync(join(tmpdir(), 'kepler-it-'));
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, KEPLER_AGENT_PORT: String(PORT) },
  stdio: 'inherit',
  detached: true,
});
const killServer = () => {
  if (!server.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
};
const done = (code) => { killServer(); process.exit(code); };
process.on('exit', killServer);

await new Promise((r) => setTimeout(r, 1500)); // laisser le serveur écouter

const ws = new WebSocket(`ws://localhost:${PORT}`);
const events = [];
let results = 0;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'stream-init', sessionId: 'it-1', cwd, permissionMode: 'plan', model: 'claude-sonnet-4-5' }));
  ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'it-1', text: 'Réponds exactement: pong' }));
});
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'stream-event') events.push(m.event);
  if (m.type === 'stream-event' && m.event === 'result') {
    results++;
    if (results === 1) {
      // 2e tour, même session
      ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'it-1', text: 'Réponds exactement: ping' }));
    } else {
      console.log('[it] events:', events.join(','));
      const ok = events.includes('session') && events.filter((e) => e === 'result').length === 2 && events.includes('assistant');
      console.log(ok ? '[it] OK tour unique + multi-tours' : '[it] ÉCHEC');
      ws.close();
      done(ok ? 0 : 1);
    }
  }
});
ws.on('error', (e) => { console.error('[it] ws error', e.message); done(1); });
setTimeout(() => { console.error('[it] timeout'); done(1); }, 120_000);
