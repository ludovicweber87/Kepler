# Explorateur de fichiers dans le Workbench

**Date** : 2026-07-27
**Statut** : validé, prêt pour le plan d'implémentation

## Objectif

Ajouter un onglet « Explorateur » au panneau droit du Workbench, à côté d'Activity. Il présente l'arborescence du worktree de la session à la manière de VSCode. Un clic sur un fichier l'ouvre dans un onglet gauche, à côté du chat, exactement comme le fait déjà la liste des fichiers modifiés. La vue de fichier gagne au passage la coloration syntaxique.

## Contexte existant

La moitié de la plomberie est déjà là :

- `Workbench.tsx` gère un panneau droit à 3 onglets (`changes` / `activity` / `issue`) et un jeu d'onglets gauche (`chat`, lecteur d'activité, puis un onglet par fichier ouvert).
- `openChanges(path)` pousse un onglet gauche et le focalise. `closeFile`, `resolveTabAfterClose` et `addOpenFile` (dans `src/lib/workbenchTabs.ts`) gèrent le cycle de vie.
- `FileContentView` affiche le contenu brut d'un fichier via `useFileContent` → `GET /filesystem/read-file` sur le serveur agent (:4001), borné à 1 Mo.
- `matchFileDiff` route un onglet vers `FileDiffView` quand le fichier fait partie du diff, sinon vers `FileContentView`.

Ce qui manque : un endpoint de listing (`filesystem.ts` n'expose que `pick-directory`, `read-file`, `open-in-editor`), le composant arbre, et la coloration syntaxique (aucun highlighter dans le repo aujourd'hui).

## Décisions

| Sujet                                       | Décision                                                             | Raison                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Thème                                       | Suit le thème Devora, dark **et** light, via les tokens MUI          | Pas de palette figée : cohérence avec le reste de l'app                                     |
| Périmètre des fichiers                      | Tout sauf ce qu'ignore git                                           | Comportement VSCode par défaut ; `node_modules`, `.next`, `dist` disparaissent gratuitement |
| Source de l'arbre                           | Un seul appel renvoyant une liste plate, arbre construit côté client | Un round-trip, filtre instantané, logique pure testable                                     |
| Interactions v1                             | Plier/déplier, clic pour ouvrir, champ de filtre                     | Pas de menu contextuel pour l'instant                                                       |
| Coloration syntaxique                       | Shiki, import dynamique côté client                                  | Même moteur TextMate que VSCode, thèmes light et dark d'origine                             |
| Libellé de l'onglet                         | `Explorer` / `Explorateur`                                           | Tient dans un panneau à ~32 % sans déclencher les flèches de défilement des `Tabs`          |
| Numéros de ligne                            | Rendus par shiki, la gouttière manuelle disparaît                    | Une seule source de vérité, pas de désalignement possible                                   |
| Fichier modifié ouvert depuis l'explorateur | Affiche son diff (comportement de `matchFileDiff`)                   | Cohérent avec l'ouverture depuis la liste des changements                                   |

## Architecture

### Serveur agent — `GET /filesystem/tree`

Dans `packages/agent/src/routes/filesystem.ts` :

```
GET /filesystem/tree?cwd=<chemin absolu>
→ 200 { files: string[], truncated: boolean, root: string }
→ 400 { error: 'cwd required' }
→ 404 { error: '...', code: 'not_a_repo' }
```

- Commande : `git -C <cwd> ls-files --cached --others --exclude-standard -z`, via `execFile` sans shell.
- `--cached --others --exclude-standard` retourne les fichiers suivis et les non-suivis non ignorés. `.gitignore` est respecté et `.git/` exclu sans traitement supplémentaire.
- `-z` (séparateur NUL) pour tolérer les noms de fichiers contenant espaces ou caractères spéciaux.
- `cwd` doit être absolu et pointer sur un répertoire existant, même posture de validation que `open-in-editor`.
- Un `cwd` hors dépôt git renvoie `code: 'not_a_repo'`.
- Cap à `MAX_TREE_FILES = 20_000` chemins. Au-delà, la liste est coupée et `truncated: true` — jamais de troncature silencieuse.
- Les chemins renvoyés sont relatifs à `cwd`, triés par git (ordre non garanti, le tri final est côté client).

### Module pur — `src/lib/fileTree.ts`

```ts
export interface TreeNode {
	name: string;
	path: string; // chemin relatif depuis la racine
	isDir: boolean;
	children: TreeNode[]; // vide pour un fichier
}

export function buildFileTree(paths: string[]): TreeNode[];
export function filterTree(
	nodes: TreeNode[],
	query: string,
): {
	nodes: TreeNode[];
	expand: Set<string>; // dossiers à déplier pour révéler les correspondances
};
export function flattenVisible(
	nodes: TreeNode[],
	expanded: Set<string>,
): Array<TreeNode & { depth: number }>;
```

- `buildFileTree` : dossiers avant fichiers, tri alphabétique insensible à la casse à chaque niveau.
- `filterTree` : correspondance insensible à la casse sur le chemin complet (une sous-chaîne, pas de fuzzy). Un fichier qui correspond conserve tous ses dossiers ancêtres ; un dossier qui correspond conserve tout son sous-arbre.
- `flattenVisible` : produit la liste plate rendue par le composant. Les enfants d'un dossier replié ne sont pas émis, ce qui évite d'avoir besoin de virtualisation.
- Aucune dépendance React, donc entièrement testable en Vitest.

### Module pur — `src/lib/languageFromPath.ts`

`languageFromPath(path: string): string` mappe une extension (et quelques noms de fichiers entiers : `Dockerfile`, `Makefile`) vers un identifiant de langage shiki. Extension inconnue → `'text'`. La liste des langages chargés dans shiki est dérivée de cette map, pour ne pas embarquer les grammaires inutiles.

### Hook — `src/hooks/useFileTree.ts`

`useFileTree(cwd: string | null)` :

- `useQuery({ queryKey: ['file-tree', cwd] })` via `localFetch('/filesystem/tree?cwd=...')`.
- `enabled: !!cwd`, `staleTime` 30 s, pas de `refetchInterval` — même posture que `useWorktrees`.
- Renvoie `{ files, truncated, isLoading, error, notARepo }`.
- Invalidation explicite : `Workbench.tsx` ajoute `queryClient.invalidateQueries({ queryKey: ['file-tree'] })` dans le `onTurnComplete` du chat, là où `git-diff` et `git-status` sont déjà invalidés — l'agent vient peut-être de créer ou supprimer des fichiers.

### Composant — `src/components/workbench/FileExplorerTab.tsx`

Props : `{ cwd: string | null; activePath: string | null; onOpenFile: (path: string) => void }`.

- **En-tête fixe** : `TextField size="small"` avec icône loupe et bouton d'effacement. La valeur saisie est debouncée à 120 ms avant de traverser `filterTree`.
- **Corps scrollable** : `flattenVisible` rendu en lignes de 22 px, indentation `pl: depth * 1.5`. Dossier = chevron `KeyboardArrowRightRounded` / `KeyboardArrowDownRounded` + `FolderRounded`. Fichier = `InsertDriveFileRounded`, cohérent avec `ChangedFilesList`.
- **État de dépliage** : `expanded: Set<string>` local, réinitialisé au changement de `cwd`. Racine dépliée d'office. Quand un filtre est actif, l'union de `expanded` et du `expand` renvoyé par `filterTree` est utilisée pour le rendu, sans écraser l'état manuel — vider le filtre restaure l'arbre tel que l'utilisateur l'avait laissé. ⚠️ **Ce design a été écarté en implémentation, voir « Écarts assumés par rapport à l'implémentation » en fin de document.**
- **Surlignage** : la ligne dont le `path` correspond à `activePath` (comparaison tolérant un chemin absolu par suffixe, comme `matchFileDiff`) reçoit `bgcolor: action.selected`.
- **Couleurs** : tokens MUI uniquement — `text.secondary` pour les libellés, `text.disabled` pour les icônes de fichier, `primary.main` atténué pour les dossiers, `action.hover` au survol. Fonctionne en dark et en light sans branche conditionnelle.
- **États** : `CircularProgress` centré pendant le chargement ; message `explorerEmpty` si zéro fichier ; message `explorerNotARepo` si `code: 'not_a_repo'` ; message `explorerNoMatch` si le filtre ne renvoie rien ; bandeau `explorerTruncated` en `warning.main` si `truncated`, dans le même style que le bandeau `fileTruncated` de `FileContentView`.

### Composant — `src/components/workbench/CodeBlock.tsx`

Props : `{ code: string; path: string }`. Consommé par `FileContentView` à la place de son rendu `<pre>` actuel.

- Singleton de module : `getHighlighter()` fait `await import('shiki')` puis `createHighlighter({ themes: ['github-dark-default', 'github-light'], langs: [...] })`. La promesse est mémoïsée, donc un seul chargement par session de navigation.
- Thème choisi selon `useColorMode`. Un changement de mode re-rend avec l'autre thème sans recharger shiki.
- Langage via `languageFromPath(path)`.
- `codeToHtml` avec numérotation de ligne activée, injecté par `dangerouslySetInnerHTML`. La source vient du disque local de l'utilisateur, pas d'un tiers ; le risque XSS est celui d'un fichier qu'il a lui-même écrit.
- **Fallback** : tant que shiki charge, le texte brut monospace est affiché — pas de flash vide. Si l'import échoue, on reste sur le brut définitivement, sans erreur bloquante.
- La gouttière `<pre>` de numéros de `FileContentView` est supprimée, remplacée par celle de shiki.

### Câblage dans `Workbench.tsx`

- `type RightTab = 'changes' | 'activity' | 'explorer' | 'issue'`.
- Nouveau `<Tab>` inséré entre `activity` et `issue`, icône `FolderCopyRoundedIcon`, libellé `t('chipExplorer')`, sans compteur.
- Disponible y compris en session archivée : contrairement à Activity, consulter les fichiers d'un worktree archivé reste utile. Aucun ajustement de `effectiveRightTab` n'est donc nécessaire pour ce nouvel onglet.
- `rightContent` rend `<FileExplorerTab cwd={diffPath} activePath={isSessionTab(activeTab) ? null : activeTab} onOpenFile={openChanges} />`.
- `diffPath` (worktree, sinon project_path) est réutilisé tel quel — c'est déjà la racine que `useGitDiff` et `FileContentView` emploient, donc les chemins restent mutuellement compatibles.

## Gestion des erreurs

| Situation                                    | Comportement                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Serveur agent injoignable                    | `localFetch` lève `AgentOfflineError`, la query passe en `error` → empty-state `explorerError` |
| `cwd` absent (session sans worktree)         | Hook désactivé, empty-state `explorerEmpty`                                                    |
| Répertoire hors dépôt git                    | `code: 'not_a_repo'` → message dédié                                                           |
| Plus de 20 000 fichiers                      | Liste coupée + bandeau d'avertissement visible                                                 |
| Fichier supprimé entre le listing et le clic | `read-file` renvoie 404, `FileContentView` affiche déjà `fileError`                            |
| Fichier binaire                              | Rendu en texte via shiki en `text` ; le cap 1 Mo serveur limite les dégâts                     |
| Chargement de shiki en échec                 | Repli silencieux sur le texte brut                                                             |

## i18n

Nouvelles clés dans le namespace `workbench`, traduites dans les 5 locales (`en`, `fr`, `es`, `de`, `pt`) :

`chipExplorer`, `explorerFilter`, `explorerEmpty`, `explorerNoMatch`, `explorerNotARepo`, `explorerTruncated`, `explorerError`.

Aucun texte en dur dans les composants.

## Tests

Convention du repo : Vitest sur la logique pure uniquement.

- `src/lib/fileTree.test.ts` — construction depuis une liste plate, tri dossiers-avant-fichiers, insensibilité à la casse du tri, chemins à segment unique, dossiers profonds, filtre conservant les ancêtres, filtre sur un nom de dossier conservant le sous-arbre, `flattenVisible` n'émettant pas les enfants repliés.
- `src/lib/languageFromPath.test.ts` — extensions courantes, noms de fichiers entiers, extension inconnue → `text`, fichier sans extension.

L'UI se vérifie par `npm run lint`, `tsc --noEmit`, `npm run build` et un passage manuel dans le Workbench, en dark et en light.

## Hors périmètre

- Menu contextuel (copier le chemin, révéler dans le Finder, ouvrir dans l'éditeur).
- Création, renommage, suppression de fichiers depuis l'explorateur.
- Glisser-déposer.
- Recherche dans le contenu des fichiers (l'agent le fait mieux).
- Décorations git par fichier (M/A/D en couleur) dans l'arbre.
- Coloration syntaxique des blocs de code du chat markdown — `CodeBlock` sera réutilisable pour ça, mais c'est une itération séparée.

## Écarts assumés par rapport à l'implémentation

Ce spec a été écrit avant l'implémentation ; plusieurs points divergent de ce qui a été réellement livré, constatés en revue finale de branche. Dans le même esprit que la section « Écarts assumés par rapport au spec » du plan d'implémentation (`docs/superpowers/plans/2026-07-27-file-explorer.md`) : le code livré fait foi, ce spec n'a pas été réécrit rétroactivement pour ne pas effacer l'intention de départ.

1. **Modèle d'expansion pendant le filtre (le plus important).** Le paragraphe « État de dépliage » ci-dessus décrit une union permanente de `expanded` et du `expand` renvoyé par `filterTree`. Ce design a bien été implémenté (Task 4), puis **explicitement écarté** après un premier fix round : il rendait certains clics muets (replier un dossier ouvert par le filtre ne faisait rien tant que le filtre restait actif, et l'ouverture survivait à l'effacement du filtre). L'implémentation livrée utilise un **unique set `expanded` faisant autorité** sur tout clic, avec un snapshot/restore (`preFilterExpanded`) au démarrage et à la fin du filtre — voir `src/components/workbench/FileExplorerTab.tsx`. Un lecteur qui suivrait ce paragraphe à la lettre réintroduirait le bug corrigé.
2. **Identifiant du thème clair shiki.** Le spec écrit `github-light` ; le thème réellement bundlé et utilisé est `github-light-default` (même famille de nommage que `github-dark-default`, déjà correct dans ce document).
3. **Numérotation de ligne.** Le spec dit « `codeToHtml` avec numérotation de ligne activée » — shiki n'a pas d'option de ce type. Les numéros sont rendus par un compteur CSS sur les `<span class="line">` que shiki émet (déjà noté dans le plan d'implémentation, écart n°1).
4. **Debounce du filtre.** Le spec dit « la valeur saisie est debouncée à 120 ms ». L'implémentation utilise `useDeferredValue` de React 19, sans `setTimeout` (déjà noté dans le plan d'implémentation, écart n°3).
5. **Nombre de clés i18n.** Le spec en liste 7. La Task 3 en a livré 9 (elle ajoute aussi `explorerClearFilter` et `fileNoHighlight`, absentes de cette liste), et la revue finale de branche en a ajouté une 10ᵉ, `explorerTooManyRows`, pour avertir quand le rendu de l'arbre est tronqué au-delà de 500 lignes.
6. **Repli en cas d'échec de shiki.** La table « Gestion des erreurs » dit « Repli silencieux sur le texte brut ». Ce n'est plus le cas depuis un correctif de Task 6 : l'échec est loggé une fois par page (`console.error`), pour rester diagnosticable, tout en gardant le repli définitif sur le texte brut (retenter à chaque fichier ouvert ne servirait à rien pour un échec de bundle, déterministe).
