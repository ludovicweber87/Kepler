# Workbench : onglets par fichier & séparation Changes/Activity

**Date** : 2026-07-14
**Statut** : Design validé

## Problème

Dans le Workbench, l'onglet **Activity** (colonne droite) affiche à la fois la timeline
d'activité de l'agent ET la liste des fichiers modifiés. Cliquer un fichier bascule la
colonne gauche sur `AgentDiffTab`, qui affiche le diff de **tous** les fichiers empilés.

On veut :

1. **Activity** ne montre QUE la timeline d'activité.
2. **Changes** liste les fichiers modifiés ; cliquer un fichier ouvre **uniquement ce
   fichier** dans un onglet dédié.
3. La colonne gauche devient un vrai système d'onglets **MUI** : `Chat | Fichier1 | Fichier2 | …`
   — un onglet par fichier ouvert, fermables.

## Design

### Colonne DROITE — Tabs MUI : `Changes | Activity | Issue`

Les `<Chip>` actuelles (pilotées par `topPanel`) sont remplacées par des `<Tabs>/<Tab>` MUI.

- **Changes** : liste compacte des fichiers modifiés (nom + `+additions` / `−deletions`),
  extraite de l'actuel `AgentActivityTab`. Cliquer un fichier → ouvre/active son onglet à gauche.
- **Activity** : uniquement la timeline (`summary` / `error`) + header + bouton Publish.
  La section « liste des fichiers » est retirée.
- **Issue** : 3ᵉ tab, rendu seulement si `hasIssue` (comportement conservé).

Le `ShellTerminal` reste empilé sous le panneau droit, hors du système d'onglets
(inchangé, resize via `termHeight`).

### Colonne GAUCHE — Tabs MUI : `Chat | <fichier> ✕ | …`

- **Chat** : toujours en premier, non fermable. `AgentChatTab` reste **monté en
  permanence** (masqué via `display` quand un fichier est actif) pour préserver la WebSocket.
- **Un onglet par fichier ouvert** :
  - Label = **nom du fichier seul** (basename) + bouton **✕**.
  - Tooltip = chemin complet au survol.
  - Contenu = diff de **ce seul fichier** (réutilise `FileDiffView` / `AgentDiffTab`
    filtré sur un `filePath`).
- Cliquer un fichier **déjà ouvert** → bascule sur son onglet (pas de doublon), avec
  re-focus/scroll (`focusNonce`).
- Fermer un onglet (✕) → retire le fichier ; si c'était l'actif, bascule sur l'onglet
  voisin (ou `Chat` s'il n'en reste pas).

### State (`Workbench.tsx`)

Remplacer :

- `centerTab: 'chat' | 'changes'` + `changesTarget` → par :
  - `openFiles: string[]` — chemins des fichiers ouverts (ordre = ordre des onglets).
  - `activeTab: 'chat' | string` — `'chat'` ou le chemin du fichier actif.
- `topPanel: 'activity' | 'issue'` → `rightTab: 'changes' | 'activity' | 'issue'`.
- `focusNonce` conservé (re-scroll sur re-clic d'un fichier déjà ouvert).

Callbacks :

- `openChanges(path)` : si `path` absent de `openFiles`, l'ajoute ; set `activeTab = path` ;
  incrémente `focusNonce`.
- `closeFile(path)` : retire `path` de `openFiles` ; si `activeTab === path`, bascule sur
  le voisin (index précédent) ou `'chat'`.
- Si un fichier ouvert disparaît du diff (plus modifié), on peut le laisser ouvert
  (le diff mono-fichier gère l'état vide) — pas de fermeture auto en v1 (YAGNI).

### Composants

| Composant | Changement |
| --------- | ---------- |
| `Workbench.tsx` | Nouveau state + `<Tabs>` MUI gauche & droite ; rendu conditionnel par onglet. |
| `AgentActivityTab.tsx` | Retirer la section liste des fichiers (`changedFiles` / `onOpenFile`). Garde header + timeline + Publish. |
| `ChangedFilesList.tsx` (nouveau) | Liste cliquable des fichiers modifiés (extraite de l'ancienne section d'Activity). Props : `changedFiles`, `onOpenFile`. Alimente le tab **Changes**. |
| `AgentDiffTab.tsx` | Supporter un rendu **mono-fichier** via prop `filePath` (filtre `files` sur ce chemin). Réutilise `FileDiffView`. |

Le hook `useGitDiff(diffPath, branch)` reste la source de vérité des `changedFiles`,
partagé entre le tab Changes (droite) et les onglets fichier (gauche).

### i18n

Nouvelles clés dans le namespace `workbench` (`src/config/translate/*.json`, 5 locales) :
`tabChanges` (déjà présent), `chipActivity`→`tabActivity` si besoin, tooltip `closeFile`,
label onglet fichier. Réutiliser les clés existantes quand possible.

## Non-objectifs (YAGNI)

- Pas de drag & drop pour réordonner les onglets fichier (les tabs MUI simples suffisent).
- Pas de persistance des onglets ouverts entre sessions.
- Pas de fermeture automatique d'un onglet quand le fichier n'est plus modifié.
- Pas d'édition de fichier — lecture/diff seulement.

## Vérification

- `npm run lint` + `tsc --noEmit` + `build` OK.
- Run manuel : ouvrir une session avec des changements → tab Changes liste les fichiers →
  clic ouvre un onglet gauche mono-fichier → ✕ ferme → Activity ne montre que la timeline.
