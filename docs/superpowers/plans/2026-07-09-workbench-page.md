# Workbench Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la page hub `/dashboard` par une page de travail plein écran **Workbench** (`/workbench`) : conversation agent 75 % à gauche, sidebar droite avec Fichiers + Terminal empilés et chips (Fichiers/Activity/Issue).

**Architecture:** Le rendu terminal/chat/diff vit désormais une seule fois dans la page Workbench. La `AgentTerminalModal` garde ses steps de création/attache mais, au lieu de rendre le terminal, elle redirige vers `/workbench?session=<id>`. La session affichée est portée par le search param `?session=<id>` (source de vérité, résolue via `useAgentSessionHistory`).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, MUI 7 + Emotion, TanStack Query 5, next-intl 4.8, xterm.js 6 (+ WebSocket agent port 4001), Vitest + @testing-library/react.

## Global Constraints

- **Aucun texte en dur** dans les composants : tous les libellés passent par `next-intl` (`useTranslations`). Traductions dans `src/config/translate/{en,fr,es,de,pt}.json` (5 locales).
- `"use client"` en tête de tout composant interactif.
- Types centralisés dans `src/types/index.ts` ; path alias `@/*` → `./src/*`.
- **Ne jamais commiter sans accord explicite** — chaque step "Commit" du plan suppose cet accord déjà donné pour l'exécution.
- Convention de test du repo : **tests unitaires sur logique pure uniquement** (lib/hooks). Pas de test de composant UI (aucun `.test.tsx` n'existe). L'UI se vérifie par `npm run lint`, `npx tsc --noEmit`, `npm run build` et run manuel.
- Vérif standard fin de tâche : `npm run lint` (0 erreur) + `npx tsc --noEmit` (0 erreur). Tâches avec logique pure : `npm run test:web` vert.
- Branche de travail : `feat/workbench-page`.

---

## File Structure

**Créés :**
- `src/lib/effectivePath.ts` — helper pur : résout le cwd effectif d'une session (worktree vs projet vs `.worktrees/<branch>`).
- `src/lib/effectivePath.test.ts` — tests du helper.
- `src/components/agents/ShellTerminal.tsx` — shell xterm/WebSocket réutilisable (extrait de la modal), id dérivé `${sessionId}-shell`.
- `src/components/workbench/Workbench.tsx` — la page Workbench (layout 75/25, empty-state, chips, resize).
- `src/app/(app)/workbench/page.tsx` — route rendant `<Workbench />`.

**Modifiés :**
- `src/components/agents/AgentTerminalModal.tsx` — suppression du step `terminal` + shell inline ; redirections `router.push`.
- `src/components/layout/Sidebar.tsx` — nav item `dashboard`→`workbench` ; clic worktree avec session → route directe.
- `src/components/layout/OverlayTerminal.tsx` — bouton « expand » → `router.push` + close (au lieu de rendre la modal).
- `src/app/page.tsx` — redirect `/` → `/workbench`.
- `src/config/translate/{en,fr,es,de,pt}.json` — namespace `workbench` + `sidebar.workbench` ; suppression `dashboard`.

**Supprimés :**
- `src/app/(app)/dashboard/page.tsx` (remplacé) — un redirect `/dashboard`→`/workbench` prend sa place.
- `src/components/dashboard/Dashboard.tsx`
- `src/components/dashboard/ActiveAgentsWidget.tsx`
- `src/components/dashboard/RecentSessionsWidget.tsx`
- `src/components/dashboard/SummariesWidget.tsx`
- `src/components/dashboard/AllReportsDialog.tsx`
- Hooks orphelins après suppression (vérifier avant retrait) : `src/hooks/useRecentLogs.ts`, `src/hooks/usePendingQuestions.ts`.

> Conservés : `dashboard/IssueCard.tsx`, `dashboard/IssueDetail.tsx`, `dashboard/IssueTimelineModal.tsx` (utilisés hors dashboard).

---

## Task 1: Helper pur `resolveEffectivePath`

Extrait la logique du `useMemo` `effectivePath` de `AgentTerminalModal.tsx:229-253` dans un helper pur testable, réutilisé par le Workbench.

**Files:**
- Create: `src/lib/effectivePath.ts`
- Test: `src/lib/effectivePath.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  export interface EffectivePathInput {
    session?: { worktree_path?: string | null; branch?: string | null } | null;
    projectPath?: string | null;
    worktreePath?: string | null;
    launchMode?: 'worktree' | 'current-branch' | null;
    existingWorktreePath?: string | null;
  }
  export function resolveEffectivePath(input: EffectivePathInput): string | null;
  ```

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/effectivePath.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { resolveEffectivePath } from './effectivePath';

describe('resolveEffectivePath', () => {
	it('current-branch mode → projectPath', () => {
		expect(
			resolveEffectivePath({ launchMode: 'current-branch', projectPath: '/repo' }),
		).toBe('/repo');
	});

	it('explicit worktreePath wins over session', () => {
		expect(
			resolveEffectivePath({
				worktreePath: '/repo/.worktrees/feat-x',
				projectPath: '/repo',
				session: { worktree_path: '/other' },
			}),
		).toBe('/repo/.worktrees/feat-x');
	});

	it('falls back to session.worktree_path', () => {
		expect(
			resolveEffectivePath({ projectPath: '/repo', session: { worktree_path: '/repo/.worktrees/wt' } }),
		).toBe('/repo/.worktrees/wt');
	});

	it('derives .worktrees/<branch> from a non-main branch when no worktree_path', () => {
		expect(
			resolveEffectivePath({ projectPath: '/repo', session: { branch: 'feat/foo' } }),
		).toBe('/repo/.worktrees/feat-foo');
	});

	it('main branch → projectPath (no derivation)', () => {
		expect(
			resolveEffectivePath({ projectPath: '/repo', session: { branch: 'main' } }),
		).toBe('/repo');
	});

	it('uses existingWorktreePath before bare projectPath', () => {
		expect(
			resolveEffectivePath({ projectPath: '/repo', existingWorktreePath: '/repo/.worktrees/ew' }),
		).toBe('/repo/.worktrees/ew');
	});

	it('null projectPath and nothing else → null', () => {
		expect(resolveEffectivePath({})).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npm run test:web -- effectivePath`
Expected: FAIL — `resolveEffectivePath is not a function` / module introuvable.

- [ ] **Step 3: Implémenter le helper**

Créer `src/lib/effectivePath.ts` :
```ts
export interface EffectivePathInput {
	session?: { worktree_path?: string | null; branch?: string | null } | null;
	projectPath?: string | null;
	worktreePath?: string | null;
	launchMode?: 'worktree' | 'current-branch' | null;
	existingWorktreePath?: string | null;
}

/**
 * Résout le répertoire de travail effectif d'une session.
 * Ordre : current-branch → worktreePath explicite → session.worktree_path
 * → dérivation `.worktrees/<branch>` (branche non main/master) → existingWorktreePath → projectPath.
 * Extrait de AgentTerminalModal (useMemo effectivePath).
 */
export function resolveEffectivePath({
	session,
	projectPath,
	worktreePath,
	launchMode,
	existingWorktreePath,
}: EffectivePathInput): string | null {
	if (launchMode === 'current-branch' && projectPath) return projectPath;
	if (worktreePath) return worktreePath;
	if (session?.worktree_path) return session.worktree_path;
	if (projectPath && session?.branch && session.branch !== 'main' && session.branch !== 'master') {
		const dirName = session.branch.replace(/\//g, '-');
		return `${projectPath}/.worktrees/${dirName}`;
	}
	if (projectPath && existingWorktreePath) return existingWorktreePath;
	return projectPath ?? null;
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npm run test:web -- effectivePath`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/effectivePath.ts src/lib/effectivePath.test.ts
git commit -m "feat(workbench): pure resolveEffectivePath helper extracted from modal"
```

---

## Task 2: Composant `ShellTerminal`

Extrait la logique shell xterm/WebSocket inline de `AgentTerminalModal.tsx:602-749` dans un composant réutilisable. Conserve l'id dérivé `${sessionId}-shell` (shell brut distinct de la session tmux de l'agent).

**Files:**
- Create: `src/components/agents/ShellTerminal.tsx`

**Interfaces:**
- Consumes: `getAgentWsUrl` depuis `@/lib/local-fetch`.
- Produces:
  ```ts
  interface ShellTerminalProps {
    sessionId: string;   // l'id de session ; le shell interne utilise `${sessionId}-shell`
    cwd: string | null;  // répertoire de travail
    active: boolean;     // true quand le panneau est visible → refit + focus
    ready?: boolean;     // défaut true ; passer false pour retarder l'init (ex: session DB pas résolue)
  }
  export default function ShellTerminal(props: ShellTerminalProps): JSX.Element;
  ```

- [ ] **Step 1: Créer le composant**

Créer `src/components/agents/ShellTerminal.tsx` :
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { getAgentWsUrl } from '@/lib/local-fetch';

interface ShellTerminalProps {
	sessionId: string;
	cwd: string | null;
	active: boolean;
	ready?: boolean;
}

export default function ShellTerminal({ sessionId, cwd, active, ready = true }: ShellTerminalProps) {
	const [node, setNode] = useState<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const initialized = useRef(false);

	// Init une seule fois quand tout est prêt et le panneau visible.
	useEffect(() => {
		if (!node || !active || !ready || !cwd) return;
		if (initialized.current) return;
		initialized.current = true;

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
			scrollback: 5000,
			theme: {
				background: '#1A1A1A',
				foreground: '#E0E0E0',
				cursor: '#00E5FF',
				selectionBackground: 'rgba(0, 229, 255, 0.3)',
				black: '#1A1A1A',
				red: '#FF5252',
				green: '#69F0AE',
				yellow: '#FFD740',
				blue: '#448AFF',
				magenta: '#E040FB',
				cyan: '#00E5FF',
				white: '#E0E0E0',
				brightBlack: '#616161',
				brightRed: '#FF8A80',
				brightGreen: '#B9F6CA',
				brightYellow: '#FFE57F',
				brightBlue: '#82B1FF',
				brightMagenta: '#EA80FC',
				brightCyan: '#84FFFF',
				brightWhite: '#FFFFFF',
			},
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(node);
		try {
			terminal.loadAddon(new WebglAddon());
		} catch {
			/* fallback canvas */
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
			terminal.focus();
		});

		terminalRef.current = terminal;
		fitAddonRef.current = fitAddon;

		const shellSessionId = `${sessionId}-shell`;
		const ws = new WebSocket(getAgentWsUrl());
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					type: 'init',
					sessionId: shellSessionId,
					cwd,
					cols: terminal.cols,
					rows: terminal.rows,
				}),
			);
		};

		ws.onmessage = (event) => {
			if (typeof event.data === 'string') {
				try {
					const msg = JSON.parse(event.data);
					if (msg.type === 'init-ack') return;
				} catch {
					/* terminal output */
				}
				terminal.write(event.data);
			}
		};

		ws.onclose = () => {
			terminal.write('\r\n\x1b[90m[Shell disconnected]\x1b[0m\r\n');
		};

		terminal.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'input', data }));
			}
		});

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (ws.readyState !== WebSocket.OPEN) return;
			const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 40));
			const button = e.deltaY < 0 ? 64 : 65;
			const seq = `\x1b[<${button};1;1M`;
			for (let i = 0; i < lines; i++) {
				ws.send(JSON.stringify({ type: 'input', data: seq }));
			}
		};
		node.addEventListener('wheel', handleWheel, { passive: false });

		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const observer = new ResizeObserver(() => {
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				fitAddon.fit();
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
				}
			}, 100);
		});
		observer.observe(node);

		return () => {
			node.removeEventListener('wheel', handleWheel);
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			ws.close();
			terminal.dispose();
			terminalRef.current = null;
			wsRef.current = null;
			fitAddonRef.current = null;
			initialized.current = false;
		};
	}, [node, active, ready, cwd, sessionId]);

	// Refit + focus quand le panneau (re)devient visible.
	useEffect(() => {
		if (active) {
			requestAnimationFrame(() => {
				fitAddonRef.current?.fit();
				terminalRef.current?.focus();
			});
		}
	}, [active]);

	return (
		<Box
			onWheel={(e) => e.stopPropagation()}
			sx={{
				flex: 1,
				minHeight: 0,
				overflow: 'hidden',
				display: 'flex',
				alignItems: 'stretch',
				bgcolor: 'background.default',
				'& .xterm': { height: '100%', p: 1 },
				'& .xterm-viewport': {
					overflowY: 'scroll !important',
					'&::-webkit-scrollbar': { width: 6 },
					'&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
				},
			}}
		>
			<Box ref={setNode} sx={{ flex: 1, display: 'flex' }} />
		</Box>
	);
}
```

- [ ] **Step 2: Vérifier lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/ShellTerminal.tsx
git commit -m "feat(workbench): reusable ShellTerminal component extracted from modal"
```

---

## Task 3: Page Workbench — squelette, résolution de session, empty-state

Crée la page et sa route. À ce stade : lit `?session`, résout la session, affiche l'empty-state OU le chat plein-largeur à gauche (sidebar droite ajoutée en Task 4). La route `/workbench` coexiste avec `/dashboard` jusqu'à la Task 6.

**Files:**
- Create: `src/components/workbench/Workbench.tsx`
- Create: `src/app/(app)/workbench/page.tsx`
- Modify: `src/config/translate/fr.json` (+ `en/es/de/pt` en Step 4)

**Interfaces:**
- Consumes: `useAgentSessionHistory` (retourne `AgentSession[]`), `useAgentSession(sessionId)` (retourne `{ session, logs, ensureSession }`), `classifySession` (`ClassifiableSession → 'active'|'past'|'archived'`), `resolveEffectivePath` (Task 1), `AgentChatTab` (props `sessionId, cwd, systemPrompt?, readOnly?, archived?, onFirstUserMessage?, onResume?`).
- Produces: `export default function Workbench(): JSX.Element`.

- [ ] **Step 1: Ajouter les clés i18n `workbench` (fr)**

Dans `src/config/translate/fr.json`, ajouter un namespace `workbench` (à côté de `dashboard`, qui sera retiré en Task 10) :
```json
"workbench": {
	"emptyTitle": "Aucune session sélectionnée",
	"emptyDesc": "Sélectionne une session dans la barre latérale ou lance un nouveau worktree depuis un projet.",
	"chipFiles": "Fichiers",
	"chipActivity": "Activity",
	"chipIssue": "Issue",
	"terminal": "Terminal",
	"newSession": "Nouvelle session",
	"activeSession": "Session active",
	"stopSession": "Arrêter la session"
}
```

- [ ] **Step 2: Créer le composant (squelette + empty-state + chat gauche)**

Créer `src/components/workbench/Workbench.tsx` :
```tsx
'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import { useTranslations } from 'next-intl';
import { useAgentSessionHistory } from '@/hooks/useAgentSession';
import { useAgentSession } from '@/hooks/useAgentSession';
import { useSessionActions } from '@/hooks/useSessionActions';
import { classifySession } from '@/lib/sessionStatus';
import { resolveEffectivePath } from '@/lib/effectivePath';
import AgentChatTab from '@/components/agents/AgentChatTab';

export default function Workbench() {
	const t = useTranslations('workbench');
	const searchParams = useSearchParams();
	const sessionId = searchParams.get('session') ?? undefined;

	const { data: allSessions = [] } = useAgentSessionHistory();
	const { session } = useAgentSession(sessionId);
	const { resume } = useSessionActions();

	// Fallback : la session peut déjà être dans l'historique avant que useAgentSession résolve.
	const resolved = useMemo(
		() => session ?? allSessions.find((s) => s.session_id === sessionId) ?? null,
		[session, allSessions, sessionId],
	);

	const bucket = resolved ? classifySession(resolved) : null;
	const isArchived = bucket === 'archived';
	const chatReadOnly = !!sessionId && bucket !== null && bucket !== 'active';

	const effectivePath = useMemo(
		() =>
			resolveEffectivePath({
				session: resolved,
				projectPath: resolved?.project_path ?? null,
				worktreePath: resolved?.worktree_path ?? null,
			}),
		[resolved],
	);

	if (!sessionId) {
		return (
			<Box
				sx={{
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 2,
					px: 4,
					textAlign: 'center',
				}}
			>
				<TerminalRoundedIcon sx={{ fontSize: 56, color: 'primary.main', opacity: 0.5 }} />
				<Typography variant="h6" sx={{ fontWeight: 600 }}>
					{t('emptyTitle')}
				</Typography>
				<Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
					{t('emptyDesc')}
				</Typography>
			</Box>
		);
	}

	return (
		<Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
			{/* Gauche : conversation 75% */}
			<Box sx={{ flex: '0 0 75%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
				<AgentChatTab
					sessionId={sessionId}
					cwd={effectivePath}
					readOnly={chatReadOnly}
					archived={isArchived}
					onResume={() => {
						resume(sessionId).catch(() => {});
					}}
				/>
			</Box>
			{/* Droite : sidebar (Task 4) */}
			<Box sx={{ flex: 1, minWidth: 0, borderLeft: 1, borderColor: 'divider' }} />
		</Box>
	);
}
```

- [ ] **Step 3: Créer la route**

Créer `src/app/(app)/workbench/page.tsx` :
```tsx
import Workbench from '@/components/workbench/Workbench';

export default function WorkbenchPage() {
	return <Workbench />;
}
```

- [ ] **Step 4: Répliquer les clés i18n `workbench` dans en/es/de/pt**

Ajouter le même bloc `workbench` (valeurs traduites) dans `src/config/translate/en.json`, `es.json`, `de.json`, `pt.json`. Exemple `en.json` :
```json
"workbench": {
	"emptyTitle": "No session selected",
	"emptyDesc": "Select a session in the sidebar or launch a new worktree from a project.",
	"chipFiles": "Files",
	"chipActivity": "Activity",
	"chipIssue": "Issue",
	"terminal": "Terminal",
	"newSession": "New session",
	"activeSession": "Active session",
	"stopSession": "Stop session"
}
```
(Traduire pour es/de/pt en suivant les valeurs existantes des autres namespaces.)

- [ ] **Step 5: Vérifier lint + types + build**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 6: Vérifier manuellement**

Run: `npm run dev` puis ouvrir `http://localhost:4000/workbench` (sans param) → empty-state affiché. Ouvrir `/workbench?session=<un_session_id_existant_en_DB>` → la conversation s'affiche à gauche (75%), placeholder à droite. Utiliser le skill `run` si besoin.

- [ ] **Step 7: Commit**

```bash
git add src/components/workbench/Workbench.tsx "src/app/(app)/workbench/page.tsx" src/config/translate/
git commit -m "feat(workbench): page skeleton with session resolution + empty state"
```

---

## Task 4: Sidebar droite — chips + panneaux (Fichiers/Activity/Issue) + Terminal empilé + resize

Complète le Workbench : sidebar droite avec chips en haut (basculent le panneau haut Fichiers ↔ Activity ↔ Issue), et le `ShellTerminal` empilé en bas, séparés par un handle de resize vertical.

**Files:**
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: `AgentDiffTab` (props `projectPath: string | null`, `branch: string | null`), `AgentActivityTab` (props `session`, `logs`), `AgentIssueTab` (props `owner, repo, issueNumber`), `ShellTerminal` (Task 2 : `sessionId, cwd, active, ready`), `useAgentSession` (fournit `logs`), `Chip` (MUI).
- Produces: état local `topPanel: 'files' | 'activity' | 'issue'` et hauteur du terminal (resize).

- [ ] **Step 1: Ajouter imports + état panneau/resize**

En tête de `Workbench.tsx`, ajouter aux imports :
```tsx
import { useState, useRef, useCallback } from 'react';
import Chip from '@mui/material/Chip';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import AgentDiffTab from '@/components/agents/AgentDiffTab';
import AgentActivityTab from '@/components/agents/AgentActivityTab';
import AgentIssueTab from '@/components/agents/AgentIssueTab';
import ShellTerminal from '@/components/agents/ShellTerminal';
```
Récupérer aussi `logs` depuis le hook : remplacer `const { session } = useAgentSession(sessionId);` par `const { session, logs } = useAgentSession(sessionId);`.

Dans le corps (après `chatReadOnly`), ajouter :
```tsx
const hasIssue = !!resolved?.issue_number;
type TopPanel = 'files' | 'activity' | 'issue';
const [topPanel, setTopPanel] = useState<TopPanel>('files');

// Resize vertical de la zone terminal (px depuis le bas).
const [termHeight, setTermHeight] = useState(240);
const resizing = useRef(false);
const startResize = useCallback((e: React.MouseEvent) => {
	resizing.current = true;
	e.preventDefault();
	const onMove = (ev: MouseEvent) => {
		if (!resizing.current) return;
		const fromBottom = window.innerHeight - ev.clientY;
		setTermHeight(Math.max(120, Math.min(window.innerHeight - 200, fromBottom)));
	};
	const onUp = () => {
		resizing.current = false;
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		document.body.style.userSelect = '';
	};
	document.body.style.userSelect = 'none';
	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup', onUp);
}, []);
```

- [ ] **Step 2: Remplacer le placeholder droit par la sidebar complète**

Remplacer `<Box sx={{ flex: 1, minWidth: 0, borderLeft: 1, borderColor: 'divider' }} />` par :
```tsx
<Box
	sx={{
		flex: 1,
		minWidth: 0,
		borderLeft: 1,
		borderColor: 'divider',
		display: 'flex',
		flexDirection: 'column',
		minHeight: 0,
	}}
>
	{/* Chips */}
	<Box sx={{ display: 'flex', gap: 0.75, p: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
		<Chip
			icon={<DescriptionRoundedIcon sx={{ fontSize: '16px !important' }} />}
			label={t('chipFiles')}
			size="small"
			color={topPanel === 'files' ? 'primary' : 'default'}
			variant={topPanel === 'files' ? 'filled' : 'outlined'}
			onClick={() => setTopPanel('files')}
		/>
		<Chip
			icon={<TimelineRoundedIcon sx={{ fontSize: '16px !important' }} />}
			label={t('chipActivity')}
			size="small"
			color={topPanel === 'activity' ? 'primary' : 'default'}
			variant={topPanel === 'activity' ? 'filled' : 'outlined'}
			onClick={() => setTopPanel('activity')}
		/>
		{hasIssue && (
			<Chip
				icon={<BugReportRoundedIcon sx={{ fontSize: '16px !important' }} />}
				label={t('chipIssue')}
				size="small"
				color={topPanel === 'issue' ? 'primary' : 'default'}
				variant={topPanel === 'issue' ? 'filled' : 'outlined'}
				onClick={() => setTopPanel('issue')}
			/>
		)}
	</Box>

	{/* Panneau haut */}
	<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
		{topPanel === 'files' && (
			<AgentDiffTab
				projectPath={resolved?.worktree_path ?? resolved?.project_path ?? null}
				branch={resolved?.branch ?? null}
			/>
		)}
		{topPanel === 'activity' && <AgentActivityTab session={resolved} logs={logs} />}
		{topPanel === 'issue' && hasIssue && (
			<AgentIssueTab
				owner={resolved!.issue_owner!}
				repo={resolved!.issue_repo!}
				issueNumber={resolved!.issue_number!}
			/>
		)}
	</Box>

	{/* Handle de resize */}
	<Box
		onMouseDown={startResize}
		sx={{
			height: 6,
			flexShrink: 0,
			cursor: 'row-resize',
			bgcolor: 'divider',
			'&:hover': { bgcolor: 'primary.main' },
		}}
	/>

	{/* Terminal empilé */}
	<Box sx={{ height: termHeight, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
		<Box sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
			<Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
				{t('terminal')}
			</Typography>
		</Box>
		<ShellTerminal sessionId={sessionId} cwd={effectivePath} active ready={!!resolved} />
	</Box>
</Box>
```

- [ ] **Step 3: Vérifier lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur. (Vérifier notamment que les props de `AgentActivityTab`/`AgentDiffTab`/`AgentIssueTab` matchent — sinon ajuster selon leurs signatures réelles.)

- [ ] **Step 4: Vérifier manuellement**

Run: `npm run dev` → `/workbench?session=<id>` : chips basculent le panneau haut ; le terminal en bas se connecte (`$` prompt) ; le handle redimensionne. Une session liée à une issue montre le chip Issue.

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/Workbench.tsx
git commit -m "feat(workbench): right sidebar with chips + stacked terminal + vertical resize"
```

---

## Task 5: Header de session + rename-from-prompt + Stop/PiP

Ajoute le header léger du Workbench (titre, chip branche, chip repo, Stop si active, PiP) et la logique rename-from-prompt (renommage auto de la branche `wip-` au 1er message), migrée depuis la modal (`AgentTerminalModal.tsx:441-464` et `:264-274`).

**Files:**
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: `useOverlayTerminal` (méthode `open({ sessionId, projectPath, projectName, isPastSession })`), `useSessionActions` (`stop`), `useQueryClient`, `apiFetch`, `useRouter` (`next/navigation`), `useSnackbar`.
- Produces: header + confirm dialog Stop.

- [ ] **Step 1: Imports + hooks header**

Ajouter aux imports :
```tsx
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import PictureInPictureAltRoundedIcon from '@mui/icons-material/PictureInPictureAltRounded';
import { useOverlayTerminal } from '@/hooks/useOverlayTerminal';
import { useSnackbar } from '@/hooks/useSnackbar';
import { apiFetch } from '@/lib/api-fetch';
```

Dans le corps, ajouter :
```tsx
const tc = useTranslations('common');
const router = useRouter();
const queryClient = useQueryClient();
const overlay = useOverlayTerminal();
const { showSnackbar } = useSnackbar();
const { stop } = useSessionActions(); // (déjà `resume` importé — fusionner : const { stop, resume } = useSessionActions();)

const [confirmClose, setConfirmClose] = useState(false);
const [closing, setClosing] = useState(false);
const firstPromptSent = useRef(false);

const branch = resolved?.branch ?? null;
const repoLabel = resolved?.project_name ?? resolved?.project_path?.split('/').filter(Boolean).pop() ?? '';
const isAutoNamed = !!branch && branch.startsWith('wip-');

const submitRenameFromPrompt = useCallback(
	(promptText: string) => {
		apiFetch('/api/agent-sessions/rename-from-prompt', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionId, prompt: promptText }),
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.branch) {
					if (resolved?.project_path)
						queryClient.invalidateQueries({ queryKey: ['git-worktrees', resolved.project_path] });
					queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
					queryClient.invalidateQueries({ queryKey: ['agent-sessions', 'history'] });
				}
			})
			.catch(() => {});
	},
	[sessionId, resolved?.project_path, queryClient],
);

const handlePip = useCallback(() => {
	if (!sessionId || !effectivePath) return;
	const projectName = effectivePath.split('/').filter(Boolean).pop() ?? 'unknown';
	overlay.open({ sessionId, projectPath: effectivePath, projectName, isPastSession: chatReadOnly });
}, [sessionId, effectivePath, chatReadOnly, overlay]);

const handleStop = useCallback(async () => {
	if (!sessionId) return;
	setClosing(true);
	try {
		await stop(sessionId);
		showSnackbar(tc('sessionKilled'), 'success');
		setConfirmClose(false);
		router.push('/workbench');
	} catch {
		showSnackbar(tc('error'), 'error');
	} finally {
		setClosing(false);
	}
}, [sessionId, stop, showSnackbar, tc, router]);
```

- [ ] **Step 2: Insérer le header au-dessus du split, et brancher `onFirstUserMessage`**

Envelopper le rendu "session sélectionnée" dans un conteneur colonne avec header. Remplacer le `return (<Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>…</Box>)` par :
```tsx
return (
	<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
		{/* Header session */}
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1,
				px: 2,
				py: 1,
				borderBottom: 1,
				borderColor: 'divider',
				flexShrink: 0,
			}}
		>
			<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
				{resolved?.agent_name ?? (bucket === 'active' ? t('activeSession') : t('newSession'))}
			</Typography>
			{branch && (
				<Chip
					icon={<AccountTreeRoundedIcon sx={{ fontSize: '14px !important' }} />}
					label={branch}
					size="small"
					sx={{
						height: 22,
						fontSize: '0.65rem',
						bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
						color: 'primary.main',
						fontWeight: 600,
						'& .MuiChip-icon': { color: 'primary.main' },
					}}
				/>
			)}
			<Box sx={{ flex: 1 }} />
			<Chip
				icon={<FolderOpenRoundedIcon sx={{ fontSize: '14px !important' }} />}
				label={repoLabel}
				size="small"
				sx={{ height: 24, fontSize: '0.7rem', bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05) }}
			/>
			{bucket === 'active' && (
				<Tooltip title={t('stopSession')} arrow>
					<IconButton size="small" onClick={() => setConfirmClose(true)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
						<StopCircleRoundedIcon sx={{ fontSize: 18 }} />
					</IconButton>
				</Tooltip>
			)}
			<IconButton size="small" onClick={handlePip} sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
				<PictureInPictureAltRoundedIcon sx={{ fontSize: 18 }} />
			</IconButton>
		</Box>

		{/* Split gauche/droite */}
		<Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
			{/* … contenu gauche (chat) + droite (sidebar) inchangé … */}
		</Box>

		{/* Confirm stop */}
		<Dialog open={confirmClose} onClose={() => !closing && setConfirmClose(false)} maxWidth="xs" fullWidth>
			<DialogTitle sx={{ fontWeight: 600 }}>{t('stopSession')}</DialogTitle>
			<DialogContent>
				<DialogContentText sx={{ fontSize: '0.85rem' }}>{tc('confirmActionBody')}</DialogContentText>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={() => setConfirmClose(false)} disabled={closing} sx={{ color: 'text.secondary' }}>
					{tc('cancel')}
				</Button>
				<Button onClick={handleStop} disabled={closing} variant="contained" color="error" startIcon={<StopCircleRoundedIcon />}>
					{t('stopSession')}
				</Button>
			</DialogActions>
		</Dialog>
	</Box>
);
```
> Déplacer le `<Box sx={{ flex: '0 0 75%' … }}>` (chat) et la sidebar droite (Task 4) à l'intérieur du `Box` "Split gauche/droite". Sur `AgentChatTab`, ajouter la prop :
```tsx
onFirstUserMessage={(text) => {
	if (isAutoNamed && !firstPromptSent.current) {
		firstPromptSent.current = true;
		submitRenameFromPrompt(text);
	}
}}
```

- [ ] **Step 3: Vérifier la clé i18n `common.confirmActionBody`**

Run: `node -e "console.log(require('./src/config/translate/fr.json').common.confirmActionBody ?? 'MISSING')"`
Si `MISSING`, ajouter dans `common` des 5 locales une clé `confirmActionBody` (fr : « Cette action arrête la session (SDK + tmux). Continuer ? ») OU réutiliser une clé de confirmation existante (`node -e "console.log(Object.keys(require('./src/config/translate/fr.json').common))"` pour choisir).

- [ ] **Step 4: Vérifier lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 5: Vérifier manuellement**

Run: `npm run dev` → `/workbench?session=<id d'une session active>` : header montre nom + branche + repo + Stop + PiP. Le clic PiP ouvre l'overlay. Stop demande confirmation puis renvoie à l'empty-state.

- [ ] **Step 6: Commit**

```bash
git add src/components/workbench/Workbench.tsx src/config/translate/
git commit -m "feat(workbench): session header, PiP, stop, rename-from-prompt"
```

---

## Task 6: Renommage route + redirects + nav Sidebar

Bascule officiellement `/dashboard` → `/workbench` : redirect de compat, `/` → `/workbench`, item de nav.

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (devient un redirect)
- Modify: `src/app/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx:125`
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (`sidebar.workbench`)

**Interfaces:**
- Consumes: `redirect` de `next/navigation`.
- Produces: nav item `workbench`.

- [ ] **Step 1: Transformer `/dashboard` en redirect**

Remplacer le contenu de `src/app/(app)/dashboard/page.tsx` par :
```tsx
import { redirect } from 'next/navigation';

export default function DashboardRedirect() {
	redirect('/workbench');
}
```

- [ ] **Step 2: Rediriger la racine**

Dans `src/app/page.tsx`, remplacer la cible du redirect `'/dashboard'` par `'/workbench'` (garder la même forme que l'existant — vérifier le contenu actuel du fichier avant d'éditer).

- [ ] **Step 3: Nav item Sidebar**

Dans `src/components/layout/Sidebar.tsx`, remplacer la ligne 125 :
```tsx
{ label: t('dashboard'), href: '/dashboard', icon: <DashboardRoundedIcon /> },
```
par :
```tsx
{ label: t('workbench'), href: '/workbench', icon: <DashboardRoundedIcon /> },
```

- [ ] **Step 4: Clé i18n `sidebar.workbench`**

Dans les 5 locales `src/config/translate/*.json`, ajouter dans `sidebar` une clé `workbench` (fr : « Workbench » ; en : « Workbench » ; etc. — le nom reste « Workbench » dans toutes les langues). Laisser `sidebar.dashboard` pour l'instant (retiré en Task 10).

- [ ] **Step 5: Vérifier lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur ; build OK.

- [ ] **Step 6: Vérifier manuellement**

Run: `npm run dev` → ouvrir `/` → redirige vers `/workbench`. Ouvrir `/dashboard` → redirige vers `/workbench`. La sidebar affiche « Workbench » et l'item est actif sur `/workbench`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" src/app/page.tsx src/components/layout/Sidebar.tsx src/config/translate/
git commit -m "feat(workbench): route rename, /dashboard + / redirects, sidebar nav"
```

---

## Task 7: Modal → redirection (suppression du step terminal)

La `AgentTerminalModal` ne rend plus le terminal : elle redirige vers `/workbench?session=<id>` dès que la session est prête (création ou attache), puis se ferme. Supprime tout le bloc `step === 'terminal'` et la logique shell/tabs/PiP/rename inline (désormais dans le Workbench).

**Files:**
- Modify: `src/components/agents/AgentTerminalModal.tsx`

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`).
- Produces: la modal, à l'issue de `handleLaunch`/`handleLaunchCurrentBranch`/branche `existingWorktree`/attache `existingSessionId`, appelle `router.push('/workbench?session=<id>')` + `onClose()`.

- [ ] **Step 1: Importer le router + helper de redirection**

Ajouter `import { useRouter } from 'next/navigation';` et, dans le composant :
```tsx
const router = useRouter();
const goToWorkbench = useCallback(
	(id: string) => {
		router.push(`/workbench?session=${encodeURIComponent(id)}`);
		onClose();
	},
	[router, onClose],
);
```

- [ ] **Step 2: Rediriger à l'attache d'une session existante**

Remplacer le `useEffect` `AgentTerminalModal.tsx:327-331` (qui faisait `setStep('terminal')` pour `existingSessionId`) par :
```tsx
useEffect(() => {
	if (open && existingSessionId) {
		goToWorkbench(existingSessionId);
	}
}, [open, existingSessionId, goToWorkbench]);
```

- [ ] **Step 3: Rediriger après création (worktree)**

Dans `handleLaunch` (`:393-437`), remplacer `setStep('terminal');` (dans le `try`, après `ensureSession`) par `goToWorkbench(sessionId);`.

- [ ] **Step 4: Rediriger après création (current-branch)**

Dans `handleLaunchCurrentBranch` (`:479-512`), remplacer `setStep('terminal');` par `goToWorkbench(sessionId);`.

- [ ] **Step 5: Rediriger pour un worktree existant**

Dans le `useEffect` `existingWorktree` (`:342-363`), remplacer `setStep('terminal');` par `goToWorkbench(sessionId);`.

- [ ] **Step 6: Supprimer le bloc de rendu du step terminal + logique morte**

Supprimer :
- tout le JSX `{step === 'terminal' && ( … )}` (`:1305-1403`) — tabs, `AgentChatTab`, `AgentActivityTab`, `AgentDiffTab`, shell `<Box ref={setShellTermNode} …>`, `AgentIssueTab` ;
- le `useEffect` d'init shell (`:602-749`) et l'`useEffect` refit shell (`:588-595`) ;
- les états/refs devenus inutilisés : `activeTab`, `termTabOrder`, `shellTermNode`, `shellTerminalRef`, `shellWsRef`, `shellFitAddonRef`, `shellInitialized`, `termTabs`/`orderedTermTabs`/`activeTabKey`, `handlePip`, `submitRenameFromPrompt`, `chatSystemPrompt`, `effectivePath`/`effectivePathRef`, `handleCloseSession`, `confirmCloseOpen`/`closingSession`, `overlay`, `resume`, `hasIssue`, `waitingForSession` ;
- les imports MUI/xterm/icônes désormais inutilisés (`Terminal`, `FitAddon`, `WebglAddon`, `DraggableTabs`, `AgentChatTab`, `AgentActivityTab`, `AgentDiffTab`, `AgentIssueTab`, `PictureInPictureAltRounded`, `TimelineRounded`, `DifferenceRounded`, `BugReportRounded`, `StopCircleRounded`, `Tooltip` si plus utilisé, etc.) ;
- le second `<Dialog>` de confirmation de fermeture (`:1405-1435`) ;
- retirer `'terminal'` du type d'union de `step` → `useState<'project' | 'launch-mode' | 'branch'>('project')`.

Le `step === 'terminal'` du header (chip branche `:827`, boutons Stop/PiP `:857-882`) est retiré aussi. Ne garder dans le header que titre + chip folder + close.

> Astuce : après suppression, `npx tsc --noEmit` liste les symboles/imports orphelins restants — les retirer un par un jusqu'à 0 erreur.

- [ ] **Step 7: Vérifier lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur ; build OK. (Les warnings `no-unused-vars` d'ESLint aident à finir le nettoyage.)

- [ ] **Step 8: Vérifier manuellement chaque parcours**

Run: `npm run dev`. Vérifier :
1. Sidebar → « + » nouvelle session → choisir projet → mode → (worktree) nom → **redirige vers `/workbench?session=…`**, la page se remplit.
2. Sidebar → projet → mode current-branch → redirige idem.
3. Issue (`IssueDetail`) → lancer agent → redirige.
4. Workspace (`BranchDetail`) → lancer dans worktree existant → redirige.
5. Archives → clic session archivée → redirige (chat read-only).

- [ ] **Step 9: Commit**

```bash
git add src/components/agents/AgentTerminalModal.tsx
git commit -m "refactor(workbench): modal redirects to /workbench instead of rendering terminal"
```

---

## Task 8: Sidebar — clic worktree avec session → route directe

Évite le flash de modal : un worktree qui a déjà une session DB navigue directement vers le Workbench.

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (~356-380)

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`).
- Produces: `onClick` du worktree route directement quand `wtSession` existe.

- [ ] **Step 1: Importer/instancier le router**

Vérifier si `useRouter` est déjà importé dans `Sidebar.tsx` ; sinon ajouter `import { useRouter } from 'next/navigation';` et `const router = useRouter();` dans le composant.

- [ ] **Step 2: Router directement pour un worktree avec session**

Remplacer le `onClick` du worktree (`:361-380`) par :
```tsx
onClick={() =>
	wtSession
		? router.push(`/workbench?session=${encodeURIComponent(wtSession.session_id)}`)
		: setModalConfig({
				projectPath: view.path,
				existingWorktree: { branch: wt.branch, worktreePath: wt.path },
			})
}
```
(Les entrées « nouvelle session » `setModalConfig({})` et « nouveau worktree » `setModalConfig({ projectPath: view.path })` restent inchangées.)

- [ ] **Step 3: Vérifier lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Vérifier manuellement**

Run: `npm run dev` → cliquer un worktree **actif** (avec session) dans PROJETS → navigation directe vers `/workbench?session=…` sans flash de modal. Cliquer un worktree **sans** session → la modal s'ouvre (puis redirige à la création).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(workbench): sidebar worktree with session routes straight to workbench"
```

---

## Task 9: OverlayTerminal — « expand » vers la page

Le bouton « expand » du PiP rendait `<AgentTerminalModal>` (qui redirige désormais → cassé). On le réécrit en navigation directe + fermeture du PiP.

**Files:**
- Modify: `src/components/layout/OverlayTerminal.tsx`

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`).
- Produces: « expand » → `router.push('/workbench?session=<id>')` + `close()`.

- [ ] **Step 1: Router + handler expand**

Ajouter `import { useRouter } from 'next/navigation';` et `const router = useRouter();`. Supprimer l'import `AgentTerminalModal` et l'état `expanded`/`setExpanded` (`:40`, `:51`).

- [ ] **Step 2: Remplacer le rendu conditionnel `expanded`**

Supprimer le bloc `if (expanded) { return <AgentTerminalModal … /> }` (`:193-203`). Modifier le bouton OpenInFull (`:257-263`) :
```tsx
<IconButton
	size="small"
	onClick={() => {
		if (session) router.push(`/workbench?session=${encodeURIComponent(session.sessionId)}`);
		close();
	}}
	sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'text.primary' } }}
>
	<OpenInFullRoundedIcon sx={{ fontSize: 14 }} />
</IconButton>
```
Retirer aussi la remise à zéro `setExpanded(false)` dans le bloc de reset de session (`:51`) et la dépendance `expanded` du `useEffect` d'init terminal (`:57`, `:152`).

- [ ] **Step 3: Vérifier lint + types + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 0 erreur ; build OK.

- [ ] **Step 4: Vérifier manuellement**

Run: `npm run dev` → ouvrir un PiP (bouton PiP du Workbench) → cliquer « expand » → navigue vers `/workbench?session=…` et le PiP se ferme.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/OverlayTerminal.tsx
git commit -m "feat(workbench): PiP expand navigates to workbench page"
```

---

## Task 10: Suppression widgets Dashboard + hooks orphelins + nettoyage i18n

Retire le Dashboard et ses widgets, les hooks devenus orphelins, et le namespace i18n `dashboard`.

**Files:**
- Delete: `src/components/dashboard/Dashboard.tsx`, `ActiveAgentsWidget.tsx`, `RecentSessionsWidget.tsx`, `SummariesWidget.tsx`, `AllReportsDialog.tsx`
- Delete (après vérif) : `src/hooks/useRecentLogs.ts`, `src/hooks/usePendingQuestions.ts`
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (retirer `dashboard`, `sidebar.dashboard`)

**Interfaces:**
- Consumes: rien.
- Produces: rien (nettoyage).

- [ ] **Step 1: Vérifier que rien d'autre n'importe les widgets/hooks à supprimer**

Run:
```bash
grep -rn "ActiveAgentsWidget\|RecentSessionsWidget\|SummariesWidget\|AllReportsDialog\|components/dashboard/Dashboard'" src --include="*.tsx" --include="*.ts"
grep -rn "useRecentLogs\|useAgentSummaries\|usePendingQuestions" src --include="*.tsx" --include="*.ts"
```
Expected: aucune référence hors des fichiers listés à supprimer (et hors `Dashboard.tsx` lui-même). Si une autre référence apparaît, **ne pas supprimer** le fichier concerné et le noter.

- [ ] **Step 2: Supprimer les fichiers**

Run:
```bash
git rm src/components/dashboard/Dashboard.tsx \
	src/components/dashboard/ActiveAgentsWidget.tsx \
	src/components/dashboard/RecentSessionsWidget.tsx \
	src/components/dashboard/SummariesWidget.tsx \
	src/components/dashboard/AllReportsDialog.tsx \
	src/hooks/useRecentLogs.ts \
	src/hooks/usePendingQuestions.ts
```
(Retirer de la commande les hooks encore référencés d'après Step 1.)

- [ ] **Step 3: Nettoyer l'i18n**

Dans les 5 locales `src/config/translate/*.json`, supprimer le namespace `dashboard` et la clé `sidebar.dashboard`. Garder `workbench` et `sidebar.workbench`.

- [ ] **Step 4: Vérifier lint + types + tests + build**

Run: `npm run lint && npx tsc --noEmit && npm run test:web && npm run build`
Expected: 0 erreur ; tests verts ; build OK. (Toute référence oubliée à une clé `dashboard.*` ou à un fichier supprimé remontera ici.)

- [ ] **Step 5: Vérifier manuellement le parcours complet**

Run: `npm run dev`. Parcours : `/` → `/workbench` empty-state ; lancer une nouvelle session depuis un projet → conversation + fichiers + terminal ; basculer les chips ; ouvrir une session existante depuis PROJETS ; PiP + expand ; ouvrir une session archivée (read-only). Aucune trace de l'ancien Dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(workbench): remove dashboard widgets, orphan hooks, dashboard i18n"
```

---

## Self-Review (effectuée)

**Spec coverage :** page Workbench (T3-T5) ; layout 75/25 + chips + terminal empilé + resize (T4) ; empty-state (T3) ; `?session` source de vérité (T3) ; modal redirige (T7) ; Sidebar sélecteur direct/modal (T8) ; OverlayTerminal expand (T9) ; ShellTerminal `${sessionId}-shell` (T2) ; effectivePath (T1) ; rename-from-prompt (T5) ; Stop/PiP (T5) ; route rename + redirects + nav (T6) ; suppression widgets/hooks/i18n (T10). Tous les points du spec sont couverts.

**Placeholder scan :** aucun TODO/TBD ; code complet fourni pour chaque step de logique ; steps UI avec critères de vérif concrets.

**Type consistency :** `resolveEffectivePath` (T1) est appelé avec la même signature en T3. `ShellTerminal` props (`sessionId, cwd, active, ready`) identiques T2↔T4. `goToWorkbench(id)` cohérent en T7. `AgentChatTab`/`AgentDiffTab`/`AgentActivityTab`/`AgentIssueTab` : props à revérifier contre leurs signatures réelles au moment de l'implémentation (noté en T4 Step 3).

**Point de vigilance exécution :** T4/T5 supposent les signatures exactes de `AgentActivityTab`/`AgentDiffTab`/`AgentIssueTab` telles qu'utilisées aujourd'hui dans la modal (`session`+`logs` ; `projectPath`+`branch` ; `owner`+`repo`+`issueNumber`). Les confirmer par lecture avant de câbler.
