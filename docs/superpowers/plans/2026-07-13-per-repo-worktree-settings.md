# Per-Repo Worktree Settings (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque repo configuré ses propres réglages worktree (Create PR prompt, files to copy, setup/archive scripts, run scripts), éditables via une page ⚙️ ouverte depuis la sidebar. Phase 1 = stockage + page + déplacement du Create PR prompt + exécution des run-scripts. (Exécution files/setup/archive = Phase 2.)

**Architecture:** Nouvelle table `repo_settings` keyée par `repo_full_name`, servie par `/api/repo-settings` + `useRepoSettings`. Page catch-all `/settings/repo/[...repo]`. Le Workbench résout le `repo_full_name` de la session (issue fields ou reverse-lookup `repo_paths`, insensible à la casse) pour lire le prompt Create-PR et rendre les boutons run-scripts qui injectent dans le `ShellTerminal`.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, MUI 7, TanStack Query 5, Drizzle + better-sqlite3, next-intl (5 locales), Vitest.

## Global Constraints

- **Aucun texte en dur** : libellés via `next-intl`, 5 locales (`src/config/translate/{en,fr,es,de,pt}.json`).
- `"use client"` sur composants interactifs. TS strict. Alias `@/*` → `./src/*`.
- Tests : **logique pure uniquement** (Vitest `*.test.ts`). UI vérifiée par `npm run lint` + `npx tsc --noEmit` + `npm run build`.
- **Migrations additives** via `npx drizzle-kit generate` (sort dans `src/db/migrations/`). Pas d'édition des migrations existantes. Ne pas supprimer `data/devora.db`.
- Vérif fin de tâche : `npm run lint` (0 NEW erreur ; ~33 pré-existantes tolérées) + `npx tsc --noEmit` (0). Tâches logique pure : `npm run test:web` vert.
- **Ne jamais commiter sans accord** (donné pour l'exécution).
- Branche : `feat/per-repo-settings` (déjà créée).
- **Portée Phase 1** : `files_to_copy`/`setup_script`/`archive_script` sont **stockés/édités** seulement ; leur exécution est Phase 2. Ne PAS toucher `packages/agent/src/routes/git.ts`.

## File Structure

**Créés :**
- `src/db/migrations/000X_*.sql` — migration `repo_settings` (générée).
- `src/app/api/repo-settings/route.ts` — GET/PUT.
- `src/hooks/useRepoSettings.ts` — hook React Query.
- `src/lib/resolveRepoFullName.ts` (+ `.test.ts`) — helper pur de résolution repo d'une session.
- `src/app/(app)/settings/repo/[...repo]/page.tsx` — route page.
- `src/components/settings/RepoSettingsPanel.tsx` — UI de la page.

**Modifiés :**
- `src/db/schema.ts` — table `repoSettings`.
- `src/types/index.ts` — `RunScript`, `RepoSettings`.
- `src/components/layout/Sidebar.tsx` — bouton ⚙️.
- `src/components/settings/SettingsPanel.tsx` — retrait section Create PR prompt.
- `src/components/agents/AgentChatTab.tsx` — prop `createPrPrompt`.
- `src/components/agents/ShellTerminal.tsx` — `forwardRef` + `runCommand`.
- `src/components/workbench/Workbench.tsx` — résolution repo, prompt per-repo, boutons run-scripts.
- `src/config/translate/*.json` — namespace `repoSettings` + `sidebar.repoSettings`.

---

## Task 1: Table `repo_settings` (schéma + migration)

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/000X_*.sql` (généré)

**Interfaces:**
- Produces: table `repo_settings` (`repo_full_name` unique, colonnes texte + `run_scripts` json).

- [ ] **Step 1: Ajouter la table au schéma**

Dans `src/db/schema.ts`, ajouter (après une table existante, ex. après `appSettings`) :
```ts
export interface RunScriptRow {
	id: string;
	name: string;
	command: string;
}

export const repoSettings = sqliteTable('repo_settings', {
	id: uuid(),
	repo_full_name: text().notNull().unique(),
	create_pr_prompt: text().default(''),
	files_to_copy: text().default(''),
	setup_script: text().default(''),
	archive_script: text().default(''),
	run_scripts: text({ mode: 'json' }).$type<RunScriptRow[]>().default([]),
	updated_at: timestamp(),
});
```

- [ ] **Step 2: Générer la migration**

Run: `npx drizzle-kit generate`
Expected: crée `src/db/migrations/000X_*.sql` avec `CREATE TABLE \`repo_settings\` (...)` + `CREATE UNIQUE INDEX` sur `repo_full_name`, journal/snapshot mis à jour. Vérifier qu'aucune table existante n'est modifiée/supprimée.

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(repo-settings): add repo_settings table"
```

---

## Task 2: Types + API + hook

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/app/api/repo-settings/route.ts`
- Create: `src/hooks/useRepoSettings.ts`

**Interfaces:**
- Produces:
  ```ts
  interface RunScript { id: string; name: string; command: string }
  interface RepoSettings { repo_full_name: string; create_pr_prompt: string; files_to_copy: string; setup_script: string; archive_script: string; run_scripts: RunScript[] }
  // useRepoSettings(repoFullName: string | null) → { settings: RepoSettings, save: (patch: Partial<RepoSettings>) => Promise<void>, isLoading, isSaving }
  ```

- [ ] **Step 1: Types**

Dans `src/types/index.ts`, ajouter :
```ts
export interface RunScript {
	id: string;
	name: string;
	command: string;
}
export interface RepoSettings {
	repo_full_name: string;
	create_pr_prompt: string;
	files_to_copy: string;
	setup_script: string;
	archive_script: string;
	run_scripts: RunScript[];
}
```

- [ ] **Step 2: API route**

Créer `src/app/api/repo-settings/route.ts` :
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth-utils';
import { db } from '@/db';
import { repoSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

function defaults(repo: string) {
	return {
		repo_full_name: repo,
		create_pr_prompt: '',
		files_to_copy: '',
		setup_script: '',
		archive_script: '',
		run_scripts: [],
	};
}

// GET /api/repo-settings?repo=owner/repo → the row (or defaults)
export async function GET(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	const repo = req.nextUrl.searchParams.get('repo');
	if (!repo) return NextResponse.json({ error: 'repo required' }, { status: 400 });

	const row = db.select().from(repoSettings).where(eq(repoSettings.repo_full_name, repo)).get();
	return NextResponse.json(row ?? defaults(repo));
}

// PUT /api/repo-settings { repo_full_name, create_pr_prompt, files_to_copy, setup_script, archive_script, run_scripts }
export async function PUT(req: NextRequest) {
	const auth = await requireAuth();
	if (isAuthError(auth)) return auth;

	try {
		const body = await req.json();
		const repo = body.repo_full_name;
		if (!repo || typeof repo !== 'string') {
			return NextResponse.json({ error: 'repo_full_name required' }, { status: 400 });
		}
		const values = {
			repo_full_name: repo,
			create_pr_prompt: body.create_pr_prompt ?? '',
			files_to_copy: body.files_to_copy ?? '',
			setup_script: body.setup_script ?? '',
			archive_script: body.archive_script ?? '',
			run_scripts: body.run_scripts ?? [],
		};
		const [row] = db
			.insert(repoSettings)
			.values(values)
			.onConflictDoUpdate({
				target: repoSettings.repo_full_name,
				set: { ...values, updated_at: new Date().toISOString() },
			})
			.returning()
			.all();
		return NextResponse.json(row ?? null);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
```

- [ ] **Step 3: Hook**

Créer `src/hooks/useRepoSettings.ts` :
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import type { RepoSettings } from '@/types';

function defaults(repo: string): RepoSettings {
	return {
		repo_full_name: repo,
		create_pr_prompt: '',
		files_to_copy: '',
		setup_script: '',
		archive_script: '',
		run_scripts: [],
	};
}

export function useRepoSettings(repoFullName: string | null) {
	const qc = useQueryClient();
	const key = ['repo-settings', repoFullName];

	const query = useQuery({
		queryKey: key,
		enabled: !!repoFullName,
		queryFn: async (): Promise<RepoSettings> => {
			const res = await apiFetch(`/api/repo-settings?repo=${encodeURIComponent(repoFullName!)}`);
			if (!res.ok) throw new Error('Failed to fetch repo settings');
			return res.json();
		},
	});

	const settings = query.data ?? (repoFullName ? defaults(repoFullName) : defaults(''));

	const mutation = useMutation({
		mutationFn: async (patch: Partial<RepoSettings>) => {
			if (!repoFullName) throw new Error('no repo');
			const next = { ...settings, ...patch, repo_full_name: repoFullName };
			const res = await apiFetch('/api/repo-settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(next),
			});
			if (!res.ok) throw new Error('Failed to save repo settings');
			return next;
		},
		onSuccess: (next) => qc.setQueryData(key, next),
	});

	return {
		settings,
		save: (patch: Partial<RepoSettings>) => mutation.mutateAsync(patch).then(() => undefined),
		isLoading: query.isLoading,
		isSaving: mutation.isPending,
	};
}
```

- [ ] **Step 4: Vérifier + commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.
```bash
git add src/types/index.ts src/app/api/repo-settings/ src/hooks/useRepoSettings.ts
git commit -m "feat(repo-settings): types, /api/repo-settings, useRepoSettings hook"
```

---

## Task 3: Page de réglages + i18n

**Files:**
- Create: `src/app/(app)/settings/repo/[...repo]/page.tsx`
- Create: `src/components/settings/RepoSettingsPanel.tsx`
- Modify: `src/config/translate/*.json`

**Interfaces:**
- Consumes: `useRepoSettings` (Task 2), `RunScript` type.
- Produces: page rendue à `/settings/repo/<repo_full_name>`.

- [ ] **Step 1: i18n — namespace `repoSettings` (5 locales)**

Dans chaque `src/config/translate/{en,fr,es,de,pt}.json`, ajouter (traduire par locale ; fr donné) :
```json
"repoSettings": {
	"title": "Réglages du repo",
	"createPrPrompt": "Prompt Create PR",
	"createPrPromptDesc": "Message envoyé à l'agent quand tu cliques « Create PR ».",
	"filesToCopy": "Fichiers à copier",
	"filesToCopyDesc": "Devora copiera automatiquement ces fichiers dans chaque nouveau worktree (un chemin par ligne).",
	"setupScript": "Setup script",
	"setupScriptDesc": "Tourne quand un worktree est créé (ex. pnpm install).",
	"archiveScript": "Archive script",
	"archiveScriptDesc": "Tourne avant l'archivage d'un worktree.",
	"runScripts": "Run scripts",
	"runScriptsDesc": "Raccourcis pour lancer ton dev server, tes tests, etc.",
	"addRunScript": "Ajouter",
	"runScriptName": "Nom",
	"runScriptCommand": "Commande",
	"save": "Enregistrer",
	"saved": "Enregistré",
	"shareHint": "Partager avec ton équipe ? Crée un fichier .devora/settings.toml."
}
```
Ajouter aussi `sidebar.repoSettings` = « Réglages du repo » (fr) / « Repo settings » (en) / etc. dans le namespace `sidebar` des 5 locales.

- [ ] **Step 2: Route page**

Créer `src/app/(app)/settings/repo/[...repo]/page.tsx` :
```tsx
import RepoSettingsPanel from '@/components/settings/RepoSettingsPanel';

export default async function RepoSettingsPage({
	params,
}: {
	params: Promise<{ repo: string[] }>;
}) {
	const { repo } = await params;
	const repoFullName = repo.join('/');
	return <RepoSettingsPanel repoFullName={repoFullName} />;
}
```

- [ ] **Step 3: Panel component**

Créer `src/components/settings/RepoSettingsPanel.tsx` :
```tsx
'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useTranslations } from 'next-intl';
import { useRepoSettings } from '@/hooks/useRepoSettings';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { RunScript } from '@/types';
import { DEFAULT_CREATE_PR_PROMPT } from '@/lib/prompts';

export default function RepoSettingsPanel({ repoFullName }: { repoFullName: string }) {
	const t = useTranslations('repoSettings');
	const { settings, save, isLoading, isSaving } = useRepoSettings(repoFullName);
	const { showSnackbar } = useSnackbar();

	const [prPrompt, setPrPrompt] = useState('');
	const [filesToCopy, setFilesToCopy] = useState('');
	const [setupScript, setSetupScript] = useState('');
	const [archiveScript, setArchiveScript] = useState('');
	const [runScripts, setRunScripts] = useState<RunScript[]>([]);

	// Hydrate local state from server once loaded.
	useEffect(() => {
		if (isLoading) return;
		setPrPrompt(settings.create_pr_prompt);
		setFilesToCopy(settings.files_to_copy);
		setSetupScript(settings.setup_script);
		setArchiveScript(settings.archive_script);
		setRunScripts(settings.run_scripts);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, repoFullName]);

	const persist = async (patch: Parameters<typeof save>[0]) => {
		await save(patch);
		showSnackbar(t('saved'), 'success');
	};

	const addRunScript = () =>
		setRunScripts((s) => [...s, { id: crypto.randomUUID(), name: '', command: '' }]);
	const updateRunScript = (id: string, field: 'name' | 'command', value: string) =>
		setRunScripts((s) => s.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
	const deleteRunScript = (id: string) =>
		setRunScripts((s) => s.filter((r) => r.id !== id));

	return (
		<Box sx={{ p: 4, maxWidth: 800, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
			<Typography variant="h4" sx={{ fontWeight: 700 }}>
				{t('title')} — {repoFullName}
			</Typography>

			{/* Create PR prompt */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('createPrPrompt')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('createPrPromptDesc')}</Typography>
				<TextField fullWidth multiline minRows={2} value={prPrompt} placeholder={DEFAULT_CREATE_PR_PROMPT} onChange={(e) => setPrPrompt(e.target.value)} />
				<Button sx={{ mt: 1 }} variant="contained" disabled={isSaving} onClick={() => persist({ create_pr_prompt: prPrompt })}>{t('save')}</Button>
			</Box>

			{/* Files to copy */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('filesToCopy')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('filesToCopyDesc')}</Typography>
				<TextField fullWidth multiline minRows={3} value={filesToCopy} onChange={(e) => setFilesToCopy(e.target.value)} placeholder={'.env\n.env.local'} />
				<Button sx={{ mt: 1 }} variant="contained" disabled={isSaving} onClick={() => persist({ files_to_copy: filesToCopy })}>{t('save')}</Button>
			</Box>

			{/* Setup script */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('setupScript')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('setupScriptDesc')}</Typography>
				<TextField fullWidth multiline minRows={2} value={setupScript} onChange={(e) => setSetupScript(e.target.value)} placeholder="pnpm install" />
				<Button sx={{ mt: 1 }} variant="contained" disabled={isSaving} onClick={() => persist({ setup_script: setupScript })}>{t('save')}</Button>
			</Box>

			{/* Archive script */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('archiveScript')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('archiveScriptDesc')}</Typography>
				<TextField fullWidth multiline minRows={2} value={archiveScript} onChange={(e) => setArchiveScript(e.target.value)} />
				<Button sx={{ mt: 1 }} variant="contained" disabled={isSaving} onClick={() => persist({ archive_script: archiveScript })}>{t('save')}</Button>
			</Box>

			{/* Run scripts */}
			<Box>
				<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('runScripts')}</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('runScriptsDesc')}</Typography>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					{runScripts.map((rs) => (
						<Box key={rs.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
							<TextField size="small" sx={{ width: 180 }} placeholder={t('runScriptName')} value={rs.name} onChange={(e) => updateRunScript(rs.id, 'name', e.target.value)} />
							<TextField size="small" fullWidth placeholder={t('runScriptCommand')} value={rs.command} onChange={(e) => updateRunScript(rs.id, 'command', e.target.value)} />
							<IconButton size="small" onClick={() => deleteRunScript(rs.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
						</Box>
					))}
				</Box>
				<Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
					<Button startIcon={<AddRoundedIcon />} onClick={addRunScript}>{t('addRunScript')}</Button>
					<Button variant="contained" disabled={isSaving} onClick={() => persist({ run_scripts: runScripts })}>{t('save')}</Button>
				</Box>
			</Box>

			<Typography variant="caption" sx={{ color: 'text.disabled' }}>{t('shareHint')}</Typography>
		</Box>
	);
}
```

- [ ] **Step 4: Vérifier + run manuel**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK. `npm run dev` → ouvrir `/settings/repo/<owner>/<repo>` : les 5 sections s'affichent, éditer + Save persiste (recharger la page → valeurs conservées), Add/Delete run-scripts fonctionne.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/settings/repo" src/components/settings/RepoSettingsPanel.tsx src/config/translate/
git commit -m "feat(repo-settings): settings page (catch-all route) + i18n"
```

---

## Task 4: Bouton ⚙️ dans la sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `view.repoFullName` (de `useAgentViews`), `router` (déjà présent).

- [ ] **Step 1: Ajouter le bouton**

Dans `src/components/layout/Sidebar.tsx`, dans le bloc du repo, juste **avant** le `<Tooltip title={t('launchAgent')}>` (le bouton `+`, ~ligne 312), ajouter :
```tsx
<Tooltip title={t('repoSettings')}>
	<IconButton
		size="small"
		onClick={() =>
			router.push(
				'/settings/repo/' +
					view.repoFullName.split('/').map(encodeURIComponent).join('/'),
			)
		}
		sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}
	>
		<SettingsRoundedIcon sx={{ fontSize: 16 }} />
	</IconButton>
</Tooltip>
```
Importer `SettingsRoundedIcon` : `import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';` (vérifier qu'il n'est pas déjà importé).

- [ ] **Step 2: Vérifier + commit**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur. (Manuel : le ⚙️ apparaît à côté du + et ouvre la page du repo.)
```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(repo-settings): per-repo settings gear button in sidebar"
```

---

## Task 5: Résolution repo (helper TDD) + déplacement du Create PR prompt

**Files:**
- Create: `src/lib/resolveRepoFullName.ts`, `src/lib/resolveRepoFullName.test.ts`
- Modify: `src/components/agents/AgentChatTab.tsx`, `src/components/workbench/Workbench.tsx`, `src/components/settings/SettingsPanel.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function resolveRepoFullName(
    session: { issue_owner?: string | null; issue_repo?: string | null; project_path?: string | null } | null,
    repoPaths: { repo_full_name: string; local_path: string }[],
  ): string | null;
  ```
- `AgentChatTab` gagne une prop `createPrPrompt?: string`.

- [ ] **Step 1: Test du helper**

Créer `src/lib/resolveRepoFullName.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { resolveRepoFullName } from './resolveRepoFullName';

const paths = [{ repo_full_name: 'owner/repo', local_path: '/Users/me/repo' }];

describe('resolveRepoFullName', () => {
	it('prioritise issue_owner/issue_repo', () => {
		expect(
			resolveRepoFullName({ issue_owner: 'o', issue_repo: 'r', project_path: '/x' }, paths),
		).toBe('o/r');
	});
	it('reverse-lookup par project_path (insensible à la casse)', () => {
		expect(
			resolveRepoFullName({ project_path: '/users/me/REPO' }, paths),
		).toBe('owner/repo');
	});
	it('null si rien ne matche', () => {
		expect(resolveRepoFullName({ project_path: '/nope' }, paths)).toBeNull();
	});
	it('null si session null', () => {
		expect(resolveRepoFullName(null, paths)).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer → échec**

Run: `npm run test:web -- resolveRepoFullName`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

Créer `src/lib/resolveRepoFullName.ts` :
```ts
export function resolveRepoFullName(
	session:
		| { issue_owner?: string | null; issue_repo?: string | null; project_path?: string | null }
		| null,
	repoPaths: { repo_full_name: string; local_path: string }[],
): string | null {
	if (!session) return null;
	if (session.issue_owner && session.issue_repo) {
		return `${session.issue_owner}/${session.issue_repo}`;
	}
	const p = session.project_path;
	if (!p) return null;
	const lower = p.toLowerCase();
	return repoPaths.find((rp) => rp.local_path.toLowerCase() === lower)?.repo_full_name ?? null;
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm run test:web -- resolveRepoFullName`
Expected: PASS (4 tests).

- [ ] **Step 5: AgentChatTab — prop `createPrPrompt`**

Dans `src/components/agents/AgentChatTab.tsx` :
- Ajouter à `interface Props` : `createPrPrompt?: string;`
- Ajouter au destructure des props : `createPrPrompt,`
- Supprimer les lignes `useAppSetting(CREATE_PR_PROMPT_KEY, DEFAULT_CREATE_PR_PROMPT)` (le bloc `const { valueOrDefault: createPrPrompt } = useAppSetting(...)`) et l'import `useAppSetting` s'il n'est plus utilisé + l'import `CREATE_PR_PROMPT_KEY` (garder `DEFAULT_CREATE_PR_PROMPT`).
- Remplacer par une constante locale : `const prPrompt = createPrPrompt || DEFAULT_CREATE_PR_PROMPT;`
- Le bouton Create PR : `onClick={() => chat.send(prPrompt)}` (remplacer `createPrPrompt` par `prPrompt`).

- [ ] **Step 6: Workbench — résoudre le repo + passer le prompt**

Dans `src/components/workbench/Workbench.tsx` :
- Importer : `import { useRepoPaths } from '@/hooks/useRepoPaths';`, `import { useRepoSettings } from '@/hooks/useRepoSettings';`, `import { resolveRepoFullName } from '@/lib/resolveRepoFullName';`
- Après `resolved` : 
```tsx
const { repoPaths } = useRepoPaths();
const repoFullName = useMemo(() => resolveRepoFullName(resolved, repoPaths), [resolved, repoPaths]);
const { settings: repoSettings } = useRepoSettings(repoFullName);
```
- Sur `<AgentChatTab ... />`, ajouter la prop : `createPrPrompt={repoSettings.create_pr_prompt}`.

- [ ] **Step 7: SettingsPanel — retirer la section Create PR prompt**

Dans `src/components/settings/SettingsPanel.tsx`, supprimer le composant/section `CreatePrPromptSection` (le bloc `useAppSetting(CREATE_PR_PROMPT_KEY, ...)` + son rendu) et son point d'utilisation. Retirer les imports devenus inutiles (`useAppSetting` si plus utilisé, `CREATE_PR_PROMPT_KEY`). Garder `DEFAULT_CREATE_PR_PROMPT` s'il sert ailleurs, sinon retirer son import ici.

- [ ] **Step 8: Vérifier + commit**

Run: `npm run test:web -- resolveRepoFullName && npm run lint && npx tsc --noEmit && npm run build`
Expected: tests verts, 0 erreur, build OK.
```bash
git add src/lib/resolveRepoFullName.ts src/lib/resolveRepoFullName.test.ts src/components/agents/AgentChatTab.tsx src/components/workbench/Workbench.tsx src/components/settings/SettingsPanel.tsx
git commit -m "feat(repo-settings): per-repo Create PR prompt (moved from global)"
```

---

## Task 6: Run scripts exécutés dans le Workbench

**Files:**
- Modify: `src/components/agents/ShellTerminal.tsx`, `src/components/workbench/Workbench.tsx`

**Interfaces:**
- `ShellTerminal` devient `forwardRef` exposant `{ runCommand(cmd: string): void }`.
- Consumes: `repoSettings.run_scripts` (résolu en Task 5), `wsRef` interne de ShellTerminal.

- [ ] **Step 1: ShellTerminal → forwardRef + runCommand**

Dans `src/components/agents/ShellTerminal.tsx` :
- Importer `forwardRef, useImperativeHandle` depuis `react`.
- Définir le type du handle : `export interface ShellTerminalHandle { runCommand: (cmd: string) => void }`.
- Convertir le composant en `forwardRef<ShellTerminalHandle, ShellTerminalProps>((props, ref) => { ... })`.
- Ajouter dans le corps :
```tsx
useImperativeHandle(ref, () => ({
	runCommand: (cmd: string) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
		}
	},
}));
```
(placer là où `wsRef` est en scope). Donner un `displayName` : `ShellTerminal.displayName = 'ShellTerminal';`. Garder l'export default.

- [ ] **Step 2: Workbench — ref + boutons run-scripts**

Dans `src/components/workbench/Workbench.tsx` :
- Importer le type : `import ShellTerminal, { type ShellTerminalHandle } from '@/components/agents/ShellTerminal';` (ajuster l'import existant).
- Ajouter un ref : `const shellRef = useRef<ShellTerminalHandle>(null);` (importer `useRef` si absent).
- Passer le ref : `<ShellTerminal ref={shellRef} sessionId={sessionId} cwd={effectivePath} active ready={!!resolved} />`.
- Dans le header du panneau Terminal (le `<Box>` avec `{t('terminal')}`, ~ligne 366-381), ajouter à droite de la caption une rangée de chips run-scripts :
```tsx
{repoSettings.run_scripts.length > 0 && (
	<Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', ml: 'auto' }}>
		{repoSettings.run_scripts
			.filter((rs) => rs.command.trim())
			.map((rs) => (
				<Chip
					key={rs.id}
					label={rs.name || rs.command}
					size="small"
					onClick={() => shellRef.current?.runCommand(rs.command)}
					sx={{ cursor: 'pointer' }}
				/>
			))}
	</Box>
)}
```
(rendre le header en `display:'flex', alignItems:'center'` pour aligner caption + chips ; `Chip` est déjà importé dans Workbench).

- [ ] **Step 3: Vérifier + run manuel**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK. `npm run dev` → configurer un run-script (ex. `echo hello`) dans la page du repo, ouvrir une session de ce repo dans le Workbench → un chip apparaît au-dessus du terminal ; le clic lance la commande dans le ShellTerminal (output visible).

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/ShellTerminal.tsx src/components/workbench/Workbench.tsx
git commit -m "feat(repo-settings): run-script chips execute in the workbench shell terminal"
```

---

## Self-Review (effectuée)

**Spec coverage :** table repo_settings (T1) ; types+API+hook (T2) ; page catch-all + i18n + sections (T3) ; ⚙️ sidebar (T4) ; résolution repo insensible casse + déplacement Create PR prompt (T5) ; run-scripts exécutés dans ShellTerminal (T6). `files_to_copy`/`setup_script`/`archive_script` : stockés/édités (T3), exécution hors Phase 1 (conforme spec). Tous les points Phase 1 couverts.

**Placeholder scan :** aucun TODO ; code complet pour logique/API/hook/helper ; composant page complet ; UI vérifiée par lint/tsc/build/run.

**Type consistency :** `RepoSettings`/`RunScript` cohérents T2↔T3↔T5↔T6. `resolveRepoFullName` signature identique T5↔usage Workbench. `ShellTerminalHandle.runCommand` cohérent T6. `repoSettings.create_pr_prompt` / `.run_scripts` cohérents.

**Vigilance exécution :** T5 Step 7 — bien retirer TOUS les usages de `CREATE_PR_PROMPT_KEY`/`useAppSetting` devenus orphelins (grep) pour éviter les erreurs lint « unused ». T6 — le header Terminal doit passer en flex pour aligner les chips ; vérifier que `Chip`/`useRef`/`useMemo` sont importés dans Workbench.
