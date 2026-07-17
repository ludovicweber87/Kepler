# Refonte UI Settings — accordions par catégorie + liste dense GitHub Projects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réorganiser la page Settings en accordions par catégorie et remplacer la pile d'accordions-projet par une liste dense triée (connectés d'abord) avec état de connexion visible.

**Architecture:** Extraire la logique pure de tri/filtre/aplatissement dans un module testable (`projectListUtils.ts`), puis construire deux composants de présentation (`ProjectList`, `ProjectRow`) et refondre `SettingsPanel` autour de 2 `Accordion` de catégorie. Aucun changement backend/hook.

**Tech Stack:** React 19, Next.js 16 (App Router, "use client"), TypeScript 5 strict, MUI 7, next-intl 4, Vitest.

## Global Constraints

- UI 100 % en `next-intl` — **jamais de texte en dur** ; traductions dans les 5 locales `src/config/translate/{en,fr,es,de,pt}.json`, namespace `settings`.
- Tests : **logique pure uniquement** (Vitest `*.test.ts`). Les composants se vérifient par `npm run lint` + `npx tsc --noEmit` + `npm run build`.
- `"use client"` sur tout composant interactif. Path alias `@/*` → `./src/*`.
- Ne pas commiter/pusher sans accord explicite de Ludovic (les steps « Commit » sont préparés mais à confirmer avec lui).
- Hook `useProjectConfig` : `saveConfig(config)`, `clearConfig()` (efface TOUTES les configs via `DELETE ?all=true`), `removeConfig(org, number)`. Champ `connected: boolean` sur `ProjectV2Config` (défaut `false`).
- MUI accordion style repo-existant : `bgcolor: 'transparent'`, `boxShadow: 'none'`, `'&:before': { display: 'none' }`, `border: 1`, `borderColor: 'divider'`, `borderRadius: '8px !important'`.

---

### Task 1: Utils purs de la liste projets (aplatissement / filtre / tri)

**Files:**
- Create: `src/components/settings/projectListUtils.ts`
- Test: `src/components/settings/projectListUtils.test.ts`

**Interfaces:**
- Consumes: `ProjectV2Config` depuis `@/types`.
- Produces:
  - `interface OrgProject { id: string; title: string; number: number }`
  - `interface OrgWithProjects { org: string; projects: OrgProject[]; ownerType: 'organization' | 'user' }`
  - `interface FlatProject { key: string; org: string; ownerType: 'organization' | 'user'; project: OrgProject; connected: boolean }`
  - `flattenProjects(orgProjects: OrgWithProjects[], configs: ProjectV2Config[]): FlatProject[]`
  - `filterProjects(items: FlatProject[], query: string): FlatProject[]`
  - `sortProjectsConnectedFirst(items: FlatProject[]): FlatProject[]`
  - `countConnected(items: FlatProject[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/settings/projectListUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
	flattenProjects,
	filterProjects,
	sortProjectsConnectedFirst,
	countConnected,
	type OrgWithProjects,
	type FlatProject,
} from './projectListUtils';
import type { ProjectV2Config } from '@/types';

const orgProjects: OrgWithProjects[] = [
	{
		org: 'acme',
		ownerType: 'organization',
		projects: [
			{ id: 'a', title: 'Roadmap', number: 1 },
			{ id: 'b', title: 'Backlog', number: 2 },
		],
	},
	{
		org: 'me',
		ownerType: 'user',
		projects: [{ id: 'c', title: 'Sprint', number: 5 }],
	},
];

const cfg = (org: string, projectNumber: number, connected: boolean): ProjectV2Config => ({
	org,
	projectNumber,
	projectTitle: '',
	selectedViews: [],
	activeView: null,
	viewOrder: [],
	viewRepoMappings: [],
	statusColumns: [],
	views: [],
	ownerType: 'organization',
	connected,
});

describe('flattenProjects', () => {
	it('flattens org groups and marks connected from configs', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 1, true), cfg('me', 5, false)]);
		expect(flat).toHaveLength(3);
		expect(flat.find((f) => f.key === 'acme/1')?.connected).toBe(true);
		expect(flat.find((f) => f.key === 'me/5')?.connected).toBe(false);
		expect(flat.find((f) => f.key === 'acme/2')?.connected).toBe(false);
	});
});

describe('filterProjects', () => {
	const flat = flattenProjects(orgProjects, []);
	it('returns all when query is empty/whitespace', () => {
		expect(filterProjects(flat, '   ')).toHaveLength(3);
	});
	it('matches on title case-insensitively', () => {
		expect(filterProjects(flat, 'road').map((f) => f.key)).toEqual(['acme/1']);
	});
	it('matches on org', () => {
		expect(filterProjects(flat, 'acme').map((f) => f.key).sort()).toEqual(['acme/1', 'acme/2']);
	});
});

describe('sortProjectsConnectedFirst', () => {
	it('puts connected first, then alphabetical by title', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 2, true)]);
		const sorted = sortProjectsConnectedFirst(flat);
		expect(sorted[0].key).toBe('acme/2'); // connected
		expect(sorted.slice(1).map((f) => f.project.title)).toEqual(['Roadmap', 'Sprint']);
	});
	it('does not mutate the input array', () => {
		const flat = flattenProjects(orgProjects, []);
		const copy = [...flat];
		sortProjectsConnectedFirst(flat);
		expect(flat).toEqual(copy);
	});
});

describe('countConnected', () => {
	it('counts connected items', () => {
		const flat = flattenProjects(orgProjects, [cfg('acme', 1, true), cfg('me', 5, true)]);
		expect(countConnected(flat)).toBe(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/projectListUtils.test.ts`
Expected: FAIL — module `./projectListUtils` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/settings/projectListUtils.ts
import type { ProjectV2Config } from '@/types';

export interface OrgProject {
	id: string;
	title: string;
	number: number;
}

export interface OrgWithProjects {
	org: string;
	projects: OrgProject[];
	ownerType: 'organization' | 'user';
}

export interface FlatProject {
	key: string;
	org: string;
	ownerType: 'organization' | 'user';
	project: OrgProject;
	connected: boolean;
}

export function flattenProjects(
	orgProjects: OrgWithProjects[],
	configs: ProjectV2Config[],
): FlatProject[] {
	const connectedKeys = new Set(
		configs.filter((c) => c.connected).map((c) => `${c.org}/${c.projectNumber}`),
	);
	return orgProjects.flatMap((o) =>
		o.projects.map((p) => {
			const key = `${o.org}/${p.number}`;
			return {
				key,
				org: o.org,
				ownerType: o.ownerType,
				project: p,
				connected: connectedKeys.has(key),
			};
		}),
	);
}

export function filterProjects(items: FlatProject[], query: string): FlatProject[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter(
		(it) =>
			it.project.title.toLowerCase().includes(q) || it.org.toLowerCase().includes(q),
	);
}

export function sortProjectsConnectedFirst(items: FlatProject[]): FlatProject[] {
	return [...items].sort((a, b) => {
		if (a.connected !== b.connected) return a.connected ? -1 : 1;
		return a.project.title.localeCompare(b.project.title);
	});
}

export function countConnected(items: FlatProject[]): number {
	return items.filter((it) => it.connected).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/settings/projectListUtils.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/projectListUtils.ts src/components/settings/projectListUtils.test.ts
git commit -m "feat(settings): add pure utils for project list flatten/filter/sort"
```

---

### Task 2: Clés i18n dans les 5 locales

**Files:**
- Modify: `src/config/translate/fr.json` (namespace `settings`)
- Modify: `src/config/translate/en.json`
- Modify: `src/config/translate/es.json`
- Modify: `src/config/translate/de.json`
- Modify: `src/config/translate/pt.json`

**Interfaces:**
- Produces (nouvelles clés `settings`, consommées par Tasks 3-5) :
  `filterProjects`, `connected`, `notConnected`, `noProjectsMatch`, `connectedCount`, `repoCount`, `loadViewsError`.

- [ ] **Step 1: Ajouter les clés dans `fr.json` → objet `settings`**

Ajouter ces paires (à côté des clés existantes, ne rien supprimer) :

```json
"filterProjects": "Filtrer les projets...",
"connected": "Connecté",
"notConnected": "Non connecté",
"noProjectsMatch": "Aucun projet ne correspond au filtre.",
"connectedCount": "{count} connecté{count, plural, one {} other {s}}",
"repoCount": "{count} dépôt{count, plural, one {} other {s}}",
"loadViewsError": "Échec du chargement des vues"
```

- [ ] **Step 2: Ajouter les mêmes clés dans `en.json`**

```json
"filterProjects": "Filter projects...",
"connected": "Connected",
"notConnected": "Not connected",
"noProjectsMatch": "No project matches the filter.",
"connectedCount": "{count} connected",
"repoCount": "{count, plural, one {# repo} other {# repos}}",
"loadViewsError": "Failed to load views"
```

- [ ] **Step 3: Ajouter dans `es.json`**

```json
"filterProjects": "Filtrar proyectos...",
"connected": "Conectado",
"notConnected": "No conectado",
"noProjectsMatch": "Ningún proyecto coincide con el filtro.",
"connectedCount": "{count, plural, one {# conectado} other {# conectados}}",
"repoCount": "{count, plural, one {# repositorio} other {# repositorios}}",
"loadViewsError": "Error al cargar las vistas"
```

- [ ] **Step 4: Ajouter dans `de.json`**

```json
"filterProjects": "Projekte filtern...",
"connected": "Verbunden",
"notConnected": "Nicht verbunden",
"noProjectsMatch": "Kein Projekt entspricht dem Filter.",
"connectedCount": "{count, plural, one {# verbunden} other {# verbunden}}",
"repoCount": "{count, plural, one {# Repository} other {# Repositorys}}",
"loadViewsError": "Ansichten konnten nicht geladen werden"
```

- [ ] **Step 5: Ajouter dans `pt.json`**

```json
"filterProjects": "Filtrar projetos...",
"connected": "Conectado",
"notConnected": "Não conectado",
"noProjectsMatch": "Nenhum projeto corresponde ao filtro.",
"connectedCount": "{count, plural, one {# conectado} other {# conectados}}",
"repoCount": "{count, plural, one {# repositório} other {# repositórios}}",
"loadViewsError": "Falha ao carregar as vistas"
```

- [ ] **Step 6: Vérifier que tous les JSON parsent**

Run: `node -e "['en','fr','es','de','pt'].forEach(l=>{const s=require('./src/config/translate/'+l+'.json').settings; ['filterProjects','connected','notConnected','noProjectsMatch','connectedCount','repoCount','loadViewsError'].forEach(k=>{if(!s[k])throw new Error(l+' missing '+k)})}); console.log('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add src/config/translate/*.json
git commit -m "i18n(settings): add keys for project list filter/state/counts"
```

---

### Task 3: Composant `ProjectRow` (ligne dense)

**Files:**
- Create: `src/components/settings/ProjectRow.tsx`

**Interfaces:**
- Consumes: `OrgProject` depuis `./projectListUtils` ; `ProjectV2Config`, `ProjectV2View`, `ViewRepoMapping` depuis `@/types` ; `useProjectConfig.saveConfig` via prop `onSave`.
- Produces:
  - `interface ProjectRowProps { project: OrgProject; org: string; ownerType: 'organization' | 'user'; savedConfig: ProjectV2Config | undefined; configsLoaded: boolean; onSave: (config: ProjectV2Config) => void }`
  - `export function ProjectRow(props: ProjectRowProps): JSX.Element`

Comportement (repris de l'ancien `ProjectSection`, sans accordion) :
- `connected = savedConfig?.connected ?? false`.
- Auto-fetch au montage **seulement si connecté** et pas encore fetché.
- Fetch à la demande quand on active le toggle (si pas encore fetché) ou via le bouton refresh.
- Erreur de fetch → icône d'erreur discrète + tooltip (`loadViewsError`), pas d'`Alert`.

- [ ] **Step 1: Écrire le composant complet**

```tsx
// src/components/settings/ProjectRow.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { ProjectV2Config, ProjectV2View, ViewRepoMapping } from '@/types';
import type { OrgProject } from './projectListUtils';

interface ProjectViewsData {
	project: { id: string; title: string; number: number };
	views: ProjectV2View[];
	viewRepoMappings: ViewRepoMapping[];
	statusColumns: string[];
}

export interface ProjectRowProps {
	project: OrgProject;
	org: string;
	ownerType: 'organization' | 'user';
	savedConfig: ProjectV2Config | undefined;
	configsLoaded: boolean;
	onSave: (config: ProjectV2Config) => void;
}

export function ProjectRow({
	project,
	org,
	ownerType,
	savedConfig,
	configsLoaded,
	onSave,
}: ProjectRowProps) {
	const t = useTranslations('settings');
	const [viewsData, setViewsData] = useState<ProjectViewsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasFetched, setHasFetched] = useState(!!savedConfig?.views?.length);

	const connected = savedConfig?.connected ?? false;

	const baseConfig = (): ProjectV2Config => ({
		org,
		projectNumber: project.number,
		projectTitle: project.title,
		selectedViews: [],
		activeView: null,
		viewOrder: [],
		viewRepoMappings: [],
		statusColumns: [],
		views: [],
		ownerType,
		connected: false,
	});

	const fetchViews = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/github/projects?org=${encodeURIComponent(org)}&projectNumber=${project.number}&ownerType=${ownerType}`,
			);
			if (!res.ok) throw new Error(`Failed to load project views: ${res.status}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);
			const fetched = data as ProjectViewsData;
			setViewsData(fetched);
			setHasFetched(true);
			onSave({
				org,
				projectNumber: project.number,
				projectTitle: project.title,
				selectedViews: savedConfig?.selectedViews ?? [],
				activeView: savedConfig?.activeView ?? null,
				viewOrder: savedConfig?.viewOrder ?? [],
				viewRepoMappings: fetched.viewRepoMappings,
				statusColumns: fetched.statusColumns ?? [],
				views: fetched.views,
				ownerType,
				connected: savedConfig?.connected ?? false,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load views');
		} finally {
			setLoading(false);
		}
	}, [org, project.number, project.title, ownerType, savedConfig, onSave]);

	// Auto-fetch au montage UNIQUEMENT pour les projets connectés (évite N requêtes en parallèle)
	useEffect(() => {
		if (configsLoaded && connected && !hasFetched) {
			fetchViews();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [configsLoaded]);

	const handleToggle = (next: boolean) => {
		onSave({ ...(savedConfig ?? baseConfig()), connected: next });
		// fetch à la demande quand on active un projet pas encore fetché
		if (next && !hasFetched && !loading) {
			fetchViews();
		}
	};

	const viewCount = viewsData?.views?.length ?? savedConfig?.views?.length ?? 0;

	return (
		<Box
			sx={{
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
				px: 1.5,
				py: 1,
				borderRadius: 1.5,
				transition: 'background-color 0.15s ease',
				'&:hover': { bgcolor: (th) => alpha(th.palette.text.primary, 0.03) },
			}}
		>
			<Box sx={{ minWidth: 0, flex: 1 }}>
				<Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
					{project.title}
				</Typography>
				<Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
					{org}
					{viewCount > 0 ? ` · ${t('viewsAvailable', { count: viewCount })}` : ''}
				</Typography>
			</Box>

			{error && (
				<Tooltip title={t('loadViewsError')}>
					<ErrorOutlineRoundedIcon sx={{ fontSize: 18, color: 'error.main' }} />
				</Tooltip>
			)}

			<Chip
				size="small"
				label={connected ? t('connected') : t('notConnected')}
				sx={{
					height: 22,
					fontSize: '0.7rem',
					fontWeight: 500,
					color: connected ? 'success.main' : 'text.secondary',
					bgcolor: (th) =>
						connected
							? alpha(th.palette.success.main, 0.12)
							: alpha(th.palette.text.secondary, 0.08),
					'& .MuiChip-label': { px: 1 },
				}}
			/>

			<Switch
				size="small"
				checked={connected}
				onChange={(e) => handleToggle(e.target.checked)}
			/>

			<Tooltip title={t('refreshFromGithub')}>
				<span>
					<IconButton
						size="small"
						onClick={() => fetchViews()}
						disabled={loading}
						sx={{ color: 'text.secondary' }}
					>
						{loading ? (
							<CircularProgress size={16} />
						) : (
							<RefreshRoundedIcon fontSize="small" />
						)}
					</IconButton>
				</span>
			</Tooltip>
		</Box>
	);
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur liée à `ProjectRow.tsx`.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/settings/ProjectRow.tsx`
Expected: aucun warning/erreur.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ProjectRow.tsx
git commit -m "feat(settings): add dense ProjectRow with inline connect toggle"
```

---

### Task 4: Composant `ProjectList` (filtre + tri + compteur + clearAll)

**Files:**
- Create: `src/components/settings/ProjectList.tsx`

**Interfaces:**
- Consumes: `flattenProjects`, `filterProjects`, `sortProjectsConnectedFirst`, `countConnected`, `OrgWithProjects` depuis `./projectListUtils` ; `ProjectRow` depuis `./ProjectRow` ; `ProjectV2Config` depuis `@/types`.
- Produces:
  - `interface ProjectListProps { orgProjects: OrgWithProjects[]; configs: ProjectV2Config[]; configsLoading: boolean; onSave: (config: ProjectV2Config) => void; onClearAll: () => void }`
  - `export function ProjectList(props: ProjectListProps): JSX.Element`

- [ ] **Step 1: Écrire le composant complet**

```tsx
// src/components/settings/ProjectList.tsx
'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useTranslations } from 'next-intl';
import type { ProjectV2Config } from '@/types';
import {
	flattenProjects,
	filterProjects,
	sortProjectsConnectedFirst,
	countConnected,
	type OrgWithProjects,
} from './projectListUtils';
import { ProjectRow } from './ProjectRow';

export interface ProjectListProps {
	orgProjects: OrgWithProjects[];
	configs: ProjectV2Config[];
	configsLoading: boolean;
	onSave: (config: ProjectV2Config) => void;
	onClearAll: () => void;
}

export function ProjectList({
	orgProjects,
	configs,
	configsLoading,
	onSave,
	onClearAll,
}: ProjectListProps) {
	const t = useTranslations('settings');
	const [query, setQuery] = useState('');

	const sorted = useMemo(() => {
		const flat = flattenProjects(orgProjects, configs);
		return sortProjectsConnectedFirst(filterProjects(flat, query));
	}, [orgProjects, configs, query]);

	const connectedTotal = countConnected(flattenProjects(orgProjects, configs));
	const connectedInList = countConnected(sorted);
	// index de la première ligne non connectée (pour placer le Divider)
	const firstDisconnectedIdx = sorted.findIndex((it) => !it.connected);
	const showDivider = connectedInList > 0 && firstDisconnectedIdx > 0;

	return (
		<Box>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					mb: 1.5,
					flexWrap: 'wrap',
				}}
			>
				<TextField
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t('filterProjects')}
					size="small"
					sx={{ flex: 1, minWidth: 200 }}
					InputProps={{
						startAdornment: (
							<InputAdornment position="start">
								<SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
							</InputAdornment>
						),
					}}
				/>
				{connectedTotal > 0 && (
					<>
						<Typography variant="caption" color="text.secondary">
							{t('connectedCount', { count: connectedTotal })}
						</Typography>
						<Button
							variant="text"
							color="error"
							size="small"
							onClick={onClearAll}
							sx={{ textTransform: 'none' }}
						>
							{t('clearAll')}
						</Button>
					</>
				)}
			</Box>

			{sorted.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 2 }}>
					{t('noProjectsMatch')}
				</Typography>
			) : (
				<Box sx={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((it, idx) => (
						<Box key={it.key}>
							{showDivider && idx === firstDisconnectedIdx && (
								<Divider sx={{ my: 0.5 }} />
							)}
							<ProjectRow
								project={it.project}
								org={it.org}
								ownerType={it.ownerType}
								savedConfig={configs.find(
									(c) => c.org === it.org && c.projectNumber === it.project.number,
								)}
								configsLoaded={!configsLoading}
								onSave={onSave}
							/>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur liée à `ProjectList.tsx`.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/settings/ProjectList.tsx`
Expected: aucun warning/erreur.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ProjectList.tsx
git commit -m "feat(settings): add ProjectList with filter, connected-first sort, clearAll"
```

---

### Task 5: Refonte `SettingsPanel` en accordions par catégorie

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `ProjectList` depuis `./ProjectList` ; `OrgWithProjects` depuis `./projectListUtils`. Supprime l'ancien composant local `ProjectSection` et ses interfaces locales `OrgProject`/`OrgWithProjects`/`ProjectViewsData`.
- Produces: page Settings avec 2 accordions catégorie.

Détails :
- Remplacer les `interface OrgProject/OrgWithProjects` locales par l'import depuis `./projectListUtils`.
- Supprimer le composant `ProjectSection` (déplacé/refondu dans `ProjectRow`+`ProjectList`).
- Conserver `RepoPathCard`, `AddRepoCard`, dialog manuel, snackbar, tous les hooks et handlers.
- Récupérer `clearConfig` depuis `useProjectConfig` (déjà présent : `clearConfig`).
- La section repos devient un `Accordion defaultExpanded` ; GitHub Projects un `Accordion` (replié par défaut).
- L'erreur de découverte projets (`error`) s'affiche **dans** le détail de l'accordion GitHub Projects.

- [ ] **Step 1: Mettre à jour les imports (haut du fichier)**

Retirer les imports MUI devenus inutiles pour `ProjectSection` (`Switch` reste utilisé ? non : déplacé dans ProjectRow → retirer `Switch`, `RefreshRoundedIcon` si plus utilisé ailleurs). Ajouter accordéon + nouveaux composants. Remplacer le bloc d'imports concerné par :

```tsx
import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { alpha, useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import type { ProjectV2Config } from '@/types';
import type { OrgWithProjects } from './projectListUtils';
import { ProjectList } from './ProjectList';
import { useProjectConfig } from '@/hooks/useProjectConfig';
import { useTranslations } from 'next-intl';
import { localFetch } from '@/lib/local-fetch';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useAgentStatus } from '@/hooks/useAgentStatus';
```

- [ ] **Step 2: Supprimer les interfaces locales et le composant `ProjectSection`**

Supprimer entièrement : les interfaces `OrgProject`, `OrgWithProjects`, `ProjectViewsData` locales, et toute la fonction `ProjectSection({...}) { ... }` (l'ancien bloc `/** Flat project section with lazy-loaded views */` jusqu'à sa fermeture). `RepoPathCard` et `AddRepoCard` restent inchangés.

- [ ] **Step 3: Mettre à jour le state du composant `SettingsPanel`**

Dans `SettingsPanel`, garder `orgProjects` typé `OrgWithProjects[]` (via l'import). Récupérer `clearConfig` du hook :

```tsx
const { configs, configsLoading, saveConfig, clearConfig } = useProjectConfig();
```

`totalConfigured` n'est plus nécessaire (le compteur vit dans `ProjectList`) — le supprimer ainsi que la variable `allProjects` (on passe `orgProjects` directement).

- [ ] **Step 4: Remplacer le JSX de rendu (return)**

Remplacer le `return (...)` par la structure en accordions :

```tsx
	return (
		<Box>
			<Typography
				variant="h4"
				sx={{
					fontWeight: 700,
					mb: 4,
					background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 30%, ${theme.palette.secondary.main} 100%)`,
					backgroundClip: 'text',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				{t('title')}
			</Typography>

			<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{/* Accordion: Repo Local Paths */}
				<Accordion
					defaultExpanded
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<FolderRoundedIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('repoPaths')}
							</Typography>
							<Chip
								label={t('repoCount', { count: repoPaths.length })}
								size="small"
								variant="outlined"
								sx={{ fontSize: '0.7rem' }}
							/>
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							{t('repoPathsDesc')}
						</Typography>
						<Box
							sx={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
								gap: 1.5,
							}}
						>
							{repoPaths.map((rp) => (
								<RepoPathCard
									key={rp.repo_full_name}
									repoName={rp.repo_full_name}
									localPath={localPaths[rp.repo_full_name] ?? rp.local_path}
									onEdit={() => pickDirectory(rp.repo_full_name)}
									onDelete={() => deletePath(rp.repo_full_name)}
									isEditing={pickingRepo === rp.repo_full_name}
								/>
							))}
							<AddRepoCard
								onClick={handleAddRepo}
								disabled={pickingRepo !== null}
								label={pickingRepo === '__new__' ? t('selecting') : t('addRepo')}
							/>
						</Box>
					</AccordionDetails>
				</Accordion>

				{/* Accordion: GitHub Projects (collapsed by default) */}
				<Accordion
					disableGutters
					sx={{
						bgcolor: 'transparent',
						boxShadow: 'none',
						'&:before': { display: 'none' },
						border: 1,
						borderColor: 'divider',
						borderRadius: '8px !important',
						overflow: 'hidden',
					}}
				>
					<AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ px: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
							<GitHubIcon sx={{ color: 'text.secondary', fontSize: 22 }} />
							<Typography variant="h6" sx={{ fontWeight: 600 }}>
								{t('githubProjects')}
							</Typography>
							{configs.filter((c) => c.connected).length > 0 && (
								<Chip
									label={t('connectedCount', {
										count: configs.filter((c) => c.connected).length,
									})}
									size="small"
									color="primary"
									variant="outlined"
									sx={{ fontSize: '0.7rem' }}
								/>
							)}
						</Box>
					</AccordionSummary>
					<AccordionDetails sx={{ px: 2, pb: 2 }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							{t('selectViewsDesc')}
						</Typography>

						{error && (
							<Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
								{error}
							</Alert>
						)}

						{loadingProjects && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
								<Skeleton variant="rounded" height={44} sx={{ borderRadius: 1.5 }} />
								<Skeleton variant="rounded" height={44} sx={{ borderRadius: 1.5 }} />
								<Skeleton variant="rounded" height={44} sx={{ borderRadius: 1.5 }} />
							</Box>
						)}

						{!loadingProjects && orgProjects.length === 0 && !error && (
							<Alert severity="info" sx={{ borderRadius: 1 }}>
								{t('noProjectsFound')}
							</Alert>
						)}

						{!loadingProjects && orgProjects.length > 0 && (
							<ProjectList
								orgProjects={orgProjects}
								configs={configs}
								configsLoading={configsLoading}
								onSave={saveConfig}
								onClearAll={clearConfig}
							/>
						)}
					</AccordionDetails>
				</Accordion>
			</Box>

			<Dialog
				open={manualDialogOpen}
				onClose={() => setManualDialogOpen(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>{t('addRepo')}</DialogTitle>
				<DialogContent
					sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
				>
					<TextField
						label={t('repoName')}
						placeholder="owner/repo"
						value={manualRepo}
						onChange={(e) => setManualRepo(e.target.value)}
						size="small"
						fullWidth
						autoFocus
					/>
					<TextField
						label={t('localPath')}
						placeholder="/Users/you/projects/repo"
						value={manualPath}
						onChange={(e) => setManualPath(e.target.value)}
						size="small"
						fullWidth
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setManualDialogOpen(false)}>{tc('cancel')}</Button>
					<Button
						variant="contained"
						disabled={!manualRepo.trim() || !manualPath.trim()}
						onClick={handleManualSave}
					>
						{tc('save')}
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={toast}
				autoHideDuration={2000}
				onClose={() => setToast(false)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert onClose={() => setToast(false)} severity="success" variant="filled">
					{toastMessage}
				</Alert>
			</Snackbar>
		</Box>
	);
```

- [ ] **Step 5: Retirer `findSavedConfig` s'il n'est plus utilisé**

`findSavedConfig` était utilisé par l'ancien mapping `ProjectSection`. `ProjectList` fait sa propre résolution via `configs.find(...)`. Supprimer la fonction `findSavedConfig` et l'import `ProjectV2View`/`ViewRepoMapping` s'ils ne servent plus dans `SettingsPanel`. Garder `ProjectV2Config` (utilisé par les types de state).

- [ ] **Step 6: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur. (Corriger tout import inutilisé signalé.)

- [ ] **Step 7: Lint**

Run: `npx eslint src/components/settings/SettingsPanel.tsx`
Expected: aucun warning/erreur (dont `no-unused-vars`).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 9: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx
git commit -m "feat(settings): rework page into category accordions with dense project list"
```

---

### Task 6: Vérification manuelle end-to-end

**Files:** aucun (validation runtime).

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev`
Puis ouvrir `http://localhost:4000/settings`.

- [ ] **Step 2: Vérifier le comportement**

Checklist :
- [ ] 2 accordions : « Chemins locaux des dépôts » (ouvert), « Projets GitHub » (replié).
- [ ] Chips résumé : « N dépôts » et « N connectés » (si ≥1).
- [ ] Ouvrir GitHub Projects : liste dense, connectés en haut, séparateur seulement si les deux groupes existent.
- [ ] Champ de filtre : filtre par titre et par org ; message « aucun projet ne correspond » si vide.
- [ ] Toggle sur une ligne : bascule l'état, badge « Connecté »/« Non connecté » suit ; activer un projet non fetché déclenche le fetch (spinner refresh).
- [ ] Bouton refresh par ligne fonctionne (spinner puis « N vues »).
- [ ] « Tout effacer » visible seulement si ≥1 connecté ; efface bien les configs.
- [ ] Section repos : ajout/edit/delete repo et snackbar OK.
- [ ] Vérifier en changeant la locale (fr/en) que rien n'est en dur.

- [ ] **Step 3: Vérifier l'absence de rafale réseau au chargement**

Dans l'onglet Réseau du navigateur, replier/déplier GitHub Projects : au montage des lignes, seuls les projets **connectés** déclenchent un appel `/api/github/projects?...&projectNumber=`. Les non connectés n'en déclenchent pas tant qu'on ne les active/rafraîchit pas.

---

## Self-Review

**Spec coverage:**
- Accordions par catégorie (Repos ouvert / Projects replié) → Task 5. ✅
- Chips résumé (`repoCount`, `connectedCount`) → Tasks 2 + 5. ✅
- Liste dense connectés-d'abord + filtre → Tasks 1 + 4. ✅
- Badge état + toggle inline + refresh par ligne → Task 3. ✅
- Séparateur conditionnel (les deux groupes non vides) → Task 4 (`showDivider`). ✅
- Auto-fetch optimisé (connectés au montage, reste à la demande) → Task 3 (Step 1 useEffect + handleToggle) + Task 6 (Step 3). ✅
- « Tout effacer » dans header, visible si ≥1 connecté, via `clearConfig` → Task 4. ✅
- Erreur découverte dans l'accordion detail ; erreur par ligne discrète → Tasks 3 + 5. ✅
- Section repos inchangée (déplacée) → Task 5. ✅
- i18n 5 locales → Task 2. ✅

**Placeholder scan:** aucun TODO/TBD ; tout le code est fourni intégralement.

**Type consistency:** `FlatProject`, `OrgWithProjects`, `OrgProject` définis en Task 1 et importés en Tasks 3-5. `ProjectRowProps` (Task 3) consommé par `ProjectList` (Task 4). `ProjectListProps` (Task 4) consommé par `SettingsPanel` (Task 5). `clearConfig`/`saveConfig` conformes au hook réel. Clés i18n (Task 2) toutes utilisées dans Tasks 3-5.
