# Refonte UI page Settings — accordions par catégorie + liste dense GitHub Projects

**Date:** 2026-07-17
**Fichier principal:** `src/components/settings/SettingsPanel.tsx`

## Problème

La page Settings empile deux sections (`Box` + titre) : « Chemins locaux des repos » (grille de cards)
et « GitHub Projects ». Cette dernière rend **un `Accordion` par projet**, empilés verticalement.
Avec beaucoup de projets, la page scrolle énormément. De plus, le toggle « connecter le board »
est enfoui dans le détail de chaque accordion projet — l'état de connexion n'est pas visible d'un
coup d'œil.

## Objectifs

1. Réorganiser la page en **accordions par catégorie**.
2. Remplacer la pile d'accordions-projet par un **affichage dense** qui scrolle peu.
3. Rendre l'**état de connexion visible directement** sur chaque ligne projet.

## Design

### 1. Accordions par catégorie

La page rend 2 `Accordion` de catégorie (style aligné sur l'accordion existant : `bgcolor: transparent`,
`boxShadow: none`, `&:before { display: none }`, border `divider`, radius 8px) :

| Catégorie | Icône summary | État initial | Chip résumé (dans summary) |
|---|---|---|---|
| Chemins locaux des repos | `FolderRoundedIcon` | **ouvert** (`defaultExpanded`) | « N repos » |
| GitHub Projects | `GitHubIcon` | **replié** | « N connectés » (si > 0) |

- Le titre `h4` gradient reste en tête de page, au-dessus des accordions.
- Le contenu actuel de chaque section (grille repos / liste projets) glisse dans `AccordionDetails`.
- La description de section (`repoPathsDesc`, `selectViewsDesc`) passe sous le résumé, dans le détail.

### 2. GitHub Projects — liste dense « connectés d'abord + filtre »

Nouveau sous-composant `ProjectList` (remplace la pile de `ProjectSection` accordions) :

- **Header de liste** : `TextField` de filtre (recherche sur titre + org) à gauche ; à droite,
  compteur « N connectés » + bouton texte **« Tout effacer »** visible seulement si ≥ 1 projet
  connecté. Ce bouton appelle **`clearConfig`** du hook `useProjectConfig` (le hook n'expose pas de
  `clearAll` ; `clearAll` est seulement la clé i18n, libellé « Tout effacer »). ⚠️ `clearConfig`
  fait `DELETE /api/project-configs?all=true` : il **efface toutes les configs** (connexion + views
  + mappings), ce n'est pas un simple « déconnecter ». On garde donc le libellé « Tout effacer »
  (clé `clearAll`) — pas « Tout déconnecter ».
- **Aplatissement** : les `orgProjects` (groupés par org) sont aplatis en une liste unique
  `{ org, ownerType, project, savedConfig }`.
- **Tri** : connectés d'abord, puis par titre. Séparateur discret (`Divider`) entre le bloc connecté
  et le reste. Le filtre s'applique avant le tri.
- **Chaque projet = une ligne dense** (`ProjectRow`, hauteur ~44px) :
  - icône/marque d'état à gauche (check success si connecté),
  - titre du projet (`subtitle2`),
  - org en caption (`text.secondary`),
  - caption « N views » si `views` chargées,
  - `Chip` d'état : vert « Connecté » / gris « Non connecté »,
  - `Switch` inline (toggle `connected` — remplace l'ancien enfoui dans l'accordion),
  - `IconButton` refresh (conserve `fetchViews`, animation spin pendant load).
- **Séparateur** : `Divider` entre bloc connecté et le reste **seulement si les deux groupes sont non
  vides** (supprimé si 0 connecté ou si tous connectés).
- **Auto-fetch des views (optimisé)** : ⚠️ le but étant « beaucoup de projets », on **ne fetch PAS**
  les views de tous les projets au montage (N requêtes `/api/github/projects` parallèles). Nouvelle
  règle : au montage, `ProjectRow` fetch ses views **uniquement si le projet est connecté** (les views
  d'un board connecté alimentent le kanban). Un projet non connecté fetch ses views **à la demande**
  (au moment où on l'active via le toggle, ou via le bouton refresh). Cela conserve le comportement
  utile tout en supprimant la rafale de requêtes.
- **États** :
  - skeleton pendant `loadingProjects` ;
  - **erreur de découverte projets** (échec du fetch org/projects de `SettingsPanel`) → `Alert error`
    rendue **dans le détail de l'accordion GitHub Projects**, au-dessus de la liste ;
  - erreur de fetch views par ligne → indicateur d'erreur discret sur la ligne (icône/tooltip),
    pas un `Alert` pleine largeur ;
  - `Alert info` si aucun projet trouvé ;
  - message « aucun résultat » (clé `noProjectsMatch`) si le filtre ne matche rien.

### 3. Inchangé

- Section repos : `RepoPathCard`, `AddRepoCard`, grille `auto-fill minmax(280px,1fr)` — contenu
  identique, juste déplacé dans l'accordion.
- Dialog ajout repo manuel, `Snackbar`, hooks (`useProjectConfig`, `useRepoPaths`, `useAgentStatus`).
- Logique de sauvegarde (`saveConfig`, `handleToggleConnected` → `onSave({...config, connected})`).

## i18n

Nouvelles clés dans les 5 locales (`en/fr/es/de/pt`, namespace `settings`) :
- `filterProjects` — placeholder du champ de filtre,
- `connected` / `notConnected` — libellés du `Chip` d'état de ligne,
- `noProjectsMatch` — message filtre sans résultat,
- `connectedCount` — chip résumé accordion GitHub Projects, plural ICU « N connecté(s) »
  (⚠️ ne PAS réutiliser `configured` = « configuré(s) », texte différent),
- `repoCount` — chip résumé accordion Repos, plural ICU « N repo(s) »
  (aucune clé existante ne le couvre).

Réutilise : `repoPaths`, `githubProjects`, `viewsAvailable`, `connectBoard`, `clearAll`
(libellé « Tout effacer »), `refreshFromGithub`, `title`, `repoPathsDesc`, `selectViewsDesc`.

## Composants (découpage)

| Composant | Rôle | Dépend de |
|---|---|---|
| `SettingsPanel` | Orchestration, 2 accordions catégorie, dialog, snackbar | hooks, sous-composants |
| `ProjectList` | Filtre + tri + compteur + clearAll + map de `ProjectRow` | `orgProjects`, `configs` |
| `ProjectRow` | Ligne dense, état de connexion, toggle, refresh, auto-fetch views | `saveConfig` |
| `RepoPathCard` / `AddRepoCard` | Inchangés | — |

## Hors périmètre (YAGNI)

- Pas de persistance de l'état ouvert/replié des accordions (pas d'`app_settings`).
- Pas de sélection de views par projet (déjà absente de l'UI actuelle).
- Pas de refonte des cards repos.

## Vérification

`npm run lint`, `tsc --noEmit`, `npm run build`, run manuel sur `/settings` (accordions,
filtre, tri connectés d'abord, toggle, refresh, clearAll, ajout repo).
