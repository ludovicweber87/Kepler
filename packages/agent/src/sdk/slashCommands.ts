import type { SlashCommand } from '@anthropic-ai/claude-agent-sdk';

/**
 * Commande disponible dans la session : skill, commande de projet (`.claude/commands`),
 * commande de plugin ou built-in. Copie locale de `SlashCommand` du SDK — le wire
 * est notre contrat avec le client, il ne doit pas bouger si le SDK ajoute un champ.
 */
export interface SlashCommandInfo {
  name: string;
  description: string;
  argumentHint: string;
  aliases?: string[];
}

function normalizeOne(raw: unknown): SlashCommandInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<SlashCommand>;
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return null; // sans nom, rien à insérer dans le composer
  const aliases = Array.isArray(c.aliases)
    ? c.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
    : [];
  return {
    name,
    description: typeof c.description === 'string' ? c.description : '',
    argumentHint: typeof c.argumentHint === 'string' ? c.argumentHint : '',
    ...(aliases.length ? { aliases } : {}),
  };
}

/**
 * Liste SDK → liste wire : entrées invalides et doublons écartés, tri par nom.
 * Le tri est fait ici une fois pour toutes ; le client s'appuie dessus comme
 * ordre d'affichage à score de filtrage égal.
 */
export function normalizeCommands(raw: unknown): SlashCommandInfo[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SlashCommandInfo[] = [];
  for (const item of raw) {
    const cmd = normalizeOne(item);
    if (!cmd || seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    out.push(cmd);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * `system/commands_changed` : le SDK pousse la liste COMPLÈTE dès qu'elle bouge en
 * cours de session (skills découverts en travaillant dans un sous-dossier, par ex.).
 * Sémantique REPLACE — `supportedCommands()` ne reflète jamais ces changements, un
 * re-fetch client renverrait la liste périmée de l'init.
 * Renvoie `null` pour tout autre message.
 */
export function extractCommandsChanged(msg: unknown): SlashCommandInfo[] | null {
  const m = msg as { type?: unknown; subtype?: unknown; commands?: unknown } | null;
  if (!m || m.type !== 'system' || m.subtype !== 'commands_changed') return null;
  return normalizeCommands(m.commands);
}
