# Lot 1 — Backend : gestionnaire de sessions Claude Agent SDK

> **Statut** : spec en revue (v3 — spike de forme réalisé, formes `SDKMessage` figées)
> **Date** : 2026-07-08 (spike : 2026-07-09)
> **Périmètre** : serveur agent (`packages/agent/`) uniquement.
> Fait partie d'un projet en 4 lots (voir « Contexte global »). **Ce lot ne touche ni le frontend, ni la DB, ni les settings.**

> **Historique** : la v1 pilotait `claude -p --output-format stream-json` à la main. Étude du projet de référence **emdash** + doc officielle → **pivot v2 vers `@anthropic-ai/claude-agent-sdk`** (streaming, modèle, effort, permission modes, resume natifs ; auth via l'**abonnement claude.ai**, login CLI, sans `ANTHROPIC_API_KEY`). **v3** : le spike de forme (`packages/agent/spike-sdk-shape.mjs`, SDK `0.3.205` + CLI `2.1.205`) a figé empiriquement les types réels — voir « Résultats du spike ». Toutes les incertitudes « à confirmer » de la v2 sont tranchées.
>
> **Note archi vs emdash** : emdash est une plateforme *multi-agents* (Claude, Gemini, Cursor, Goose…) bâtie sur **ACP** (Agent Client Protocol, JSON-RPC/stdio). Devora est **mono-agent Claude** → on pilote le **SDK `query()` directement** (bien plus léger), sans couche ACP. On emprunte toutefois à emdash son **vocabulaire de stream normalisé** (message / thought / tool-call lifecycle) et son **flux de permission**.

## Contexte global

Objectif d'ensemble : remplacer, dans `AgentTerminalModal`, l'onglet **Claude** (TUI xterm brut) par une **vue conversation structurée** (rendu markdown, tool calls, résultats) avec zone de composition, **sélecteur de modèle/puissance** (effort low→max), **sélecteur de mode** (plan / edit / …) et bouton « Create PR ». Décomposition validée :

| Lot | Contenu | Dépend de |
|---|---|---|
| **1 (cette spec)** | Gestionnaire de sessions Agent SDK + protocole WebSocket | — |
| 2 | `useAgentStream` + `AgentChatView` (MUI), remplace l'onglet Claude, re-câble worktree/agent_sessions/reporting | 1 |
| 3 | Colonne `claude_session_id` + re-hydratation ; persistance modèle/effort/mode par session | 1, 2 |
| 4 | Table KV `app_settings` + champ « PR Prompt » + bouton header qui injecte le prompt comme message user | 2 |

## Objectif du lot 1

Côté serveur agent, exposer un **canal WebSocket bidirectionnel** qui pilote une **session Claude Agent SDK persistante par session Devora** (via `query()` en *streaming input mode*), et diffuse aux clients les `SDKMessage` structurés. Le client peut envoyer des messages user et des commandes de contrôle (changer de modèle/effort/mode, interrompre).

## Décisions figées (validées)

1. **Moteur** : `@anthropic-ai/claude-agent-sdk`, `query({ prompt: asyncIterable, options })` en **streaming input mode** (une session persistante multi-tours ; on `yield` les messages user au fil de l'eau).
2. **Auth = abonnement claude.ai** : le SDK délègue au binaire `claude` (login OAuth). On passe `pathToClaudeCodeExecutable` (résolu via `findClaude()`) et on **strippe toutes les clés d'auth Anthropic** de l'env du SDK — `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` — sinon le SDK bascule sur l'auth API/proxy (contournement **silencieux** de l'abonnement). Nettoyage aussi de `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`.
3. **Transport** : **WebSocket** (bidirectionnel), extension du serveur WS existant (port 4001).
4. **Permissions par défaut** : `permissionMode: "acceptEdits"` (autonome dans le worktree isolé), surchargeable par le client vers **n'importe lequel des 6 modes**, `default` compris.
5. **Flux de permission complet (Option B)** : le lot 1 fournit `canUseTool` et implémente l'aller-retour WS `stream-permission-request` / `stream-permission-response` (allow-once / allow-always / reject) — voir « Flux de permission ». Le mode `default` est donc pleinement supporté.

## Contrat de l'Agent SDK (vérifié au spike — SDK 0.3.205)

- **Appel** : `const q = query({ prompt, options })` où `prompt` est un `string | AsyncIterable<SDKUserMessage>` (streaming input). `Query extends AsyncGenerator<SDKMessage, void>`.
- **Itération** : `for await (const msg of q)` — les `SDKMessage` réels observés : `system` (dont `subtype:'init'`), `assistant`, `user` (portant les `tool_result`), `result`, + du bruit (`system/hook_started`, `system/hook_response`, `system/thinking_tokens`, `rate_limit_event`). **Pas** de type top-level `tool_use`/`tool_result` : ils vivent dans le `content` des messages (voir mapping).
- **`SDKUserMessage` à pousser** : `{ type:'user', message: { role:'user', content: <string|blocks> }, parent_tool_use_id: null }`.
- **Options utiles** (toutes confirmées dans `Options`) : `model?: string`, `effort?: EffortLevel` (`low|medium|high|xhigh|max`), `permissionMode?: PermissionMode` (les **6** : `default|acceptEdits|bypassPermissions|plan|dontAsk|auto`), `cwd?`, `systemPrompt?: string | string[] | { type:'preset', preset:'claude_code', append?, excludeDynamicSections? }`, `resume?: string` / `continue?: boolean` / `resumeSessionAt?`, `pathToClaudeCodeExecutable?`, `allowedTools?`/`disallowedTools?`, `maxTurns?`, `thinking?`, `includePartialMessages?`, `canUseTool?: CanUseTool`, `abortController?`, `env?` (⚠️ **remplace** l'env du process, ne le merge pas — spread `process.env` soi-même).
- **Contrôles (streaming input only)** — méthodes réelles de `Query` : `setModel(model?)`, `setPermissionMode(mode)`, `setMaxThinkingTokens(n, display?)`, `applyFlagSettings(settings)`, `interrupt()`, `initializationResult()`, `initialize()`. ⚠️ **Il n'existe pas de `q.setEffort`** : l'effort est une **option de démarrage** ; pour le changer mid-session → `applyFlagSettings` (couche settings, à valider) **ou** recréer la session (option v1 retenue au lot 2 si besoin).
- **Session id de Claude** : porté par `system/init.session_id` **et** `result.session_id` → capturé (idempotent) pour le resume (persistance = lot 3).
- **Bonus repéré** : `renameSession(sessionId, title, opts?)` exporté au top-level (utile lots 3/4).

## Architecture

Nouveau module `packages/agent/src/sdkAgent.ts`, calqué sur le manager tmux (`terminal.ts`) mais pilotant des sessions Agent SDK.

### État par session (global)
```
Map<sessionId, {
  q: Query,                         // l'objet retourné par query()
  pushUserMessage: (text) => void,  // alimente l'AsyncIterable de prompt
  clients: Set<WebSocket>,          // multi-vues (modal + overlay)
  claudeSessionId: string | null,
  cwd: string,
  model: string,
  effort: string,
  permissionMode: string,
  busy: boolean,                    // un tour en cours
  pendingPermissions: Map<id, {    // requêtes canUseTool en attente (mode default)
    resolve, request,
  }>,
}>
```

**Alimenter le prompt** : `prompt` doit être un `AsyncIterable` vivant. On utilise une petite **file asynchrone** (une queue + un resolver `Promise`) : `pushUserMessage(text)` enfile un `SDKUserMessage` et débloque le générateur ; `close()` termine le générateur. (Pattern async-queue standard, pas de dépendance externe.)

### État par connexion (serveur WS)
Chaque connexion mémorise le `sessionId` du stream auquel elle est attachée (posé à `stream-init`), à côté du `pty` terminal existant — nécessaire pour router `stream-user-message`/contrôles et pour `ws.on('close')`.

### API interne
- `startOrAttach(sessionId, ws, { cwd, systemPrompt, model, effort, permissionMode, resumeClaudeSessionId? })` : session vivante → attache `ws` ; sinon crée la queue + `query(...)` et lance la boucle `for await` qui broadcast les events.
- `sendUserMessage(sessionId, text)` → `pushUserMessage`, `busy=true`.
- `setModel` / `setPermissionMode` / `setEffort` → `q.setModel()` / `q.setPermissionMode()` / (effort : `applyFlagSettings` ou restart, voir contrat) + maj état.
- `interrupt(sessionId)` → `q.interrupt()` (rejette aussi les permissions en attente).
- `resolvePermission(sessionId, id, decision)` → résout la Promise en attente dans `pendingPermissions` en `PermissionResult` (voir Flux de permission).
- `detach(sessionId, ws)` → retire `ws` ; **ne ferme pas** la session (fermer le modal ne stoppe pas l'agent).
- `stop(sessionId)` → `q.close()` + cleanup map (+ purge `pendingPermissions`).

`pendingPermissions` (voir État par session) est alimenté par le callback `canUseTool` passé dans `options` au démarrage de la session.

### Boucle de streaming
`for await (const msg of q)` : mapper chaque `SDKMessage` en event WS (voir mapping) et broadcast aux `clients`. Capturer `claudeSessionId`. Sur un `result`, `busy=false`. À la fin du generator (ou `q.close()`), broadcast `stream-closed` + cleanup. Toute exception → `stream-error {message, fatal}`.

### Auth / spawn
- `options.pathToClaudeCodeExecutable = findClaude()`.
- `options.env` = env nettoyé **sans** `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` (ni `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`), spread de `process.env` (PATH/HOME survivent). Le SDK spawn le CLI, qui utilise le login OAuth.
- `options.cwd` = worktree (fourni par le client, déjà créé au lancement).
- `options.systemPrompt` : le lot 1 **passe tel quel** le `systemPrompt` fourni par le client dans `stream-init`. La **composition** (`{ type:"preset", preset:"claude_code", append: <agentFile + reporting + issue> }`, avec le `sessionId` Devora injecté dans le reporting) est faite **côté client au lot 2** — le lot 1 ne lit pas `agent_sessions` (scope « pas de DB » préservé). Le reporting reste ainsi le mécanisme qui alimente activity logs + auto-rename.

## Protocole WebSocket

Nouvelles branches `stream-` dans la chaîne de `if` du handler de connexion de `terminal.ts` (délégation à `sdkAgent.ts`) ; branches terminal (`init`/`input`/`resize`) et `ws.on('close')` inchangées, ce dernier complété par `detach`.

**Client → serveur :**
| type | champs | effet |
|---|---|---|
| `stream-init` | `sessionId, cwd, systemPrompt, model, effort, permissionMode, resumeClaudeSessionId?` | `startOrAttach` |
| `stream-user-message` | `text` | `sendUserMessage` |
| `stream-set-model` | `model` | `q.setModel(model)` |
| `stream-set-effort` | `effort` | ⚠️ **pas de `q.setEffort`** → `q.applyFlagSettings(...)` (à valider) **ou** recréation de session |
| `stream-set-mode` | `permissionMode` | `q.setPermissionMode(mode)` — les 6 modes acceptés ; `default` déclenche le flux de permission (`canUseTool`) |
| `stream-interrupt` | — | `interrupt` |
| `stream-stop` | — | `stop` |
| `stream-permission-response` | `id, decision` (`allow-once`\|`allow-always`\|`reject`) | résout le `canUseTool` en attente |

**Serveur → client :**
| type | champs |
|---|---|
| `stream-ready` | `attached: boolean, claudeSessionId: string\|null, model, effort, permissionMode, busy: boolean, pendingPermissions: {id, toolName, input, title?, displayName?}[]` |
| `stream-event` | `event: 'session'\|'thinking'\|'assistant'\|'tool_use'\|'tool_result'\|'result', data: {...}` (formes = section mapping) |
| `stream-permission-request` | `id, toolName, input, title?, displayName?` |
| `stream-closed` | `reason: string` (ex: `"generator-ended"` \| `"stopped"`) |
| `stream-error` | `message: string, fatal: boolean` |

- **`busy` est exposé dans `stream-ready`** pour qu'un client qui se ré-attache sache si un tour est en cours (le générateur SDK n'a pas de code de sortie → `stream-closed` porte une `reason` textuelle, pas un code numérique).
- **Message pendant un tour (`busy`)** : le streaming-input du SDK **met en file** ; on transmet donc `stream-user-message` sans le rejeter. L'UI (lot 2) désactive la saisie pendant `busy`.
- **Ré-attache sur session vivante** : `startOrAttach` **ignore** le `model`/`effort`/`permissionMode` fournis (la session garde son état courant, renvoyé dans `stream-ready`) ; pour changer, le client émet ensuite `stream-set-*`.

### Mapping `SDKMessage` → `stream-event` (formes figées au spike)

**Whitelist, pas blacklist** : le SDK crache beaucoup de bruit (`system/hook_started`, `system/hook_response`, `system/thinking_tokens` ×N, `rate_limit_event`). On ne transmet que ce qui suit ; tout le reste est ignoré.

- **`system` `subtype:'init'`** → `session { id, model, permissionMode, cwd, tools }`. Champs réels : `session_id`, `model`, `permissionMode`, `cwd`, `tools[]`. Capture idempotente du `claudeSessionId` (l'init peut se répéter).
- **`assistant`** = `{ type:'assistant', message: BetaMessage, parent_tool_use_id, session_id, uuid }`. Le contenu est dans **`message.content[]`**, blocs :
  - `{ type:'thinking', thinking, signature }` → `thinking { text }` (le lot 2 décide de l'afficher/masquer).
  - `{ type:'text', text }` → `assistant { text }`.
  - `{ type:'tool_use', id, name, input, caller }` → `tool_use { id, name, input }` (début du cycle de vie outil).
- **`user`** = `{ type:'user', message:{ role, content }, parent_tool_use_id, session_id, tool_use_result }` — c'est ainsi qu'arrivent les **résultats d'outils**. Bloc `{ type:'tool_result', tool_use_id, content }` dans `message.content` → `tool_result { tool_use_id, content }` (fin du cycle). ⚠️ Nos **propres** messages user (ceux qu'on pousse) **ne sont pas ré-émis** dans le stream → l'UI (lot 2) affiche l'input en optimistic.
- **`result`** = `{ type:'result', subtype:'success'|'error', is_error, result, session_id, num_turns, usage, total_cost_usd, stop_reason }` → `result { is_error, text: result, session_id, num_turns, usage, total_cost_usd }`. Fin de tour → `busy=false`.

> Vocabulaire aligné sur emdash (`agent_message_chunk` / `agent_thought_chunk` / `tool_call` → `tool_call_update`) pour faciliter le rendu lot 2, mais transporté dans notre event `stream-event` unique (voir protocole).

## Flux de permission (décision figée : Option B — flux complet)

En `acceptEdits`/`bypassPermissions`/`plan`/`dontAsk`/`auto`, aucun prompt : la session tourne seule. En **`default`**, le SDK appelle `canUseTool(...)` et **attend sa résolution** avant d'exécuter chaque outil. Le lot 1 fournit ce callback et relaie la décision au client via un aller-retour WS (aligné sur le `permission_request` d'emdash).

**Contrat SDK vérifié** :
```
CanUseTool = (toolName: string, input: Record<string, unknown>, options: {
  signal: AbortSignal;               // abort si le tour est interrompu
  suggestions?: PermissionUpdate[];  // règles à persister pour un "always allow"
  title?: string;                    // phrase prête ("Claude wants to read foo.txt")
  displayName?: string;              // libellé court ("Read file")
}) => Promise<PermissionResult>

PermissionResult =
  | { behavior: 'allow'; updatedInput?; updatedPermissions?: PermissionUpdate[] }
  | { behavior: 'deny';  message: string; interrupt?: boolean }
```

**Mécanique côté serveur** (`sdkAgent.ts`) :
1. `options.canUseTool` = fonction qui, à chaque appel, génère un `id` (compteur par session), stocke `{ resolve, reject }` dans une **map de requêtes en attente** (`pendingPermissions: Map<id, {resolve}>`), puis **broadcast** `stream-permission-request { id, toolName, input, title, displayName }` aux clients.
2. Le client répond `stream-permission-response { id, decision }` avec `decision ∈ { 'allow-once', 'allow-always', 'reject' }`.
3. Le serveur résout la Promise en attente en `PermissionResult` :
   - `allow-once` → `{ behavior:'allow' }`
   - `allow-always` → `{ behavior:'allow', updatedPermissions: suggestions }` (plus de prompt pour cet outil dans la session)
   - `reject` → `{ behavior:'deny', message: 'Refusé par l\'utilisateur' }`

**Cas limites (à gérer dans le lot 1)** :
- **`signal` (abort)** : si `interrupt()`/`stop()` survient pendant une attente, l'`AbortSignal` de `canUseTool` se déclenche → rejeter/vider les requêtes en attente (deny silencieux).
- **Déconnexion de tous les clients** pendant une attente : la requête reste en attente (la session survit) ; à la ré-attache, `stream-ready` inclut les **permissions en attente** pour ré-afficher les prompts (`pendingPermissions` sérialisées). Détail d'implémentation, pas d'auto-deny.
- **Timeout** : pas de timeout automatique v1 (un prompt peut rester ouvert indéfiniment) — le tour reste `busy` tant que l'utilisateur n'a pas répondu ou interrompu.
- **Multi-clients** : le premier `stream-permission-response` reçu pour un `id` gagne ; les réponses suivantes pour le même `id` sont ignorées (idempotence).

## Détachement lié au cycle de vie WS
`ws.on('close')` : si `streamSessionId` défini, `detach(streamSessionId, ws)` pour retirer le socket mort de `clients`. La session SDK **survit** (persistance).

### Ré-attachement : pas d'historique
`attached:true` ne fournit que les events futurs — pas de buffer de replay. Le backscroll relève du lot 3 ; le lot 2 ne suppose pas d'historique à l'attache.

## Dépendances
- ✅ `@anthropic-ai/claude-agent-sdk@^0.3.205` ajouté à `packages/agent/package.json` (fait au spike).
- Prérequis runtime : binaire `claude` installé + `claude login` fait (abonnement). Le serveur agent le résout via `findClaude()`.

## Hors périmètre (lots suivants)
- Rendu frontend (`useAgentStream`, `AgentChatView`), remplacement de l'onglet Claude → **lot 2**.
- Persistance de `claudeSessionId` + modèle/effort/mode → **lot 3**.
- Bouton Create PR + PR Prompt + settings → **lot 4**.

## Stratégie de test
1. ✅ **Spike de forme** (fait — `packages/agent/spike-sdk-shape.mjs`) : types `.d.ts` lus + 2 runs réels (`plan` et `acceptEdits`) → noms de champs et cycle de vie outil figés (voir « Résultats du spike » / mapping). `permissionMode` (6 valeurs) et absence de `setEffort` confirmés. Auth abonnement validée sans `ANTHROPIC_API_KEY`.
2. **Tour unique via WS** : `stream-init` + `stream-user-message` (« reply hello ») → asserte `assistant` puis `result`.
3. **Multi-tours** : 2ᵉ message après le 1er `result` → 2ᵉ `result` sur la **même** session (session persistante).
4. **Contrôles** : `stream-set-mode`/`stream-set-model`/`stream-interrupt` prennent effet (mode → `plan` empêche les éditions ; interrupt stoppe un tour).
4b. **Flux de permission** : en `default`, un outil déclenche `stream-permission-request` ; `stream-permission-response` `allow-once` laisse l'outil s'exécuter, `reject` le refuse (`behavior:'deny'`), `allow-always` supprime les prompts suivants du même outil. Interrupt pendant une attente → deny + purge.
5. **Auth abonnement** : sans `ANTHROPIC_API_KEY`, le tour réussit (login claude.ai) ; documenter le comportement si la clé est présente (bascule API).
6. **Résilience détach** : fermeture WS pendant/entre les tours → session survit ; réattache → events futurs reçus.
7. **Mort de session** : fin du generator / `q.close()` → `stream-closed` + cleanup.

## Risques
- ✅ **~~Noms de champs `SDKMessage`/`SDKUserMessage`~~** — résolu au spike (v3).
- ✅ **~~`setEffort` mid-session~~** — tranché : aucun setter dédié. Effort = option de démarrage ; mid-session via `applyFlagSettings` (à valider) ou recréation de session (v1 lot 2).
- **Flux de permission (Option B retenue)** : complexité réelle ajoutée au lot 1 (map de requêtes en attente, abort via `AbortSignal`, ré-affichage à la ré-attache, idempotence multi-clients). Pas de timeout auto v1 → un prompt sans réponse laisse le tour `busy` indéfiniment (l'utilisateur peut toujours `interrupt`).
- **`stream-set-mode → default`** : ne prend effet que parce que `canUseTool` est fourni ; à tester explicitement (un outil en `default` déclenche bien `stream-permission-request`).
- **`applyFlagSettings` pour l'effort** : comportement mid-session non vérifié au spike (les 2 runs n'ont pas changé l'effort en cours de route). À valider si le lot 2 veut changer l'effort sans recréer la session.
- **Auth** : si une clé d'auth Anthropic (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`) traîne dans l'env, le SDK bascule sur l'API/proxy silencieusement → `cleanEnv()` doit exclure les trois (relevé à la review finale du lot 1 ; testé).
- **`options.env` remplace l'environnement** (ne merge pas) → il faut spread `process.env` puis retirer les clés sensibles, sinon le CLI perd `PATH`/`HOME`.
- **Version du SDK / CLI** : SDK `0.3.205` ↔ CLI `2.1.205` au spike. Épingler et vérifier la compat au démarrage (le serveur agent gère déjà des vérifs de version CLI).
