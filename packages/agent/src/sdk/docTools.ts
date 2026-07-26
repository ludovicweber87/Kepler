import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDb } from '../db.js';

export type DocEditResult = { ok: true; content: string } | { ok: false; error: string };

/**
 * Retouche ciblée d'un document. Refuse explicitement les cas ambigus plutôt
 * que de deviner : 0 correspondance (le modèle cite un passage qui n'existe pas)
 * ou plusieurs correspondances sans `replaceAll` (il ne sait pas laquelle il vise).
 */
export function applyDocEdit(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): DocEditResult {
  if (!oldString) return { ok: false, error: 'old_string est vide.' };
  const parts = content.split(oldString);
  const count = parts.length - 1;
  if (count === 0) {
    return { ok: false, error: 'old_string introuvable dans la doc. Relis-la avec read_doc et cite le passage exactement.' };
  }
  if (count > 1 && !replaceAll) {
    return {
      ok: false,
      error: `old_string trouvé ${count} fois. Élargis le contexte pour le rendre unique, ou passe replace_all: true.`,
    };
  }
  return { ok: true, content: parts.join(newString) };
}

export function readDocRow(docId: string): { title: string; content: string } | null {
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT title, content FROM docs WHERE id = ?').get(docId) as
    | { title: string; content: string | null }
    | undefined;
  if (!row) return null;
  return { title: row.title, content: row.content ?? '' };
}

export function writeDocContent(docId: string, content: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare("UPDATE docs SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, docId);
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

/**
 * Serveur MCP in-process de la doc. La clé `doc` est structurante : elle produit
 * les noms `mcp__doc__*` sur lesquels s'appuient le portail d'outils (docGuardrails)
 * et les libellés de carte (src/lib/toolCard.ts).
 */
export function createDocToolServer(docId: string) {
  return createSdkMcpServer({
    name: 'doc',
    version: '1.0.0',
    tools: [
      tool(
        'read_doc',
        "Lit la version courante de la documentation. À utiliser avant toute retouche : l'utilisateur a pu éditer la doc à la main depuis ton dernier message.",
        {},
        async () => {
          const row = readDocRow(docId);
          if (!row) return fail('Documentation introuvable.');
          return ok(`# ${row.title}\n\n${row.content}`);
        },
      ),
      tool(
        'edit_doc',
        "Remplace un passage exact de la documentation. Préfère cet outil à replace_doc : il préserve le reste du document. old_string doit être unique dans la doc.",
        {
          old_string: z.string().describe('Le passage exact à remplacer, tel quel.'),
          new_string: z.string().describe('Le texte de remplacement.'),
          replace_all: z.boolean().optional().describe('Remplacer toutes les occurrences.'),
        },
        async (args) => {
          const row = readDocRow(docId);
          if (!row) return fail('Documentation introuvable.');
          const res = applyDocEdit(row.content, args.old_string, args.new_string, args.replace_all ?? false);
          if (!res.ok) return fail(res.error);
          writeDocContent(docId, res.content);
          return ok('Documentation mise à jour.');
        },
      ),
      tool(
        'replace_doc',
        "Réécrit intégralement la documentation. À réserver aux refontes : pour une retouche ponctuelle, utilise edit_doc.",
        { content: z.string().describe('Le document complet en Markdown.') },
        async (args) => {
          if (!args.content.trim()) return fail('Le contenu est vide.');
          writeDocContent(docId, args.content);
          return ok('Documentation réécrite.');
        },
      ),
    ],
  });
}
