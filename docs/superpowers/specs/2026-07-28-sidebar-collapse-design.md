# Sidebar réductible + raccourcis clavier

Date : 2026-07-28

## Objectif

Permettre de réduire la sidebar gauche à une colonne d'icônes pour récupérer de la largeur
sur le contenu, et piloter les deux panneaux de chrome au clavier :

- `Cmd+B` réduit / déplie la sidebar (toutes les pages)
- `Cmd+J` replie / restaure le panneau terminal du Workbench (`/workbench` uniquement)

## Décisions

| Sujet | Décision |
| ----- | -------- |
| Section PROJETS en mode réduit | Non rendue |
| Déclencheur sidebar | Bouton chevron en haut de la sidebar + `Cmd+B` |
| Persistance sidebar | `localStorage` |
| Sémantique `Cmd+J` | Collapse / restore du panneau terminal du Workbench |
| Persistance hauteur terminal | `app_settings` (SQLite) |
| Persistance état replié du terminal | Aucune — ouvert à chaque chargement |
| Hors scope | Hover-expand de la sidebar, variante icône du logo |

## 1. État de la sidebar

Nouveau hook `src/hooks/useSidebarCollapsed.ts`, calqué sur `useColorMode` :
`useSyncExternalStore` au-dessus de `localStorage` (clé `devora-sidebar-collapsed`),
`getServerSnapshot` → `false` (dépliée). Un `CustomEvent`
`devora-sidebar-collapsed-change` notifie les abonnés du même onglet, l'événement
`storage` couvre les autres onglets.

API : `{ collapsed: boolean, toggle: () => void, setCollapsed: (v: boolean) => void }`.

Pas de Context Provider : il n'y a pas d'état React à propager, chaque consommateur
(`Sidebar`, `Header`) s'abonne au même store externe.

**Pourquoi pas `useAppSetting`** (le pattern SQLite du repo) : il passe par React Query et
HTTP. La sidebar rendrait 260px puis snaperait à 64px à la résolution de la query.
`localStorage` est synchrone, et c'est déjà le précédent du repo pour une préférence d'UI
pure (thème). Le mismatch d'hydratation résiduel est masqué par l'`AppLoadingSplash` que
`AppShell` affiche pendant `repoPathsLoading`.

Un helper pur `resolveStoredCollapsed(stored: string | null): boolean` porte la lecture,
pour être testable hors DOM.

## 2. Dimensions et transition

`Sidebar.tsx` exporte `SIDEBAR_WIDTH = 260` (inchangé) et
`SIDEBAR_WIDTH_COLLAPSED = 64`.

- `Drawer` paper : `width` = largeur courante, `transition: width 0.2s`,
  `overflowX: 'hidden'` (sinon les labels en cours de disparition débordent).
- `Header` : consomme `useSidebarCollapsed()` pour son `width: calc(100% - Xpx)` et son
  `ml`, avec la même transition. Sans ça il se désynchronise visiblement pendant
  l'animation.

## 3. Rendu en mode réduit (64px)

| Zone | Déplié | Réduit |
| ---- | ------ | ------ |
| Logo | `<Logo width={100} />` | masqué — le lockup contient le wordmark, illisible à 40px |
| Chevron | `ChevronLeftRounded` à droite du logo | `ChevronRightRounded` seul, centré |
| CTA Lancer un agent | `Button fullWidth` + label | `IconButton` rond fusée + `Tooltip` |
| Nav haut (5 items) | icône + label | icône centrée + `Tooltip placement="right"` |
| Badge docs | spinner + compteur à droite du label | `Badge badgeContent={generatingDocs}` sur l'icône `MenuBook` |
| Section PROJETS | arbre complet | non rendue (ni le titre, ni les accordéons) |
| `LocaleSwitcher` | icône + label | icône + `Tooltip` ; le `Menu` est inchangé |
| Nav basse (3 items) | icône + label | icône centrée + `Tooltip` |
| Avatar user | avatar + login | avatar centré, `Tooltip` = login |

En mode réduit, les items de nav passent en `justifyContent: 'center'`,
`ListItemIcon` en `minWidth: 0`, et `ListItemText` n'est pas rendu (plutôt que masqué en
CSS, pour ne pas laisser de nœud qui participe au layout). L'animation
`translateX(4px)` au hover est désactivée en réduit : elle n'a pas de sens sans label.

L'`useEffect` d'auto-focus de session (`hasAutoFocused`) ne dépend pas du rendu de la
section PROJETS : la masquer ne change pas la résolution de `?session=`.

Les menus contextuels et dialogs de la sidebar (rename, delete worktree, actions) restent
en place ; ils deviennent simplement inatteignables en mode réduit puisque leurs
déclencheurs vivent dans PROJETS.

## 4. Extraction de `SidebarNavItem`

`Sidebar.tsx` est à 1028 lignes et le bloc de rendu d'un item de nav y est **déjà
dupliqué à l'identique** entre `mainItems` et `bottomItems` (~45 lignes chacun). Ajouter
la variante réduite inline le dupliquerait une troisième et quatrième fois.

Nouveau `src/components/layout/SidebarNavItem.tsx` :

```
{ label: string; href: string; icon: ReactNode; adornment?: ReactNode;
  collapsed: boolean; active: boolean; delay: number }
```

Il porte le `Link`, le `ListItemButton`, le `Tooltip` conditionnel, et le choix
label / pas-de-label. `Sidebar` mappe `mainItems` et `bottomItems` dessus. La duplication
existante disparaît et la logique du mode réduit ne vit qu'à un endroit.

`LocaleSwitcher` reçoit un prop `collapsed?: boolean` et applique le même traitement sur
son propre `ListItemButton` (il ne peut pas passer par `SidebarNavItem` : ce n'est pas un
lien, il ouvre un `Menu`).

## 5. Raccourcis clavier

Nouveau `src/hooks/useHotkey.ts` :

```ts
useHotkey(key: string, handler: () => void, enabled = true)
```

- `keydown` sur `window` en **phase de capture**. Nécessaire : xterm.js et le composer de
  chat montent leurs propres handlers sur leurs éléments ; en capture on passe avant.
- Match sur `e.metaKey` seul, **`ctrlKey` explicitement rejeté** : `Ctrl+B` est le préfixe
  tmux et `Ctrl+J` un LF, or les `ShellTerminal` attachent des sessions tmux. Écouter en
  capture sur Ctrl volerait ces touches au PTY. L'app est de toute façon liée à macOS
  (le picker de dossier passe par `osascript`).
- Rejette aussi `altKey` et `shiftKey`, match sur `e.key.toLowerCase() === key`.
- Ignore `e.repeat`, appelle `e.preventDefault()` (neutralise « bold » en champ texte et
  le raccourci Téléchargements de Firefox).
- Le handler est gardé dans une ref pour ne pas ré-attacher le listener à chaque render.

Enregistrements :

- `Cmd+B` dans `Sidebar` → `toggle()` de `useSidebarCollapsed`.
- `Cmd+J` dans `WorkbenchShell` → bascule `termCollapsed`.

## 6. Collapse du panneau terminal (`Cmd+J`)

`WorkbenchShell` possède déjà `termHeight`. Il gagne un état local `termCollapsed`.

Replié : le wrapper du terminal passe à `height: 0, overflow: 'hidden'`. La poignée de
resize reste visible et cliquable — la tirer déplie (remet `termCollapsed` à `false`).
Le `TerminalTabs` reste **monté** : le démonter tuerait le scrollback xterm et le
WebSocket PTY.

**Refit au retour.** À hauteur 0, le `ResizeObserver` de `ShellTerminal` déclenche un
`fit()` sur un nœud de 0px. Pour garantir un refit propre à la restauration, on réutilise
le prop `active` que `ShellTerminal` expose déjà (il déclenche `fitAddon.fit()` + focus
dans un `requestAnimationFrame`) :

- `WorkbenchShellProps.terminal` passe de `ReactNode` à `(visible: boolean) => ReactNode`.
  `WorkbenchShell` appelle `terminal(!termCollapsed)`. Il reste purement présentationnel :
  il ne connaît pas `TerminalTabs`.
- `Workbench` passe `(visible) => <TerminalTabs visible={visible} … />`.
- `TerminalTabs` gagne `visible?: boolean` (défaut `true`) et rend
  `active={visible && id === activeId}`.

`WorkbenchShell` n'a qu'un seul consommateur (`Workbench`), le changement de signature ne
casse rien d'autre.

**Persistance de la hauteur.** `useAppSetting('workbench_terminal_height', '340')`, même
pattern que `workbench_split_pct` juste au-dessus : hydratation dans un `useEffect` gardé
par un ref `hydrated` (attendre `!isLoading`, sinon on figerait le défaut), sauvegarde
best-effort au `mouseup` du resize avec `.catch(() => {})`. La hauteur de restauration
survit donc au reload. `termCollapsed` n'est pas persisté : à chaque chargement le
terminal est ouvert.

## 7. i18n

Nouvelles clés sur les 5 locales (`en`, `fr`, `es`, `de`, `pt`) :

- `sidebar.collapse` — « Réduire la sidebar (⌘B) »
- `sidebar.expand` — « Déplier la sidebar (⌘B) »
- `workbench.toggleTerminal` — « Afficher/masquer le terminal (⌘J) »

Les labels des items de nav en tooltip réutilisent les clés existantes.

## 8. Vérification

Convention du repo : tests unitaires sur la logique pure uniquement.

- `src/hooks/useSidebarCollapsed.test.ts` — `resolveStoredCollapsed` : valeur absente →
  `false`, `'true'` → `true`, `'false'` → `false`, valeur inconnue → `false`.

Le reste par `npm run lint`, `tsc --noEmit`, `npm run build` et run manuel :

1. Toggle par le chevron et par `Cmd+B` ; l'état survit à un reload.
2. `Header` reste aligné pendant toute la transition.
3. Tooltips lisibles sur les 8 items de nav + avatar en mode réduit ; badge docs visible
   pendant une génération.
4. `Cmd+J` sur `/workbench` : le terminal se replie, le scrollback et le PTY sont intacts
   au retour, et le contenu est refit à la bonne taille.
5. La poignée de resize déplie un terminal replié.
6. La hauteur du terminal survit à un reload.
7. `Cmd+J` alors que le focus est **dans** l'xterm : le raccourci gagne, aucun caractère
   n'est envoyé au PTY.
