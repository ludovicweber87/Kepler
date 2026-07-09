/**
 * Intégration : en permissionMode 'default', une demande d'écriture doit
 * déclencher stream-permission-request ; on répond allow-once et on attend
 * le result. Sortie non-zéro si pas de permission-request observée.
 *
 * Usage : node packages/agent/scripts/it-permission.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 4598;
const cwd = mkdtempSync(join(tmpdir(), 'devora-itp-'));
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, DEVORA_AGENT_PORT: String(PORT) },
  stdio: 'inherit',
});
const done = (code) => { server.kill('SIGTERM'); process.exit(code); };
process.on('exit', () => server.kill('SIGTERM'));
await new Promise((r) => setTimeout(r, 1500));

const ws = new WebSocket(`ws://localhost:${PORT}`);
let sawPermission = false;
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'stream-init', sessionId: 'itp-1', cwd, permissionMode: 'default', model: 'claude-sonnet-4-5' }));
  ws.send(JSON.stringify({ type: 'stream-user-message', sessionId: 'itp-1', text: "Crée un fichier a.txt contenant 'ok' dans le répertoire courant." }));
});
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === 'stream-permission-request') {
    sawPermission = true;
    console.log('[itp] permission-request:', m.toolName ?? m.displayName);
    ws.send(JSON.stringify({ type: 'stream-permission-response', sessionId: 'itp-1', id: m.id, decision: 'allow-once' }));
  }
  if (m.type === 'stream-event' && m.event === 'result') {
    console.log(sawPermission ? '[itp] OK flux de permission' : '[itp] ÉCHEC (pas de permission-request)');
    ws.close();
    done(sawPermission ? 0 : 1);
  }
});
ws.on('error', (e) => { console.error('[itp] ws error', e.message); done(1); });
setTimeout(() => { console.error('[itp] timeout'); done(1); }, 120_000);
