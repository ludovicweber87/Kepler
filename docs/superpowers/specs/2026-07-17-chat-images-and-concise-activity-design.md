# Images dans le chat + Activity concise & rapport synthétisé

Date : 2026-07-17
Statut : validé (design)

## Objectif

Deux features indépendantes, livrées dans un spec/plan combiné, même branche.

**A. Images dans le composer de chat** : drag-and-drop ou copier-coller une image → un chip
(nom + croix pour supprimer) apparaît ; à l'envoi, l'image est transmise à l'agent Claude
(qui lit les images nativement), affichée en miniature dans la bulle, et persistée.

**B. Activity concise + rapport synthétisé** : les logs de l'onglet Activity doivent être
courts, clairs et précis (découvertes, décisions prises) au lieu du message final complet de
l'agent. Le bouton « Publier un rapport » produit une synthèse LLM de tout l'Activity.

## Décisions

1. **Rendu image** : miniature dans la bulle utilisateur ; fichier écrit sur disque, référencé
   par chemin/URL dans le transcript (pas de base64 en DB).
2. **Logs concis** : synthèse LLM par tour (async, non bloquante) → 1–3 puces (découvertes /
   décisions). Le chat garde la réponse complète ; seul l'Activity est condensé.
3. **Rapport** : synthèse LLM à partir des **logs Activity** (summary + error) uniquement.
4. **Organisation** : un seul spec + un seul plan.
5. **Mécanisme LLM** : `claude --print` (pattern déjà présent), lancé en **async** via `execFile`
   (jamais `execSync` pour le per-turn), modèle rapide `haiku`. `findClaude()` + strip de
   `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` de l'env, comme l'auto-summary existant.
6. **Emplacement images** : `data/attachments/<sessionId>/<uuid>.<ext>` (à côté de `devora.db`),
   servi par le serveur agent.
7. **Caps images** : 5 Mo/image, types SDK `image/png|jpeg|gif|webp`, multi-images autorisé.
8. **Nettoyage disque** : hors périmètre (app locale mono-user) — écriture seulement.

---

## Feature A — Images dans le chat

### Flux client → serveur → SDK

```
ChatComposer (drop/paste → attachments[] + chips)
  → onSend(text, attachments)
    → AgentChatTab.handleSend → useAgentChat.send(text, images)
      → WS { type:'stream-user-message', text, sessionId, images:[{name,mediaType,data(base64)}] }
        → terminal.ts (StreamUserMessage étendu) → sdkAgent.sendUserMessage(sessionId, text, images)
          → écrit data/attachments/<sessionId>/<uuid>.<ext>
          → promptQueue.push({ text, images }) → content = [ {type:text}, {type:image,source:base64}… ]
          → transcript user event: data:{ text, images:[{name,url}] }  (URL, pas base64)
```

### Types & payloads

- **Client** (`src/hooks/useAgentChat.ts`) : `send(text: string, images?: ChatImageInput[])`.
  `ChatImageInput = { name: string; mediaType: string; data: string /* base64 sans préfixe */ }`.
  Payload WS : `{ type:'stream-user-message', text, sessionId, images?: ChatImageInput[] }`.
  Le type local `QueuedMessage` devient `{ id, text, images? }` (les images suivent le texte
  dans la file d'ordre client).
- **Serveur** (`packages/agent/src/terminal.ts`) : `StreamUserMessage` gagne `images?: ChatImageInput[]`.
  Handler → `sdkAgent.sendUserMessage(sessionId, text, images)`.
- **SDK** (`packages/agent/src/sdk/promptQueue.ts`) : `push(text, images?)` construit
  `message.content` = `string` si pas d'images, sinon `[{type:'text',text}, ...images.map(img =>
  ({type:'image', source:{type:'base64', media_type: img.mediaType, data: img.data}}))]`.
- **StreamEvent user** (`packages/agent/src/sdk/types.ts`) : `user` data devient
  `{ text: string; images?: { name: string; url: string }[] }`.
- **Client render** (`src/types/index.ts`) : nouveau `ChatSegment { kind:'image'; url: string; name: string }` ;
  `chatReducer.userMessage(text, images?)` ajoute des segments image ; `ChatBubble.tsx` rend une
  `<img>` en miniature (max ~180px, borderRadius, clic = ouvrir dans un nouvel onglet).

### Écriture disque & service

- `packages/agent/src/sdk/attachments.ts` (nouveau) : `saveAttachment(sessionId, name, mediaType,
  base64): { url }` — écrit sous `<dataDir>/attachments/<sessionId>/<uuid>.<ext>` (dataDir dérivé
  du chemin de `devora.db`, cf. `db.ts`), renvoie l'URL relative `/attachments/<sessionId>/<file>`.
  Extension dérivée du mediaType.
- Serveur agent (`packages/agent/src/index.ts`) : nouveau préfixe `path.startsWith('/attachments/')`
  → sert le fichier (lecture disque, `Content-Type` = mediaType, 404 si absent). Chemin sécurisé
  (pas de `..`).
- Client : l'URL absolue = `NEXT_PUBLIC_AGENT_URL` + url relative (helper existant `getAgentWsUrl`
  côté WS ; ici on compose l'URL HTTP de l'agent).

### Composer UI (`src/components/agents/chat/ChatComposer.tsx`)

- State `attachments: Attachment[]` avec `Attachment = { id, name, mediaType, data(base64), previewUrl }`.
- `onPaste` : parcourt `e.clipboardData.items`, prend les `type.startsWith('image/')`, lit en base64.
- `onDrop`/`onDragOver` : `preventDefault`, prend `e.dataTransfer.files` images. Style visuel
  « drop zone active » sur dragover.
- Validation : mediaType ∈ {png,jpeg,gif,webp}, taille ≤ 5 Mo, sinon snackbar d'erreur (i18n).
- Chips au-dessus de l'input : nom tronqué + `IconButton` croix (supprime par id).
- `submit()` : autorise l'envoi si `text.trim()` **ou** `attachments.length > 0` ; appelle
  `onSend(text, attachments.map(→ ChatImageInput))` puis reset texte + attachments.
- `onSend` prop : `(text: string, images?: ChatImageInput[]) => void`.

---

## Feature B — Activity concise & rapport

### Logs concis (synthèse par tour)

- **Aujourd'hui** : `activityDeriver.deriveLogs` sur `result` → `{ log_type:'summary', content:
  event.data.text }` (message final complet, verbatim = verbeux).
- **Nouveau** :
  - `activityDeriver` n'émet **plus** le log `summary` verbeux sur `result` (il garde
    `file_change`/`commit`/`info` et `error`).
  - `sdkAgent` accumule, pour le tour courant, le texte final (`result`) + une liste compacte des
    actions outils du tour (issue de `deriveLogs`). À la fin du tour (`result`, non-erreur), il
    appelle **en async** `summarizeTurn(finalText, toolActions)` (`packages/agent/src/sdk/turnSummarizer.ts`).
  - `turnSummarizer.summarizeTurn` : `claude --print --model haiku` (async `execFile`, timeout
    20s, env nettoyé) avec un prompt FR demandant **1–3 puces courtes** (découvertes / décisions /
    résultat), sans préambule. Renvoie le markdown.
  - Le résultat est écrit comme log `summary` (via `writeActivityLog`) puis broadcasté (comme
    aujourd'hui les logs le sont). En cas d'échec/vide → fallback : `finalText` tronqué à ~280 car.
  - **Non bloquant** : `s.busy=false` et le retour à idle ne dépendent pas de la synthèse.

### Prompt per-turn (turnSummarizer)

```
Résume ce tour d'un agent de développement en 1 à 3 puces TRÈS courtes et précises
(découvertes, décisions prises, résultat). Style télégraphique, pas de préambule, pas de
répétition du prompt. Réponds UNIQUEMENT avec les puces markdown.

Message final de l'agent :
<finalText>

Actions réalisées :
<toolActions joined>
```

### Bouton « Publier un rapport » (synthèse)

- **Aujourd'hui** : `AgentActivityTab.handlePublish` → `buildReport` (`src/lib/activityReport.ts`)
  concatène les logs verbatim.
- **Nouveau** :
  - Nouvelle route agent `POST /agent-sessions/:id/synthesize-report` (dans `routes/sessions.ts`) :
    lit les logs `summary`+`error` de la session en DB, construit un prompt de synthèse FR
    (`## Fait` / `## Décisions` / `## Reste à faire`), lance `claude --print --model haiku`
    (async `execFile`, timeout 30s), renvoie `{ report: string }` (markdown). N'écrit rien en DB.
  - `handlePublish` : appelle d'abord `localFetch('/agent-sessions/<id>/synthesize-report', POST)`
    pour obtenir le markdown synthétisé, puis l'injecte dans le flux existant (commentaire issue +
    corps de PR + passage « Review » + PATCH `report_published_at`). `buildReport` est conservé en
    **fallback** si la route échoue.
  - Loader/état pendant la synthèse (bouton disabled + spinner + i18n).

---

## i18n

Ajouts (5 locales) :
- `agentChat` (ou nouveau namespace `composer`) : `attachImageError` (type/taille), `removeImage`.
- `agentActivity` : `synthesizing` (loader du rapport), `synthesizeError`.

## Tests (logique pure — convention repo)

- `promptQueue.push` : sans images → `content` string ; avec images → tableau de blocs corrects
  (text + image base64, media_type). (Extraire la construction du content dans une fn pure testable.)
- `attachments.saveAttachment` : mapping mediaType → extension ; forme de l'URL ; rejet chemin
  non sûr. (Partie pure : dérivation extension + nom de fichier ; l'écriture disque testée via un
  répertoire temporaire ou isolée.)
- Validation composer (fn pure) : accepte/rejette selon type & taille.
- `turnSummarizer` : fonction pure de construction du prompt + fallback (troncature) testables ;
  l'appel `claude` est isolé derrière une fonction injectable.
- `synthesize-report` : fonction pure de construction du prompt à partir des logs.

UI vérifiée par `lint` + `tsc --noEmit` + `build` + run manuel.

## Hors périmètre (YAGNI)

- Pas de suppression/rotation des fichiers images sur disque.
- Pas de compression/redimensionnement d'image (cap dur à 5 Mo).
- Pas de drag-drop de fichiers non-image (ignorés).
- Pas de reconfiguration du modèle de synthèse par l'utilisateur (haiku en dur).
- Le rapport reste basé sur les logs Activity (pas de diff git — décision explicite).
```
