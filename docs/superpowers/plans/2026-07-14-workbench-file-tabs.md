# Workbench File Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le Workbench pour que la colonne gauche soit un système d'onglets MUI `Chat | <fichier> | …` (un onglet fermable par fichier ouvert), la colonne droite deux/trois onglets MUI `Changes | Activity | Issue`, avec Changes = liste de fichiers cliquables et Activity = timeline seule.

**Architecture:** On centralise la logique pure de gestion des onglets fichier dans `src/lib/workbenchTabs.ts` (testable en isolation). On extrait la liste des fichiers modifiés d'`AgentActivityTab` vers un nouveau composant `ChangedFilesList`. On expose `FileDiffView` depuis `AgentDiffTab` pour rendre le diff d'un seul fichier dans un onglet gauche. `Workbench.tsx` orchestre les deux barres d'onglets MUI et le state.

**Tech Stack:** React 19, Next.js 16 (App Router, `'use client'`), TypeScript 5 strict, MUI 7 (`Tabs`/`Tab`), next-intl 4.8 (5 locales), Vitest (logique pure uniquement).

## Global Constraints

- **Jamais de texte en dur** dans les composants : toujours `useTranslations` + clés dans `src/config/translate/{en,fr,es,de,pt}.json` (5 locales).
- **Tests = logique pure uniquement** (Vitest, `*.test.ts`). L'UI se vérifie par `npm run lint` + `npx tsc --noEmit` + `npm run build` + run manuel. Pas de test de rendu React.
- `"use client"` sur tout composant interactif. Path alias `@/*` → `./src/*`.
- Types centralisés / réutilisés : `FileDiff` vient de `@/lib/gitDiff`.
- Ne jamais commiter/push sans accord explicite — **ce plan s'arrête avant tout commit non demandé** : chaque tâche liste le commit mais l'exécutant demande l'accord de Ludovic avant de commiter (cf. CLAUDE.md).
- Onglet de fichier : label = **basename** (dynamique, non traduit) ; le bouton ✕ a un aria-label traduit (`closeFile`).
- Convention MUI existante (voir `archived/page.tsx`) : `<Tabs>` avec `sx={{ minHeight: 40, '& .MuiTab-root': { textTransform: 'none', minHeight: 40 } }}`.

---

### Task 1: Logique pure de gestion des onglets fichier

Extraire dans un module testable : (a) trouver le `FileDiff` correspondant à un chemin (relatif ou absolu), (b) calculer l'onglet actif après fermeture d'un onglet, (c) ajouter un fichier à la liste ouverte sans doublon.

**Files:**
- Create: `src/lib/workbenchTabs.ts`
- Test: `src/lib/workbenchTabs.test.ts`

**Interfaces:**
- Consumes: `FileDiff` from `@/lib/gitDiff`.
- Produces:
  - `matchFileDiff(files: FileDiff[], path: string | null): FileDiff | undefined`
  - `resolveTabAfterClose(openFiles: string[], closing: string, active: string): string` — retourne le nouveau `activeTab` (`'chat'` ou un chemin) après fermeture de `closing`. `active` vaut `'chat'` ou un chemin.
  - `addOpenFile(openFiles: string[], path: string): string[]` — ajoute `path` en fin si absent, sinon retourne la liste inchangée.
  - Constante `CHAT_TAB = 'chat'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workbenchTabs.test.ts
import { describe, it, expect } from 'vitest';
import {
	matchFileDiff,
	resolveTabAfterClose,
	addOpenFile,
	CHAT_TAB,
} from './workbenchTabs';
import type { FileDiff } from './gitDiff';

const f = (path: string): FileDiff => ({ path, additions: 0, deletions: 0, hunks: [] });

describe('matchFileDiff', () => {
	const files = [f('src/a.ts'), f('src/b.ts')];
	it('matches by exact relative path', () => {
		expect(matchFileDiff(files, 'src/a.ts')?.path).toBe('src/a.ts');
	});
	it('matches an absolute path by suffix', () => {
		expect(matchFileDiff(files, '/repo/root/src/b.ts')?.path).toBe('src/b.ts');
	});
	it('returns undefined when absent or null', () => {
		expect(matchFileDiff(files, 'src/missing.ts')).toBeUndefined();
		expect(matchFileDiff(files, null)).toBeUndefined();
	});
});

describe('addOpenFile', () => {
	it('appends a new path', () => {
		expect(addOpenFile(['a'], 'b')).toEqual(['a', 'b']);
	});
	it('is a no-op for an already open path', () => {
		expect(addOpenFile(['a', 'b'], 'b')).toEqual(['a', 'b']);
	});
});

describe('resolveTabAfterClose', () => {
	it('keeps active tab when closing a non-active file', () => {
		expect(resolveTabAfterClose(['a', 'b'], 'a', 'b')).toBe('b');
	});
	it('falls back to previous neighbour when closing the active file', () => {
		expect(resolveTabAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('a');
	});
	it('falls back to chat when closing the only/first open file', () => {
		expect(resolveTabAfterClose(['a'], 'a', 'a')).toBe(CHAT_TAB);
	});
	it('picks the new first file when closing the first of several', () => {
		expect(resolveTabAfterClose(['a', 'b'], 'a', 'a')).toBe('b');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workbenchTabs.test.ts`
Expected: FAIL — `Cannot find module './workbenchTabs'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/workbenchTabs.ts
import type { FileDiff } from './gitDiff';

export const CHAT_TAB = 'chat';

/** Trouve le FileDiff pour un chemin relatif repo OU absolu (match par suffixe). */
export function matchFileDiff(files: FileDiff[], path: string | null): FileDiff | undefined {
	if (!path) return undefined;
	return files.find((f) => f.path === path || path.endsWith(`/${f.path}`));
}

/** Ajoute un chemin à la liste des fichiers ouverts (pas de doublon, ordre préservé). */
export function addOpenFile(openFiles: string[], path: string): string[] {
	return openFiles.includes(path) ? openFiles : [...openFiles, path];
}

/**
 * Onglet actif après fermeture de `closing`.
 * Si l'onglet fermé n'est pas actif, l'actif est conservé.
 * Sinon on prend le voisin de gauche, à défaut celui de droite, à défaut le chat.
 */
export function resolveTabAfterClose(
	openFiles: string[],
	closing: string,
	active: string,
): string {
	if (active !== closing) return active;
	const idx = openFiles.indexOf(closing);
	const remaining = openFiles.filter((p) => p !== closing);
	if (remaining.length === 0) return CHAT_TAB;
	const neighbour = remaining[idx - 1] ?? remaining[idx] ?? remaining[0];
	return neighbour ?? CHAT_TAB;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workbenchTabs.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit** (demander l'accord de Ludovic avant)

```bash
git add src/lib/workbenchTabs.ts src/lib/workbenchTabs.test.ts
git commit -m "feat(workbench): helpers purs de gestion des onglets fichier"
```

---

### Task 2: Clé i18n `closeFile` (5 locales)

Ajouter l'aria-label du bouton ✕ dans le namespace `workbench` des 5 fichiers de traduction. (`noChanges` existe déjà dans `agentDiff` et sera réutilisé pour l'état vide — aucune clé à ajouter pour ça.)

**Files:**
- Modify: `src/config/translate/en.json`, `fr.json`, `es.json`, `de.json`, `pt.json` (namespace `workbench`)

**Interfaces:**
- Produces: clé `workbench.closeFile` disponible via `useTranslations('workbench')` → `t('closeFile')`.

- [ ] **Step 1: Ajouter la clé dans chaque locale**

Dans chaque fichier, à l'intérieur de l'objet `"workbench"`, ajouter la clé `closeFile` après `"stopSession"`. Valeurs :

- `en.json` : `"closeFile": "Close file"`
- `fr.json` : `"closeFile": "Fermer le fichier"`
- `es.json` : `"closeFile": "Cerrar archivo"`
- `de.json` : `"closeFile": "Datei schließen"`
- `pt.json` : `"closeFile": "Fechar ficheiro"`

Exemple (fr.json) — la fin de l'objet `workbench` passe de :

```json
		"stopSession": "Arrêter la session"
	},
```

à :

```json
		"stopSession": "Arrêter la session",
		"closeFile": "Fermer le fichier"
	},
```

- [ ] **Step 2: Vérifier que les 5 JSON sont valides**

Run: `node -e "for (const l of ['en','fr','es','de','pt']) { const j=require('./src/config/translate/'+l+'.json'); if(!j.workbench.closeFile) throw new Error('missing in '+l); } console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit** (demander l'accord avant)

```bash
git add src/config/translate/*.json
git commit -m "i18n(workbench): clé closeFile (5 locales)"
```

---

### Task 3: Exposer `FileDiffView` depuis `AgentDiffTab`

Rendre `FileDiffView` importable pour le rendu mono-fichier dans un onglet gauche, sans toucher au reste du composant.

**Files:**
- Modify: `src/components/agents/AgentDiffTab.tsx:154`

**Interfaces:**
- Produces: export nommé `FileDiffView` — composant `memo` de props `{ file: FileDiff; focused?: boolean; focusNonce?: number }`.

- [ ] **Step 1: Exporter le composant**

Ligne 154, remplacer :

```tsx
const FileDiffView = memo(function FileDiffView({
```

par :

```tsx
export const FileDiffView = memo(function FileDiffView({
```

- [ ] **Step 2: Vérifier la compilation des types**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur (l'export par défaut `AgentDiffTab` reste inchangé).

- [ ] **Step 3: Commit** (demander l'accord avant)

```bash
git add src/components/agents/AgentDiffTab.tsx
git commit -m "refactor(diff): exporter FileDiffView pour le rendu mono-fichier"
```

---

### Task 4: Composant `ChangedFilesList`

Extraire la liste des fichiers modifiés (aujourd'hui dans `AgentActivityTab`) vers un composant autonome qui alimentera l'onglet **Changes** de droite.

**Files:**
- Create: `src/components/agents/ChangedFilesList.tsx`

**Interfaces:**
- Consumes: `FileDiff` from `@/lib/gitDiff`.
- Produces: default export `ChangedFilesList` — props `{ changedFiles: FileDiff[]; onOpenFile: (filePath: string) => void }`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/agents/ChangedFilesList.tsx
'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import type { FileDiff } from '@/lib/gitDiff';

interface ChangedFilesListProps {
	changedFiles: FileDiff[];
	onOpenFile: (filePath: string) => void;
}

export default function ChangedFilesList({ changedFiles, onOpenFile }: ChangedFilesListProps) {
	const t = useTranslations('agentDiff');

	if (changedFiles.length === 0) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					px: 2,
				}}
			>
				<Typography variant="caption" sx={{ color: 'text.disabled' }}>
					{t('noChanges')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ height: '100%', overflowY: 'auto', py: 0.5 }}>
			{changedFiles.map((file) => (
				<Box
					key={file.path}
					onClick={() => onOpenFile(file.path)}
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 0.75,
						px: 2,
						py: 0.4,
						cursor: 'pointer',
						transition: 'background-color 0.15s',
						'&:hover': { bgcolor: 'action.hover' },
					}}
				>
					<InsertDriveFileRoundedIcon
						sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }}
					/>
					<Typography
						variant="caption"
						sx={{
							flex: 1,
							minWidth: 0,
							color: 'text.secondary',
							fontSize: '0.72rem',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
							direction: 'rtl',
							textAlign: 'left',
						}}
					>
						{file.path}
					</Typography>
					{file.additions > 0 && (
						<Typography
							variant="caption"
							sx={{
								color: 'success.main',
								fontWeight: 700,
								fontFamily: 'monospace',
								fontSize: '0.68rem',
							}}
						>
							+{file.additions}
						</Typography>
					)}
					{file.deletions > 0 && (
						<Typography
							variant="caption"
							sx={{
								color: 'error.main',
								fontWeight: 700,
								fontFamily: 'monospace',
								fontSize: '0.68rem',
							}}
						>
							−{file.deletions}
						</Typography>
					)}
				</Box>
			))}
		</Box>
	);
}
```

- [ ] **Step 2: Vérifier types + lint**

Run: `npx tsc --noEmit && npx eslint src/components/agents/ChangedFilesList.tsx`
Expected: aucune erreur.

- [ ] **Step 3: Commit** (demander l'accord avant)

```bash
git add src/components/agents/ChangedFilesList.tsx
git commit -m "feat(workbench): composant ChangedFilesList"
```

---

### Task 5: Retirer la liste de fichiers d'`AgentActivityTab`

Activity ne doit plus montrer que la timeline. On supprime la section « fichiers modifiés » et les props `changedFiles`/`onOpenFile` désormais inutilisées.

**Files:**
- Modify: `src/components/agents/AgentActivityTab.tsx`

**Interfaces:**
- Produces: `AgentActivityTab` avec props réduites `{ session, logs, isStreaming? }` (retrait de `changedFiles` et `onOpenFile`).

- [ ] **Step 1: Retirer les props de l'interface**

Remplacer le bloc `interface AgentActivityTabProps` (lignes 39-47) par :

```tsx
interface AgentActivityTabProps {
	session: AgentSession | null;
	logs: AgentActivityLog[];
	isStreaming?: boolean;
}
```

- [ ] **Step 2: Retirer les props de la signature**

Remplacer (lignes 83-89) :

```tsx
export default function AgentActivityTab({
	session,
	logs,
	isStreaming = false,
	changedFiles = [],
	onOpenFile,
}: AgentActivityTabProps) {
```

par :

```tsx
export default function AgentActivityTab({
	session,
	logs,
	isStreaming = false,
}: AgentActivityTabProps) {
```

- [ ] **Step 3: Supprimer le bloc JSX de la liste des fichiers**

Supprimer entièrement le bloc `{/* Fichiers modifiés — cliquables, ouvrent l'onglet Changes */}` (lignes 320-403), c.-à-d. tout le `{changedFiles.length > 0 && ( … )}`.

- [ ] **Step 4: Nettoyer les imports inutilisés**

Retirer l'import devenu inutile :

```tsx
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
```

et l'import de type `FileDiff` :

```tsx
import type { FileDiff } from '@/lib/gitDiff';
```

(Garder `FolderRoundedIcon`, `AccountTreeRoundedIcon`, etc. qui restent utilisés dans le header.)

- [ ] **Step 5: Vérifier types + lint (imports non utilisés)**

Run: `npx tsc --noEmit && npx eslint src/components/agents/AgentActivityTab.tsx`
Expected: aucune erreur, aucun warning "unused" (`changedFiles`, `onOpenFile`, `FileDiff`, `InsertDriveFileRoundedIcon`).

- [ ] **Step 6: Commit** (demander l'accord avant)

```bash
git add src/components/agents/AgentActivityTab.tsx
git commit -m "refactor(activity): Activity ne montre plus que la timeline"
```

---

### Task 6: Restructurer `Workbench.tsx` (onglets MUI gauche + droite)

Remplacer les chips par deux barres d'onglets MUI, brancher le nouveau state et les nouveaux composants. C'est la tâche d'intégration finale.

**Files:**
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: `matchFileDiff`, `resolveTabAfterClose`, `addOpenFile`, `CHAT_TAB` (Task 1) ; `FileDiffView` (Task 3) ; `ChangedFilesList` (Task 4) ; `AgentActivityTab` props réduites (Task 5) ; `t('closeFile')` (Task 2).

- [ ] **Step 1: Mettre à jour les imports**

Dans le bloc d'imports (lignes 6-44), ajouter :

```tsx
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
```

Ajouter les imports fonctionnels :

```tsx
import { FileDiffView } from '@/components/agents/AgentDiffTab';
import ChangedFilesList from '@/components/agents/ChangedFilesList';
import {
	matchFileDiff,
	resolveTabAfterClose,
	addOpenFile,
	CHAT_TAB,
} from '@/lib/workbenchTabs';
```

Retirer l'import désormais inutile `AgentDiffTab` par défaut (ligne 40) **seulement si** plus référencé après refonte (il ne l'est plus — on utilise `FileDiffView`). Retirer aussi les icônes de chips qui ne servent plus dans les barres d'onglets si inutilisées : garder `DescriptionRoundedIcon`, `TimelineRoundedIcon`, `BugReportRoundedIcon` uniquement si réutilisées dans les `<Tab icon>` (voir Step 5) ; sinon les retirer. Vérifié au Step 8 par le lint.

- [ ] **Step 2: Remplacer le state central (lignes 84-100)**

Remplacer :

```tsx
	type TopPanel = 'activity' | 'issue';
	const [topPanel, setTopPanel] = useState<TopPanel>('activity');

	// Zone centrale : conversation ou diff des changements.
	type CenterTab = 'chat' | 'changes';
	const [centerTab, setCenterTab] = useState<CenterTab>('chat');
	const [changesTarget, setChangesTarget] = useState<string | null>(null);
	const [focusNonce, setFocusNonce] = useState(0);

	const diffPath = resolved?.worktree_path ?? resolved?.project_path ?? null;
	const { files: changedFiles } = useGitDiff(diffPath, resolved?.branch ?? null);

	const openChanges = useCallback((filePath: string) => {
		setChangesTarget(filePath || null);
		setFocusNonce((n) => n + 1);
		setCenterTab('changes');
	}, []);
```

par :

```tsx
	type RightTab = 'changes' | 'activity' | 'issue';
	const [rightTab, setRightTab] = useState<RightTab>('activity');

	// Onglets gauche : 'chat' + un chemin de fichier par onglet ouvert.
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<string>(CHAT_TAB);
	const [focusNonce, setFocusNonce] = useState(0);

	const diffPath = resolved?.worktree_path ?? resolved?.project_path ?? null;
	const { files: changedFiles } = useGitDiff(diffPath, resolved?.branch ?? null);

	const openChanges = useCallback((filePath: string) => {
		if (!filePath) return;
		setOpenFiles((prev) => addOpenFile(prev, filePath));
		setActiveTab(filePath);
		setFocusNonce((n) => n + 1);
	}, []);

	const closeFile = useCallback((filePath: string) => {
		setActiveTab((active) => resolveTabAfterClose(openFiles, filePath, active));
		setOpenFiles((prev) => prev.filter((p) => p !== filePath));
	}, [openFiles]);

	const activeFileDiff =
		activeTab === CHAT_TAB ? undefined : matchFileDiff(changedFiles, activeTab);
```

- [ ] **Step 3: Adapter la condition d'affichage du chat masqué (ligne 332)**

Le chat reste monté en permanence, masqué quand l'onglet actif n'est pas `chat`. Remplacer `display: centerTab === 'chat' ? 'flex' : 'none'` par `display: activeTab === CHAT_TAB ? 'flex' : 'none'`.

- [ ] **Step 4: Remplacer la barre d'onglets gauche + le rendu du diff (lignes 306-364)**

Remplacer tout le bloc « Onglets centraux » (la `<Box>` de chips, lignes 307-325) ET le bloc `{centerTab === 'changes' && ( … )}` (lignes 355-364) par :

Barre d'onglets (à la place des lignes 307-325) :

```tsx
					{/* Onglets : Chat + un onglet par fichier ouvert */}
					<Tabs
						value={activeTab}
						onChange={(_, val) => setActiveTab(val as string)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						<Tab value={CHAT_TAB} label={t('tabChat')} />
						{openFiles.map((path) => {
							const name = path.split('/').filter(Boolean).pop() ?? path;
							return (
								<Tab
									key={path}
									value={path}
									label={
										<Box
											component="span"
											sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
										>
											<Tooltip title={path} arrow>
												<Box component="span">{name}</Box>
											</Tooltip>
											<Box
												component="span"
												role="button"
												aria-label={t('closeFile')}
												onClick={(e) => {
													e.stopPropagation();
													closeFile(path);
												}}
												sx={{
													display: 'inline-flex',
													borderRadius: '50%',
													'&:hover': { color: 'error.main' },
												}}
											>
												<CloseRoundedIcon sx={{ fontSize: 14 }} />
											</Box>
										</Box>
									}
								/>
							);
						})}
					</Tabs>
```

Rendu du fichier actif (à la place des lignes 355-364, sous le bloc chat masqué) :

```tsx
					{activeTab !== CHAT_TAB && (
						<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
							{activeFileDiff ? (
								<FileDiffView file={activeFileDiff} focused focusNonce={focusNonce} />
							) : (
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										height: '100%',
										px: 2,
									}}
								>
									<Typography variant="caption" sx={{ color: 'text.disabled' }}>
										{td('noChanges')}
									</Typography>
								</Box>
							)}
						</Box>
					)}
```

Ajouter en tête du composant (près de `const t = useTranslations('workbench')`, ligne 47) le hook de traduction du namespace diff pour `noChanges` :

```tsx
	const td = useTranslations('agentDiff');
```

- [ ] **Step 5: Remplacer la barre de chips droite (lignes 379-423) par des onglets MUI**

Remplacer toute la `<Box>` « Chips » (lignes 379-423) par :

```tsx
					{/* Onglets droite : Changes | Activity | Issue */}
					<Tabs
						value={rightTab}
						onChange={(_, val) => setRightTab(val as RightTab)}
						variant="scrollable"
						scrollButtons="auto"
						sx={{
							minHeight: 40,
							borderBottom: 1,
							borderColor: 'divider',
							flexShrink: 0,
							'& .MuiTab-root': { textTransform: 'none', minHeight: 40 },
						}}
					>
						<Tab
							value="changes"
							iconPosition="start"
							icon={<DescriptionRoundedIcon sx={{ fontSize: 16 }} />}
							label={
								changedFiles.length > 0
									? `${t('tabChanges')} (${changedFiles.length})`
									: t('tabChanges')
							}
						/>
						<Tab
							value="activity"
							iconPosition="start"
							icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
							label={t('chipActivity')}
						/>
						{hasIssue && (
							<Tab
								value="issue"
								iconPosition="start"
								icon={<BugReportRoundedIcon sx={{ fontSize: 16 }} />}
								label={t('chipIssue')}
							/>
						)}
					</Tabs>
```

- [ ] **Step 6: Adapter le panneau droit (lignes 425-442)**

Remplacer le bloc « Panneau haut » par un switch sur `rightTab` incluant `changes` :

```tsx
					{/* Panneau droit */}
					<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
						{rightTab === 'changes' && (
							<ChangedFilesList changedFiles={changedFiles} onOpenFile={openChanges} />
						)}
						{rightTab === 'activity' && (
							<AgentActivityTab session={resolved} logs={logs} />
						)}
						{rightTab === 'issue' && hasIssue && (
							<AgentIssueTab
								owner={resolved!.issue_owner!}
								repo={resolved!.issue_repo!}
								issueNumber={resolved!.issue_number!}
							/>
						)}
					</Box>
```

- [ ] **Step 7: Garde-fou — si l'onglet Issue disparaît**

Ajouter, juste après la déclaration de `hasIssue` (ligne 83), un effet qui rebascule sur `activity` si `rightTab === 'issue'` mais `!hasIssue` (session sans issue). Ajouter `useEffect` à l'import React ligne 3 (`import { useState, useRef, useCallback, useMemo, useEffect } from 'react';`) puis :

```tsx
	useEffect(() => {
		if (rightTab === 'issue' && !hasIssue) setRightTab('activity');
	}, [rightTab, hasIssue]);
```

- [ ] **Step 8: Vérifier types + lint (imports/vars inutilisés)**

Run: `npx tsc --noEmit && npx eslint src/components/workbench/Workbench.tsx`
Expected: aucune erreur. Corriger tout import devenu inutile signalé (`AgentDiffTab` par défaut, `Chip` s'il n'est plus utilisé — attention : `Chip` reste utilisé pour le header session et les run_scripts, donc à conserver).

- [ ] **Step 9: Vérification globale (lint + build)**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: succès complet, aucune erreur.

- [ ] **Step 10: Vérification manuelle**

Lancer `npm run dev`, ouvrir une session avec des changements, puis vérifier :
1. Colonne droite : onglets `Changes | Activity` (+ `Issue` si issue liée). Activity = timeline seule (plus de liste de fichiers).
2. Onglet `Changes` : liste des fichiers ; clic sur un fichier → ouvre un onglet à gauche `Chat | <fichier>`.
3. Onglet fichier : affiche le diff de CE seul fichier. Tooltip = chemin complet au survol du nom.
4. Cliquer un fichier déjà ouvert → bascule sur son onglet (pas de doublon), re-scroll.
5. ✕ ferme l'onglet ; si actif → bascule sur le voisin puis `Chat`.
6. Le chat reste vivant (WebSocket) en revenant sur `Chat` après avoir ouvert des fichiers.

- [ ] **Step 11: Commit** (demander l'accord avant)

```bash
git add src/components/workbench/Workbench.tsx
git commit -m "feat(workbench): onglets MUI par fichier + séparation Changes/Activity"
```

---

## Notes d'exécution

- **Ordre** : Task 1 → 2 → 3 → 4 → 5 → 6. Les tâches 3, 4, 5 sont indépendantes entre elles mais toutes prérequises de la 6.
- **Commits** : ne jamais commiter sans l'accord explicite de Ludovic (CLAUDE.md). Les commandes `git commit` du plan sont des points de contrôle, pas des ordres automatiques.
- **Pas de test UI** : conformément à la convention repo, seule la Task 1 (logique pure) porte des tests Vitest. Le reste est validé par `lint` + `tsc` + `build` + run manuel (Task 6 Step 10).
