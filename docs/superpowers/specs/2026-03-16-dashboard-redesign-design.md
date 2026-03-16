# Dashboard Redesign — Design Spec

## Objectif

Refonte complète du dashboard avec un layout en grille analytique, remplaçant le dashboard actuel basé sur sessions/summaries timeline par un hub de métriques et widgets actionables.

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Dashboard                        [Today] [7d] [30d]│
├────────────┬────────────┬────────────┬──────────────┤
│  Agents    │  Issues    │  PRs       │  Todos       │
│  actifs: 3 │  ouvertes: 8│ attente: 2│  pending: 5  │
├────────────┴────────────┴────────────┴──────────────┤
│                                                     │
│  ┌─── Agents actifs ────┐  ┌───── Todos ──────────┐ │
│  │ live cards streaming  │  │ checkboxes + repo    │ │
│  │ branch, dot, stop     │  │ interactive          │ │
│  └───────────────────────┘  └──────────────────────┘ │
│                                                     │
│  ┌─── Sessions récentes ┐  ┌─── Summaries ────────┐ │
│  │ historique status     │  │ rapports preview     │ │
│  │ durée, temps relatif  │  │ markdown, expandable │ │
│  └───────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Composants

### 1. Header + Filtre temporel

- Titre "Dashboard" à gauche
- Toggle group MUI `ToggleButtonGroup` : Today / 7d / 30d à droite
- Le filtre affecte toutes les données des widgets (KPIs, sessions, summaries)
- State local `useState<'today' | '7d' | '30d'>('today')`

### 2. KPI Cards (4 cards en ligne)

Grid `grid-template-columns: repeat(4, 1fr)` avec gap 12px.

| Card | Source | Valeur | Variation |
|------|--------|--------|-----------|
| Agents actifs | `useActiveSessions` | count sessions actives | delta vs période précédente |
| Issues ouvertes | `useGitHub` → `dashboardData.issues` filtered `state=open` assigned | count | issues fermées dans la période |
| PRs en attente | `usePullRequests` | count PRs open | — |
| Todos pending | `usePendingTodoCount` | count non-faits | nouveaux dans la période |

Chaque card :
- Icône dans un cercle coloré (fond 20% opacity)
- Valeur en gros (28px, font-weight 700)
- Label uppercase (11px, #888)
- Badge de variation optionnel (↑/↓ + texte, fond coloré)

### 3. Widget: Agents actifs (top-left)

- Header : titre + badge count "X running" + lien "Voir tout →"
- Liste de cards agent :
  - Dot animé (vert streaming, orange question)
  - Nom agent + projet + durée
  - Chip branche
  - Bouton Stop
- Source : `useActiveSessions` (polling 5s)
- Click sur un agent → ouvre `AgentTerminalModal`
- Empty state si aucun agent actif

### 4. Widget: Todos (top-right)

- Header : titre + badge count "X pending" + lien "Voir tout →"
- Liste checkboxes interactive (top 5-8 todos)
  - Checkbox MUI ou custom
  - Texte du todo
  - Badge repo (petit chip gris)
- Source : `useTodos` avec mutation optimiste pour toggle done
- "Voir tout" navigue vers `/todos`

### 5. Widget: Sessions récentes (bottom-left)

- Header : titre + lien "Historique →"
- Liste 5-8 sessions :
  - Status icon (✓ vert completed, ✗ rouge error)
  - Nom de branche
  - Détail : agent · projet · durée
  - Temps relatif (il y a Xh, hier, etc.)
- Source : `useAgentSessionHistory` (Supabase `agent_sessions`)
- Filtré par le time filter
- Click → ouvre le modal session

### 6. Widget: Summaries (bottom-right)

- Header : titre + lien "Tous →"
- Cards expandables :
  - Status dot + branche
  - Titre du summary
  - Preview markdown (2 lignes, clamped)
  - Temps relatif
- Source : `useAgentSummaries` (Supabase `agent_sessions` + `agent_activity_logs`)
- Filtré par le time filter
- Click → expand ou ouvre le modal

## Architecture fichiers

```
src/components/dashboard/
├── Dashboard.tsx              # Refonte complète (composant orchestrateur)
├── DashboardHeader.tsx        # Titre + filtre temporel
├── KpiCards.tsx               # 4 KPI cards en grid
├── ActiveAgentsWidget.tsx     # Widget agents actifs live
├── TodosWidget.tsx            # Widget todos interactifs
├── RecentSessionsWidget.tsx   # Widget sessions récentes
├── SummariesWidget.tsx        # Widget rapports/summaries
└── DashboardWidget.tsx        # Container réutilisable (header + content)
```

### Nouveau composant: `DashboardWidget`

Container générique pour tous les widgets :

```tsx
interface DashboardWidgetProps {
  title: string
  badge?: string
  linkText?: string
  linkHref?: string
  onLinkClick?: () => void
  children: React.ReactNode
}
```

## Data Flow

```
Dashboard.tsx
├── useState: timeFilter ('today' | '7d' | '30d')
├── useActiveSessions()           → KpiCards (agents count) + ActiveAgentsWidget
├── useGitHub()                   → KpiCards (issues count)
├── usePullRequests()             → KpiCards (PRs count)
├── usePendingTodoCount()         → KpiCards (todos count)
├── useTodos()                    → TodosWidget
├── useAgentSessionHistory()      → RecentSessionsWidget (filtré par timeFilter)
└── useAgentSummaries()           → SummariesWidget (filtré par timeFilter)
```

Le `timeFilter` est passé en prop aux widgets qui en ont besoin. Le filtrage se fait côté client (pas de nouveau endpoint).

## Filtrage temporel

Le filtre calcule une date de début :
- `today` : début du jour courant (00:00)
- `7d` : il y a 7 jours
- `30d` : il y a 30 jours

Widgets affectés :
- **KPI Cards** : comptages filtrés par la période (sauf agents actifs qui est toujours "maintenant")
- **Sessions récentes** : `started_at >= dateDebut`
- **Summaries** : `started_at >= dateDebut`
- **Todos** : pas filtré (toujours tous les pending)
- **Agents actifs** : pas filtré (toujours live)

## Calcul des variations KPI

Les variations comparent la période courante vs la période précédente :
- Today : aujourd'hui vs hier
- 7d : 7 derniers jours vs 7 jours précédents
- 30d : 30 derniers jours vs 30 jours précédents

Données calculées côté client depuis les sessions en DB.

## Styling

- Utilise le theme MUI existant (dark/light mode supporté)
- Cards : `background: theme.palette.background.paper`, border `divider`, borderRadius 10px
- Hover : `transform: translateY(-1px)`, border légèrement plus clair
- KPI values : couleurs primaire (#7C5CFF), secondary (#00D4FF), success (#22C55E), warning (#F59E0B)
- Animations : pulse CSS pour les dots streaming/question (existant)
- Font sizes cohérents avec le theme (12px base)
- Responsive : les 4 KPIs passent en 2×2 sur écrans < 900px

## i18n

Nouvelles clés à ajouter dans les 5 fichiers de traduction :

```json
{
  "dashboard": {
    "title": "Dashboard",
    "filterToday": "Today",
    "filter7d": "7d",
    "filter30d": "30d",
    "activeAgents": "Active agents",
    "openIssues": "Open issues",
    "pendingPrs": "Pending PRs",
    "pendingTodos": "Todos",
    "running": "{count, plural, one {# running} other {# running}}",
    "pending": "{count, plural, one {# pending} other {# pending}}",
    "recentSessions": "Recent sessions",
    "summaries": "Latest reports",
    "todos": "Todos",
    "viewAll": "View all →",
    "history": "History →",
    "all": "All →",
    "stop": "Stop",
    "noActiveAgents": "No active agents",
    "noSessions": "No recent sessions",
    "noSummaries": "No reports yet",
    "noTodos": "All done!",
    "sinceYesterday": "since yesterday",
    "closed": "closed",
    "new": "new"
  }
}
```

## Ce qui est supprimé

- `SummaryTimeline` intégré dans Dashboard.tsx (remplacé par `SummariesWidget`)
- `DraggableTabs` par projet (le filtre temporel le remplace)
- Greeting + horloge dynamique
- Quick stats bar
- Vue par projet/tabs

## Ce qui est conservé

- `SessionCard` (composant shared, utilisé ailleurs)
- `AgentTerminalModal` (ouvert au click sur un agent/session)
- Tous les hooks existants (pas de modification)
- Toutes les API routes existantes
