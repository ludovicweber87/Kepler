# Archived Session Recap in Main Window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pour une session archivée, retirer l'onglet Activity de la colonne droite et afficher le récap (logs summary/error) en markdown dans la fenêtre principale (à la place du chat).

**Architecture:** Extraire `buildReport` (markdown des logs) dans un module pur testable `src/lib/activityReport.ts`, réutilisé par le bouton Publish existant et par un nouveau composant `SessionRecap` (rendu `react-markdown`). `Workbench.tsx` branche le tout conditionnellement sur `isArchived` (déjà dérivé). Nettoyage de la prop `archived` devenue morte dans `AgentChatTab`.

**Tech Stack:** React 19, Next.js 16 (`'use client'`), TypeScript 5 strict, MUI 7 Tabs, next-intl 4.8 (5 locales), react-markdown + remark-gfm, Vitest (logique pure).

## Global Constraints

- **Jamais de texte en dur** : tout label/texte via `useTranslations` + clés dans `src/config/translate/{en,fr,es,de,pt}.json` (5 locales).
- **Tests = logique pure uniquement** (Vitest, `*.test.ts`). UI vérifiée par `npm run lint` + `npx tsc --noEmit` + `npm run build` + run manuel.
- `"use client"` sur tout composant interactif. Path alias `@/*` → `./src/*`.
- `buildReport` : signature conservée `buildReport(session: AgentSession, logs: AgentActivityLog[], labels: { reportTitle: string; branch: string }): string`. Il ne filtre PAS les logs — le caller passe déjà les logs voulus.
- Rendu markdown : `react-markdown` + `remark-gfm` (même stack que `src/components/agents/chat/ChatBubble.tsx`).
- Sessions non archivées : comportement inchangé.
- Commits locaux par tâche sur la branche worktree, **aucun push sans accord explicite**.

---

### Task 1: Extraire `buildReport` (+ `formatTime`) dans `src/lib/activityReport.ts`

Sortir la fonction pure de construction du markdown de `AgentActivityTab` vers un module réutilisable et testé.

**Files:**
- Create: `src/lib/activityReport.ts`
- Create: `src/lib/activityReport.test.ts`
- Modify: `src/components/agents/AgentActivityTab.tsx` (retrait des copies locales + import)

**Interfaces:**
- Consumes: `AgentSession`, `AgentActivityLog` from `@/hooks/useAgentSession`.
- Produces:
  - `formatTime(dateStr: string): string`
  - `buildReport(session: AgentSession, logs: AgentActivityLog[], labels: { reportTitle: string; branch: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/activityReport.test.ts
import { describe, it, expect } from 'vitest';
import { buildReport } from './activityReport';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

const baseSession = { branch: 'feat/x' } as AgentSession;
const log = (
	log_type: AgentActivityLog['log_type'],
	content: string,
): AgentActivityLog =>
	({ id: log_type + content, log_type, content, created_at: '2026-07-15T10:00:00.000Z' } as AgentActivityLog);
const labels = { reportTitle: 'Rapport agent', branch: 'Branch' };

describe('buildReport', () => {
	it('includes the title header and footer', () => {
		const md = buildReport(baseSession, [], labels);
		expect(md).toContain('## 🤖 Rapport agent');
		expect(md).toContain('*Published by [Devora](https://github.com)*');
	});

	it('includes the branch line when the session has a branch', () => {
		const md = buildReport(baseSession, [], labels);
		expect(md).toContain('**Branch:** `feat/x`');
	});

	it('omits the branch line when there is no branch', () => {
		const md = buildReport({ branch: null } as unknown as AgentSession, [], labels);
		expect(md).not.toContain('**Branch:**');
	});

	it('renders each log with its type icon and content', () => {
		const md = buildReport(baseSession, [
			log('commit', 'did a commit'),
			log('file_change', 'changed a file'),
			log('error', 'boom'),
			log('summary', 'a summary'),
			log('ask_question', 'a question'),
			log('info', 'some info'),
		], labels);
		expect(md).toMatch(/📦 did a commit/);
		expect(md).toMatch(/📝 changed a file/);
		expect(md).toMatch(/❌ boom/);
		expect(md).toMatch(/📋 a summary/);
		expect(md).toMatch(/❓ a question/);
		expect(md).toMatch(/ℹ️ some info/);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/activityReport.test.ts`
Expected: FAIL — `Cannot find module './activityReport'`.

- [ ] **Step 3: Create the module**

```ts
// src/lib/activityReport.ts
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

export function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function buildReport(
	session: AgentSession,
	logs: AgentActivityLog[],
	labels: { reportTitle: string; branch: string },
): string {
	const lines: string[] = [];
	lines.push(`## 🤖 ${labels.reportTitle}`);
	lines.push('');
	if (session.branch) lines.push(`**${labels.branch}:** \`${session.branch}\``);
	lines.push('');

	for (const log of logs) {
		const time = formatTime(log.created_at);
		const icon =
			log.log_type === 'commit'
				? '📦'
				: log.log_type === 'file_change'
					? '📝'
					: log.log_type === 'error'
						? '❌'
						: log.log_type === 'summary'
							? '📋'
							: log.log_type === 'ask_question'
								? '❓'
								: 'ℹ️';
		lines.push(`- \`${time}\` ${icon} ${log.content}`);
	}

	lines.push('');
	lines.push('---');
	lines.push('*Published by [Devora](https://github.com)*');
	return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/activityReport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update `AgentActivityTab.tsx` to import from the lib**

In `src/components/agents/AgentActivityTab.tsx`:

1. Add the import (after the existing `import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';` line):

```tsx
import { buildReport, formatTime } from '@/lib/activityReport';
```

2. Delete the local `function formatTime(...) { ... }` block (currently lines 32-35).
3. Delete the local `function buildReport(...) { ... }` block (currently lines 43-75).

Leave every other usage unchanged: `handlePublish` still calls `buildReport(session, visibleLogs, { reportTitle: t('reportTitle'), branch: t('branch') })`, and the timeline still calls `formatTime(log.created_at)` — both now resolve to the imported versions.

- [ ] **Step 6: Verify types, lint, tests**

Run: `npx tsc --noEmit && npx eslint src/components/agents/AgentActivityTab.tsx && npx vitest run src/lib/activityReport.test.ts`
Expected: no errors; 4/4 tests pass. (No "unused" warning — both `buildReport` and `formatTime` are still used in `AgentActivityTab`.)

- [ ] **Step 7: Commit** (accord requis avant commit)

```bash
git add src/lib/activityReport.ts src/lib/activityReport.test.ts src/components/agents/AgentActivityTab.tsx
git commit -m "refactor(activity): extraire buildReport dans src/lib/activityReport (+tests)"
```

---

### Task 2: Clé i18n `workbench.tabRecap` (5 locales)

**Files:**
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (namespace `workbench`)

**Interfaces:**
- Produces: clé `workbench.tabRecap` via `useTranslations('workbench')` → `t('tabRecap')`.

- [ ] **Step 1: Ajouter la clé dans chaque locale**

Dans chaque fichier, à l'intérieur de l'objet `"workbench"`, ajouter `tabRecap` après `"tabChat"`. Mind les virgules JSON. Valeurs :

- `en.json` : `"tabRecap": "Recap"`
- `fr.json` : `"tabRecap": "Récap"`
- `es.json` : `"tabRecap": "Resumen"`
- `de.json` : `"tabRecap": "Zusammenfassung"`
- `pt.json` : `"tabRecap": "Resumo"`

Exemple (fr.json), la ligne `"tabChat": "Chat",` est suivie de la nouvelle ligne :

```json
		"tabChat": "Chat",
		"tabRecap": "Récap",
		"tabChanges": "Changes",
```

- [ ] **Step 2: Vérifier JSON + présence de la clé**

Run: `node -e "for (const l of ['en','fr','es','de','pt']) { const j=require('./src/config/translate/'+l+'.json'); if(!j.workbench.tabRecap) throw new Error('missing in '+l);} console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit** (accord requis avant)

```bash
git add src/config/translate/*.json
git commit -m "i18n(workbench): clé tabRecap (5 locales)"
```

---

### Task 3: Composant `SessionRecap`

Rend le récap markdown d'une session (logs `summary`/`error`), avec états chargement / vide.

**Files:**
- Create: `src/components/agents/SessionRecap.tsx`

**Interfaces:**
- Consumes: `buildReport` from `@/lib/activityReport` (Task 1) ; `AgentSession`, `AgentActivityLog` from `@/hooks/useAgentSession` ; keys `agentActivity.{reportTitle,branch,noActivity,sessionLoading}`.
- Produces: default export `SessionRecap`, props `{ session: AgentSession | null; logs: AgentActivityLog[] }`.

- [ ] **Step 1: Créer le composant**

```tsx
// src/components/agents/SessionRecap.tsx
'use client';

import { useTranslations } from 'next-intl';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildReport } from '@/lib/activityReport';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

interface SessionRecapProps {
	session: AgentSession | null;
	logs: AgentActivityLog[];
}

function Centered({ text }: { text: string }) {
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
				{text}
			</Typography>
		</Box>
	);
}

export default function SessionRecap({ session, logs }: SessionRecapProps) {
	const t = useTranslations('agentActivity');

	if (!session) return <Centered text={t('sessionLoading')} />;

	const visibleLogs = logs.filter(
		(l) => l.log_type === 'summary' || l.log_type === 'error',
	);
	if (visibleLogs.length === 0) return <Centered text={t('noActivity')} />;

	const markdown = buildReport(session, visibleLogs, {
		reportTitle: t('reportTitle'),
		branch: t('branch'),
	});

	return (
		<Box
			sx={{
				height: '100%',
				overflowY: 'auto',
				px: 2,
				py: 1.5,
				fontSize: '0.85rem',
				lineHeight: 1.6,
				color: 'text.primary',
				'& h2': { fontSize: '1rem', fontWeight: 700, mt: 0 },
				'& p': { my: 0.5 },
				'& ul': { pl: 2, my: 0.5 },
				'& code': {
					fontFamily: '"JetBrains Mono", monospace',
					fontSize: '0.78rem',
					bgcolor: 'background.default',
					px: 0.5,
					borderRadius: 0.5,
				},
				'& pre': {
					overflowX: 'auto',
					bgcolor: 'background.default',
					p: 1,
					borderRadius: 1,
				},
				'& a': { color: 'primary.main' },
			}}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
		</Box>
	);
}
```

- [ ] **Step 2: Vérifier types + lint**

Run: `npx tsc --noEmit && npx eslint src/components/agents/SessionRecap.tsx`
Expected: aucune erreur.

- [ ] **Step 3: Commit** (accord requis avant)

```bash
git add src/components/agents/SessionRecap.tsx
git commit -m "feat(workbench): composant SessionRecap (récap markdown)"
```

---

### Task 4: Brancher `Workbench.tsx` sur `isArchived`

Label d'onglet gauche conditionnel, rendu SessionRecap vs AgentChatTab, retrait de l'onglet Activity à droite pour les archivées, dérivation `effectiveRightTab`.

**Files:**
- Modify: `src/components/workbench/Workbench.tsx`

**Interfaces:**
- Consumes: `SessionRecap` (Task 3, default import) ; `t('tabRecap')` (Task 2) ; existants `isArchived`, `rightTab`/`setRightTab`, `RightTab`, `CHAT_TAB`, `activeTab`, `resolved`, `logs`.

- [ ] **Step 1: Importer `SessionRecap`**

Ajouter avec les autres imports de composants agents (près de `import ChangedFilesList from '@/components/agents/ChangedFilesList';`) :

```tsx
import SessionRecap from '@/components/agents/SessionRecap';
```

- [ ] **Step 2: Dériver `effectiveRightTab`**

Juste après la déclaration de `activeFileDiff` (actuellement ligne 128-129), ajouter :

```tsx
	// Session archivée : l'onglet Activity disparaît → on dérive un onglet droit valide
	// pour que <Tabs value> corresponde toujours à un <Tab> rendu (évite le warning MUI).
	const effectiveRightTab: RightTab =
		isArchived && rightTab === 'activity' ? 'changes' : rightTab;
```

> Note : on NE modifie PAS l'effet de reset (`useEffect([sessionId])`) ni ses dépendances. Ajouter `isArchived` à ses deps ré-effacerait `openFiles` au chargement de la session. La dérivation `effectiveRightTab` suffit et est robuste au timing.

- [ ] **Step 3: Label d'onglet gauche conditionnel**

Remplacer (actuellement ligne 349) :

```tsx
						<Tab value={CHAT_TAB} label={t('tabChat')} />
```

par :

```tsx
						<Tab value={CHAT_TAB} label={isArchived ? t('tabRecap') : t('tabChat')} />
```

- [ ] **Step 4: Rendu gauche conditionnel (SessionRecap vs Chat)**

Remplacer le bloc « Contenu : on garde le chat monté… » (actuellement lignes 395-422, c.-à-d. la `<Box>` avec `display: activeTab === CHAT_TAB ? 'flex' : 'none'` contenant `<AgentChatTab .../>`) par :

```tsx
						{/* Contenu de l'onglet de base : récap (archivé) ou chat (sinon). */}
						{isArchived ? (
							activeTab === CHAT_TAB && (
								<Box sx={{ flex: 1, minHeight: 0 }}>
									<SessionRecap session={resolved} logs={logs} />
								</Box>
							)
						) : (
							<Box
								sx={{
									flex: 1,
									minHeight: 0,
									display: activeTab === CHAT_TAB ? 'flex' : 'none',
									flexDirection: 'column',
								}}
							>
								<AgentChatTab
									sessionId={sessionId}
									cwd={effectivePath}
									systemPrompt={resolved?.system_prompt ?? undefined}
									readOnly={chatReadOnly}
									createPrPrompt={repoSettings.create_pr_prompt}
									onResume={() => {
										resume(sessionId).catch(() => {});
									}}
									onOpenChanges={openChanges}
									onFirstUserMessage={(text) => {
										if (isAutoNamed && !firstPromptSent.current) {
											firstPromptSent.current = true;
											submitRenameFromPrompt(text);
										}
									}}
								/>
							</Box>
						)}
```

> Note : la prop `archived={isArchived}` a été retirée de cet appel (AgentChatTab n'est plus monté pour les archivées ; la prop est nettoyée en Task 5).

- [ ] **Step 5: Colonne droite — retirer l'onglet Activity pour les archivées + utiliser `effectiveRightTab`**

Dans la barre d'onglets droite, remplacer `value={rightTab}` par `value={effectiveRightTab}` :

```tsx
						<Tabs
							value={effectiveRightTab}
							onChange={(_, val) => setRightTab(val as RightTab)}
```

Puis rendre l'onglet Activity conditionnel. Remplacer (actuellement lignes 486-491) :

```tsx
							<Tab
								value="activity"
								iconPosition="start"
								icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
								label={t('chipActivity')}
							/>
```

par :

```tsx
							{!isArchived && (
								<Tab
									value="activity"
									iconPosition="start"
									icon={<TimelineRoundedIcon sx={{ fontSize: 16 }} />}
									label={t('chipActivity')}
								/>
							)}
```

- [ ] **Step 6: Panneau droit — piloter par `effectiveRightTab` et masquer Activity si archivé**

Remplacer le switch du panneau droit (actuellement lignes 503-519) par :

```tsx
						{/* Panneau droit */}
						<Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
							{effectiveRightTab === 'changes' && (
								<ChangedFilesList
									changedFiles={changedFiles}
									onOpenFile={openChanges}
								/>
							)}
							{effectiveRightTab === 'activity' && !isArchived && (
								<AgentActivityTab session={resolved} logs={logs} />
							)}
							{effectiveRightTab === 'issue' && hasIssue && (
								<AgentIssueTab
									owner={resolved!.issue_owner!}
									repo={resolved!.issue_repo!}
									issueNumber={resolved!.issue_number!}
								/>
							)}
						</Box>
```

- [ ] **Step 7: Vérifier types + lint + build**

Run: `npx tsc --noEmit && npx eslint src/components/workbench/Workbench.tsx && npm run build`
Expected: succès complet. (`AgentChatTab` a encore une prop optionnelle `archived` avec défaut — ne pas la passer ne casse rien ; nettoyage en Task 5.)

- [ ] **Step 8: Commit** (accord requis avant)

```bash
git add src/components/workbench/Workbench.tsx
git commit -m "feat(workbench): récap markdown à gauche + retrait Activity droite pour les sessions archivées"
```

---

### Task 5: Nettoyer la prop `archived` morte dans `AgentChatTab` + clé i18n

`AgentChatTab` n'étant plus monté pour les archivées, la prop `archived` et sa branche sont mortes.

**Files:**
- Modify: `src/components/agents/AgentChatTab.tsx`
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (namespace `agentChat`)

**Interfaces:**
- Produces: `AgentChatTab` sans prop `archived` (bandeau read-only unique `t('readOnly')`, bouton Reprendre toujours affiché en read-only).

- [ ] **Step 1: Confirmer que `archivedReadOnly` n'est plus référencée hors JSON**

Run: `grep -rn "archivedReadOnly" src/ | grep -v "translate/"`
Expected: aucune ligne (après retrait au Step 2 ; avant retrait, la seule ligne est `AgentChatTab.tsx:158`).

- [ ] **Step 2: Retirer la prop `archived` de l'interface + signature**

Dans `src/components/agents/AgentChatTab.tsx` :

Supprimer de l'interface `Props` (lignes 24-25) :

```tsx
	/** Archived sessions are read-only with no "Reprendre" (resume) affordance. */
	archived?: boolean;
```

Supprimer de la déstructuration de signature (ligne 41) :

```tsx
	archived = false,
```

- [ ] **Step 3: Simplifier la branche read-only**

Remplacer (lignes 157-170) :

```tsx
					<Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
						{archived ? t('archivedReadOnly') : t('readOnly')}
					</Typography>
					{!archived && (
						<Button
							size="small"
							variant="contained"
							startIcon={<PlayArrowRoundedIcon />}
							onClick={() => onResume?.()}
							sx={{ textTransform: 'none' }}
						>
							{t('resume')}
						</Button>
					)}
```

par :

```tsx
					<Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
						{t('readOnly')}
					</Typography>
					<Button
						size="small"
						variant="contained"
						startIcon={<PlayArrowRoundedIcon />}
						onClick={() => onResume?.()}
						sx={{ textTransform: 'none' }}
					>
						{t('resume')}
					</Button>
```

- [ ] **Step 4: Retirer la clé `agentChat.archivedReadOnly` des 5 locales**

Dans chaque `src/config/translate/{en,fr,es,de,pt}.json`, supprimer la clé `archivedReadOnly` de l'objet `"agentChat"`. Attention aux virgules JSON (pas de virgule pendante ; pas de double virgule).

- [ ] **Step 5: Vérifier types, lint, JSON, build**

Run:
```bash
npx tsc --noEmit && npx eslint src/components/agents/AgentChatTab.tsx && \
node -e "for (const l of ['en','fr','es','de','pt']) { const j=require('./src/config/translate/'+l+'.json'); if(j.agentChat.archivedReadOnly!==undefined) throw new Error('archivedReadOnly still in '+l); if(!j.agentChat.readOnly) throw new Error('readOnly missing in '+l);} console.log('i18n ok')" && \
grep -rn "archivedReadOnly" src/ || echo "no refs (expected)"
```
Expected: tsc/eslint clean, `i18n ok`, `no refs (expected)`.

- [ ] **Step 6: Commit** (accord requis avant)

```bash
git add src/components/agents/AgentChatTab.tsx src/config/translate/*.json
git commit -m "refactor(chat): retirer la prop archived morte + clé i18n archivedReadOnly"
```

- [ ] **Step 7: Vérification globale + manuelle**

Run: `npm run lint && npx tsc --noEmit && npm run build && npx vitest run src/lib/activityReport.test.ts`
Expected: tout vert.

Run manuel (`npm run dev`) :
1. Session **non archivée** : onglet gauche « Chat », colonne droite `Changes | Activity | Issue` — inchangé.
2. Session **archivée** : onglet gauche « Récap » rendant les logs summary/error en markdown ; colonne droite `Changes` (+ `Issue` si liée), **sans** Activity ; clic sur un fichier dans Changes ouvre un onglet fichier à gauche ; état vide « Aucune activité » si aucun log ; aucun warning MUI console.

---

## Notes d'exécution

- **Ordre** : 1 → 2 → 3 → 4 → 5. Tasks 1-3 indépendantes ; Task 4 dépend de 1/2/3 ; Task 5 dépend de 4.
- **Commits** : locaux uniquement, aucun push sans accord explicite de Ludovic.
- **Tests** : seule la logique pure (`activityReport.ts`) est testée en Vitest. Le reste : lint + tsc + build + run manuel.
