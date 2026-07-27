import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb } from '../db.js';
import { NOW_ISO } from '../helpers.js';
import { createDocToolServer } from './docTools.js';
import {
  buildDocChatSystemPrompt,
  buildScopeNote,
  buildDocToolGate,
  type DocGuardrailInput,
} from './docGuardrails.js';
import type { StartParams } from './sdkAgent.js';
import type { DocSourceType } from './docWriter.js';

interface DocRow {
  id: string;
  title: string;
  subject: string;
  source_type: DocSourceType;
  repo_full_name: string | null;
}

/** Identité d'une session doc. Dérivée du docId, jamais reçue du client. */
export function docSessionIdFor(docId: string): string {
  return `doc-${docId}`;
}

function loadDoc(docId: string): DocRow | null {
  const db = getDb();
  if (!db) return null;
  return (
    (db
      .prepare('SELECT id, title, subject, source_type, repo_full_name FROM docs WHERE id = ?')
      .get(docId) as DocRow | undefined) ?? null
  );
}

function repoLocalPath(repoFullName: string): string | null {
  const db = getDb();
  if (!db) return null;
  const row = db
    .prepare('SELECT local_path FROM repo_paths WHERE lower(repo_full_name) = lower(?)')
    .get(repoFullName) as { local_path?: string } | undefined;
  return row?.local_path ?? null;
}

function scratchDir(docId: string): string {
  const dir = join(tmpdir(), 'devora-docs', docId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Crée la ligne `agent_sessions` de la doc si besoin et rétablit le lien
 * `docs.agent_session_id`. Appelée à CHAQUE ouverture de chat : c'est le seul
 * point de création depuis que `generateDoc` ne la crée plus — une doc en échec
 * de génération doit quand même pouvoir ouvrir son chat.
 */
export function ensureDocSessionRow(doc: DocRow, cwd: string): string {
  const sessionId = docSessionIdFor(doc.id);
  const db = getDb();
  if (!db) return sessionId;
  const existing = db.prepare('SELECT id FROM agent_sessions WHERE session_id = ?').get(sessionId) as
    | { id: string }
    | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO agent_sessions (id, session_id, project_path, project_name, agent_name, status, origin, started_at)
       VALUES (?, ?, ?, ?, ?, 'ready', 'doc', ${NOW_ISO})`,
    ).run(randomUUID(), sessionId, cwd, doc.title, doc.title);
  }
  db.prepare('UPDATE docs SET agent_session_id = ? WHERE id = ?').run(sessionId, doc.id);
  return sessionId;
}

/**
 * Assemble tout ce qui porte une garantie : cwd, prompt système, outils MCP,
 * portail d'outils, note de périmètre. Rien de tout ça ne vient du client —
 * il n'envoie que le docId.
 */
export function buildDocStartParams(docId: string): { sessionId: string; params: StartParams } | null {
  const doc = loadDoc(docId);
  if (!doc) return null;

  const repoPath =
    doc.source_type === 'repo' && doc.repo_full_name ? repoLocalPath(doc.repo_full_name) : null;
  const cwd = repoPath ?? scratchDir(doc.id);
  const sessionId = ensureDocSessionRow(doc, cwd);

  const guard: DocGuardrailInput = {
    title: doc.title,
    subject: doc.subject,
    source_type: doc.source_type,
    repoFullName: doc.repo_full_name,
    // Gate sur le path RÉELLEMENT résolu : un scratch dir vide donnerait des
    // recherches vides que le modèle lirait comme « le code ne contient pas ça ».
    repoResolved: repoPath !== null,
  };

  return {
    sessionId,
    params: {
      cwd,
      systemPrompt: buildDocChatSystemPrompt(guard),
      permissionMode: 'bypassPermissions',
      mcpServers: { doc: createDocToolServer(docId) },
      toolGate: buildDocToolGate(guard),
      scopeNote: buildScopeNote(guard),
      isDocSession: true,
    },
  };
}
