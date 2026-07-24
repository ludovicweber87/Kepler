# Feature « Docs » — Design / Spec

Date : 2026-07-24
Statut : validé en brainstorming, en attente de plan d'implémentation
Auteur : Product Owner (Devora)

## 1. Intention & valeur

Permettre à Ludovic de faire **rédiger de la documentation par une IA** depuis Devora, via une
section dédiée du menu (« Docs »). Deux usages :

- **Savoir général** : documentation pédagogique sur un sujet/techno externe (« explique-moi
  Kubernetes », « les bases de PostgreSQL »). L'IA rédige depuis ses connaissances, avec
  recherche web autorisée pour actualiser/enrichir.
- **Doc de codebase** : documentation d'un des repos de Ludovic (archi, module, onboarding).
  L'IA lit le code du repo pour rédiger.

Un **persona rédacteur dédié**, **caché**, porte la tâche. « Caché » = c'est une **constante de
code** (`docWriter.ts`), **pas** une ligne de la table `personas` : il n'est donc jamais inséré ni
listé dans l'UI persona — aucun mécanisme de filtrage n'est nécessaire. L'utilisateur décrit ce
qu'il veut via un formulaire ; la doc se génère en arrière-plan, puis peut être lue, affinée en
langage naturel, éditée et exportée.

### Non-goals (YAGNI)

- Pas de versioning/historique de versions de la doc (on garde seulement l'état courant + le fil
  de chat d'affinage).
- Pas de « régénérer from scratch » dédié (l'affinage par chat couvre l'itération).
- Pas de partage/multi-utilisateur (Devora est mono-utilisateur local).
- Le persona rédacteur n'est **pas** exposé dans l'UI (ni dans `/personas`, ni dans Settings).

## 2. User stories & critères d'acceptation

### US-1 — Voir mes docs
> En tant qu'utilisateur, je veux une page listant mes docs, organisée par catégories, pour
> retrouver et suivre l'état de génération.

- La sidebar affiche une entrée **📚 Docs** menant à `/docs`.
- La page liste les docs sous forme de **cartes** (variante A), avec : titre, source (🌐 savoir /
  📦 repo), format, niveau, longueur estimée, **badge de statut** (En attente / Génération… /
  Prête / Échec) et barre de progression pour l'état « génération ».
- Une **barre d'onglets** représente les catégories (tags) : onglet « Toutes » + une par
  catégorie (avec pastille couleur). Cliquer un onglet filtre la liste par ce tag.
- La liste se rafraîchit automatiquement (polling) tant qu'au moins une doc est en génération.
- État vide : message d'invitation à créer la première doc.

### US-2 — Gérer les catégories (onglets) à la volée
> En tant qu'utilisateur, je veux créer/renommer/supprimer des catégories directement depuis la
> barre d'onglets et le formulaire.

- Un bouton **＋ Catégorie** ouvre un mini-formulaire (nom + couleur) et crée la catégorie.
- Une doc peut porter **plusieurs** catégories (tags, relation N-N).
- Supprimer une catégorie **ne supprime jamais** de doc : les liens sont retirés, les docs
  concernées repassent en « sans catégorie » (visibles dans « Toutes »).
- (Optionnel, si peu coûteux) réordonner les onglets par glisser-déposer (pattern `tab_orders`).

### US-3 — Créer une doc
> En tant qu'utilisateur, je veux un formulaire de création pour décrire la doc voulue.

- Le formulaire s'ouvre dans un **drawer latéral** (pattern éditeur de persona).
- Champs :
  - **Sujet** (texte libre, requis) — le « quoi ».
  - **Source** : `Savoir général` (défaut) ou `À partir d'un repo`. Si repo → sélecteur de repo
    parmi les **repos configurés** (`repo_paths`).
  - **Niveau** : Débutant / Intermédiaire / Senior.
  - **Longueur** : Court / Moyen / Long.
  - **Format** : Vue d'ensemble / Tutoriel / Référence / Cheat sheet / Comparatif.
  - **Catégories** : multi-sélection, avec création à la volée.
  - **Angle / focus** : texte libre optionnel.
- À la validation : la doc apparaît immédiatement dans la liste en **« En attente »** et la
  génération démarre en arrière-plan. Le drawer peut être fermé sans interrompre la génération.

### US-4 — Génération asynchrone
> En tant qu'utilisateur, je veux que la doc se génère en arrière-plan sans bloquer l'UI.

- Le statut évolue : `queued` → `generating` → `ready` (ou `failed`).
- Un échec est visible (badge « Échec ») avec un bouton **« Réessayer »** qui **relance la
  génération initiale** (nouveau tour sur la session de la doc, même brief) — voir §4 pour le
  détail du chemin de relance.
- La génération utilise le **persona rédacteur caché** (prompt système en dur).

### US-5 — Lire une doc
> En tant qu'utilisateur, je veux lire la doc dans un rendu propre.

- Page `/docs/[id]` : rendu **Markdown** (react-markdown + remark-gfm — déjà dans la stack),
  **sommaire** (table des matières) latéral, chips catégorie/format/niveau dans la barre d'outils.
- **Coloration syntaxique** des blocs de code = **net-new** (aucun highlighter dans le repo
  aujourd'hui) → nécessite une dépendance (ex. `rehype-highlight`/shiki). Optionnelle : à cadrer
  dans la tranche « lecture » ou à repousser au backlog si coûteux.

### US-6 — Affiner par chat
> En tant qu'utilisateur, je veux demander des retouches en langage naturel.

- Un **panneau d'affinage** (chat) accompagne la lecture. Chaque demande (« ajoute une section
  sur X », « simplifie l'exemple ») passe par la **même session agent SDK** que la génération.
- Le persona renvoie **toujours la doc entière en Markdown** → le `content` est remplacé à chaque
  tour et la lecture se met à jour.
- Le fil de chat est persisté (transcript) et rejoué à la réouverture.
- Boutons rapides d'affinage (« Rends plus court », « Ajoute des exemples », …).
- **Cohérence avec l'édition manuelle (US-7)** : `docs.content` est **la source de vérité**. Avant
  chaque tour d'affinage, la version **courante** de `content` (y compris d'éventuelles éditions
  manuelles) est ré-injectée dans le tour comme base de travail, pour que le persona ne l'écrase
  pas silencieusement. (En pratique : le tour d'affinage inclut le contenu courant en contexte.)

### US-7 — Éditer & exporter
> En tant qu'utilisateur, je veux éditer manuellement et exporter la doc.

- Bascule **Lecture / Édition** (édition manuelle du Markdown, sauvegardée dans `content`).
- **Export** : copier le Markdown, télécharger `.md`, (et PDF si peu coûteux — sinon backlog).

## 3. Modèle de données (SQLite / Drizzle)

### Nouvelles tables

**`docs`**
| Colonne | Type | Notes |
| --- | --- | --- |
| id | text (uuid) | PK |
| title | text | dérivé du sujet, éditable |
| subject | text | le « quoi » |
| source_type | text | `'knowledge'` \| `'repo'` |
| repo_full_name | text nullable | si `repo`, référence `repo_paths` |
| level | text | `beginner`\|`intermediate`\|`senior` |
| length | text | `short`\|`medium`\|`long` |
| format | text | `overview`\|`tutorial`\|`reference`\|`cheatsheet`\|`comparison` |
| angle | text nullable | focus libre |
| content | text nullable | Markdown courant (null avant 1re génération) |
| status | text | `queued`\|`generating`\|`ready`\|`failed`, défaut `queued` |
| error | text nullable | message d'erreur si `failed` |
| agent_session_id | text nullable | → `agent_sessions.session_id` |
| created_at / updated_at | text | défaut `datetime('now')` |

**`doc_categories`**
| Colonne | Type | Notes |
| --- | --- | --- |
| id | text (uuid) | PK |
| name | text | unique |
| color | text | hex |
| sort_order | integer | défaut 0 |
| created_at | text | |

**`doc_category_links`** (N-N)
| Colonne | Type | Notes |
| --- | --- | --- |
| id | text (uuid) | PK |
| doc_id | text | → docs |
| category_id | text | → doc_categories |
| — | — | unique(doc_id, category_id) |

### Table réutilisée / modifiée

- **`agent_sessions`** : une session par doc (persona rédacteur). Ajouter une colonne
  **`origin`** (text, défaut `'workbench'`) ; les sessions de docs portent `origin='doc'` et sont
  **exclues** des listings de sessions/sidebar Projets (`GET /sessions`, `useSessionManager`, etc.).
- **`agent_chat_messages`** : transcript du fil de génération + affinage (inchangé).

Migrations : ajouter les fichiers `.sql` numérotés dans `src/db/migrations/` + entrée
`_journal.json` (source de vérité) ; `ensureSchema()` sert de filet de sécurité au boot.

## 4. Backend — persona & génération (packages/agent)

> ⚠️ **Contrainte de faisabilité (vérifiée sur le code)** : `sdkAgent.startOrAttach()` exige un
> `StreamSocket` et **ne retourne pas** le `result` (il diffuse des frames `stream-event` et écrit
> le transcript). Le seul pattern **headless** qui renvoie une string en accumulant le `result` est
> `runRecapAgent` (`packages/agent/src/sdk/recapAgent.ts`), qui **fixe ses outils en dur**
> (`allowedTools`). Par ailleurs, ni `allowedTools`/`disallowedTools` dans `StartParams`/
> `buildQueryOptions`, ni un outil `WebSearch`, n'existent aujourd'hui. Le design ci-dessous en
> tient compte.

- **`packages/agent/src/sdk/docWriter.ts`** *(nouveau)* :
  - `buildDocWriterSystemPrompt()` : constante en dur (persona rédacteur). Instruit le modèle de
    **toujours renvoyer la doc complète en Markdown** (un seul artefact), adaptée au niveau,
    longueur, format et angle fournis.
  - `buildDocBrief(doc)` : prompt utilisateur initial à partir des champs de la doc.
  - `buildRefineTurn(doc, instruction)` : prompt d'un tour d'affinage, **incluant le `content`
    courant** comme base (cf. US-6, cohérence avec l'édition manuelle).
  - `toolPolicyFor(sourceType)` : renvoie l'`allowedTools` à appliquer selon la source.

- **Une session agent SDK par doc** (décision produit : génération + affinage sur le **même fil**).
  Chemin retenu pour concilier « async sans navigateur ouvert » **et** « fil conversationnel » :
  - On introduit un **driver headless côté serveur** qui pilote la session **sans client
    navigateur**. Deux options d'implémentation à trancher au moment du plan (spike) :
    1. **Adaptateur `StreamSocket` serveur** (« faux socket ») passé à `startOrAttach` : capte le
       `result`/dernier message assistant → `docs.content`, puis met à jour le statut. Avantage :
       une seule mécanique (`startOrAttach`) pour la génération **et** l'affinage, transcript unifié.
    2. **`query()` headless façon `runRecapAgent`** pour la génération (retourne la string →
       `content`), en **persistant l'id de session SDK** (`agent_sessions.claude_session_id`) afin
       que l'affinage **reprenne** (`resume`) cette session via le flux WebSocket habituel.
  - Recommandation : **option 1** (adaptateur socket) car elle respecte au plus près la décision
    « même fil SDK » et unifie la capture de `content`. L'option 2 reste un repli plus simple.
  - **Extension requise** (nouveau, à faire dans le plan) : ajouter `allowedTools` /
    `disallowedTools` à `StartParams` + `buildQueryOptions` (aujourd'hui absents) pour permettre le
    gating par source. À défaut, s'aligner sur le pattern `runRecapAgent`.

- **Politique d'outils par source** :
  - Source `knowledge` : `cwd` = dossier scratch dédié, **pas d'outils fichiers**. **WebSearch
    souhaité** (décision produit) → **à vérifier au plan** que l'outil est disponible/activable
    dans cette configuration SDK ; **s'il ne l'est pas**, repli = rédaction depuis les
    connaissances du modèle seules (dégradation acceptable, à noter au plan).
  - Source `repo` : `cwd` = `repo_paths.local_path`, outils de **lecture** (Read/Grep/Glob), pas
    d'écriture ; WebSearch idem (souhaité, sous réserve de dispo).

- **Déclenchement & statut** : `POST /docs/:id/generate` (serveur agent), lancé en fire-and-forget
  à la création **et** pour la **relance** d'une doc `failed` (US-4). Transitions :
  `queued` → `generating` (au démarrage du driver) → `ready` (content capturé) / `failed` + `error`.
  Une relance repart du **brief initial** (pas d'affinage) sur la session de la doc.

- **Capture de `content`** : à la fin de chaque tour (génération initiale **et** affinage), le
  dernier message assistant (Markdown complet) est extrait et écrit dans `docs.content`
  (`updated_at` mis à jour). Le transcript reste dans `agent_chat_messages`.

## 5. Frontend

- **Route** `src/app/(app)/docs/page.tsx` (liste) + `src/app/(app)/docs/[id]/page.tsx` (détail).
- **Composants** `src/components/docs/` :
  - `DocsPage.tsx` (liste + barre d'onglets catégories + polling).
  - `DocCard.tsx`, `DocStatusBadge.tsx`.
  - `CategoryTabs.tsx` + `CategoryCreatePopover.tsx`.
  - `DocFormDrawer.tsx` (création).
  - `DocDetail.tsx` (lecture + sommaire), `DocRefinePanel.tsx` (chat d'affinage, réutilise le
    pattern `useAgentChat`), `DocEditor.tsx` (édition Markdown), `DocExportMenu.tsx`.
- **Hooks** : `useDocs` (liste + CRUD, optimiste), `useDoc` (une doc + polling si en génération),
  `useDocCategories` (CRUD catégories + liens). Affinage = `useAgentChat` scoppé sur
  `docs.agent_session_id`.
- **Sidebar** : ajouter l'entrée `docs` (icône `MenuBookRounded`) dans `Sidebar.tsx`.
- **Patterns réutilisés (précis)** :
  - **Liste** : s'inspirer de la feature `tasks` (`TasksPage`) — mais son formulaire est une
    **Modal** (`TaskFormModal`). Pour notre **formulaire**, on suit plutôt le pattern **Drawer**
    `PersonaEditorDrawer` (MUI `Drawer` à droite), conformément à la décision produit.
  - **Onglets catégories** : réutiliser `DraggableTabs` + `useTabOrder` (déjà en place) pour
    l'affichage et le réordonnancement, plutôt que de réimplémenter.

## 6. API (Next)

- `GET/POST /api/docs`, `GET/PATCH/DELETE /api/docs/[id]` (CRUD + update `content`/`title`,
  déclenche la génération à la création via le serveur agent).
- `GET/POST /api/doc-categories`, `PATCH/DELETE /api/doc-categories/[id]`.
- Gestion des liens catégorie ↔ doc (dans `/api/docs/[id]` ou endpoint dédié).
- Toutes protégées par `requireAuth()` (pattern existant).

## 7. i18n

- Nouveau namespace **`docs`** dans `src/config/translate/{en,fr,es,de,pt}.json` (formulaire,
  statuts, boutons, vue détail).
- Clé `sidebar.docs`. **Aucun texte en dur** dans les composants.

## 8. Edge cases & décisions

- **Suppression catégorie** → retrait des liens, docs préservées (« sans catégorie »).
- **Doc sans catégorie** → visible uniquement dans l'onglet « Toutes ».
- **Repo non configuré** pour source repo → invite à configurer dans Settings.
- **Sessions de doc** exclues des vues de sessions normales via `origin='doc'`.
- **Persona rédacteur** jamais listé dans `usePersonas`/`PersonaCards`.
- **Longueur** = indication de volume passée au persona (pas une contrainte dure).

## 9. Tests

- Convention repo : **logique pure** en Vitest (`*.test.ts`) — ex. `buildDocBrief`,
  construction du prompt, extraction du Markdown, reducers de statut, helpers de filtrage par
  catégorie.
- UI vérifiée par `lint` + `tsc --noEmit` + `build` + run manuel.

## 10. Découpage indicatif en tranches livrables

1. **Socle données + liste** : tables `docs`/`doc_categories`/`doc_category_links`, entrée
   sidebar, page `/docs` (cartes + onglets, sans génération réelle → statut mock/manuel).
2. **Création + génération async** : drawer formulaire, persona `docWriter.ts`, endpoint
   génération, polling statut, capture du `content`.
3. **Vue détail lecture** : `/docs/[id]`, rendu Markdown + sommaire.
4. **Affinage par chat** : panneau réutilisant `useAgentChat` sur la session de la doc.
5. **Édition & export** : bascule lecture/édition, copier/.md (PDF en option).
6. **Catégories avancées** : réordonnancement onglets, polish.
