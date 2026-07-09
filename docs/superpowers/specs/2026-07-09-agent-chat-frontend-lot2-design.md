# Lot 2 — Frontend : chat SDK style Messenger + dérivation/persistance

> **Statut** : spec en revue (v1)
> **Date** : 2026-07-09
> **Périmètre** : frontend (`src/`) + ajouts serveur agent (`packages/agent/`) + DB (schema + migration).
> **Dépend de** : lot 1 (backend SDK + protocole WebSocket, déjà livré et branché — voir `2026-07-08-streamed-agent-lot1-backend-design.md`).

## Contexte

Dans `AgentTerminalModal`, l'onglet **Claude** affiche aujourd'hui un terminal xterm brut (TUI Claude Code via tmux). Le lot 1 a livré, côté serveur agent, un **canal WebSocket** pilotant une session `@anthropic-ai/claude-agent-sdk` persistante et diffusant des `stream-event` structurés (`session` / `thinking` / `assistant` / `tool_use` / `tool_result` / `result`), plus un flux de permission complet et des contrôles (model / effort / mode / interrupt / stop). **Aucun frontend ne consomme encore ce protocole.**

Ce lot construit la **vue conversation** (style Messenger) qui remplace l'onglet Claude, avec une barre de contrôle intégrée (model / effort / mode / envoyer / stop) et la gestion inline des permissions.

### Décisions de brainstorming (validées avec l'utilisateur)

1. **Style visuel** : bulles « Messenger » — message user aligné à droite (violet `#7C5CFF`), agent à gauche (paper + bordure). Thinking et cartes d'outils repliables. Permissions inline.
2. **Barre de contrôle** : intégrée dans le cadre du composer (texte au-dessus, pills Model/Effort/Mode + bouton Envoyer/Stop sur la ligne du bas).
3. **Périmètre** : le chat **remplace entièrement** l'xterm de l'onglet Claude. L'onglet **Terminal** (shell brut tmux) et le flow de lancement (project → launch-mode → branch) restent inchangés.
4. **Historique** : le transcript est **persisté en SQLite** — rejouable après fermeture/réouverture du modal, redémarrage du serveur, et pour toute session passée.
5. **Logs d'activité** : **dérivés des `stream-event`** côté serveur agent, ce qui **remplace** le reporting curl injecté dans le system prompt.

### Divergences assumées vs roadmap lot 1

Le lot 1 avait laissé deux hypothèses que ce lot révise explicitement :

- **Historique** : lot 1 disait « ré-attache = pas d'historique, backscroll = lot 3 ». → **Ce lot livre la persistance + le replay** (fusion lot 2 + lot 3).
- **Reporting** : lot 1 disait « le reporting curl reste le mécanisme qui alimente activity logs + auto-rename ». → **Ce lot dérive les logs des events** et supprime l'injection du prompt de reporting. L'auto-rename de branche se fait désormais à partir du **premier message user** du chat.

## Objectifs

- Remplacer le bloc xterm de l'onglet Claude par une vue chat MUI, sans toucher aux autres onglets ni au flow de lancement.
- Consommer le protocole WS du lot 1 via un hook dédié, avec état complet (messages, statut, permissions, contrôles).
- Persister le transcript et le `claude_session_id` pour survivre à la réouverture et permettre le `resume`.
- Dériver les logs d'activité des events pour alimenter l'onglet Activity + le dashboard sans reporting curl.

## Non-objectifs (hors périmètre)

- Rebrancher le PiP / OverlayTerminal sur le chat (**masqué pour le chat** dans ce lot — voir §7). Follow-up.
- Bouton « Create PR » + PR Prompt + settings (**lot 4**).
- Rendu markdown riche avancé (tableaux complexes, mermaid…) : on réutilise `react-markdown` déjà présent, sans extension nouvelle.
- Multi-agents / ACP (Devora reste mono-agent Claude).

---

## Architecture

### Frontend (`src/`)

Cinq unités, chacune avec une frontière claire :

#### `useAgentChat` (`src/hooks/useAgentChat.ts`)
**Rôle** : machine à états du protocole WS lot 1. C'est la seule unité qui parle WebSocket ; les composants sont purement présentationnels.
**Interface** (ce que le hook expose) :
```ts
useAgentChat(params: {
  sessionId: string;
  cwd: string | null;
  systemPrompt?: string;       // composé par l'appelant (agentFile + issue), voir §systemPrompt
  enabled: boolean;            // false tant que step !== 'terminal' ou cwd absent
  readOnly?: boolean;          // session passée non reprise → pas d'envoi
}) => {
  messages: ChatMessage[];     // transcript ordonné (history + live)
  status: 'connecting' | 'idle' | 'busy' | 'error' | 'closed';
  model: string; effort: string; mode: string;   // état courant renvoyé par stream-ready
  pendingPermissions: PendingPermission[];
  send(text: string): void;
  setModel(m: string): void;
  setEffort(e: string): void;
  setMode(m: string): void;
  interrupt(): void;
  resolvePermission(id: string, decision: PermissionDecision): void;
}
```
**Dépendances** : `getAgentWsUrl()` (`src/lib/local-fetch.ts`), types chat.
**Comportement clé** :
- Ouvre le WS, envoie `stream-init { sessionId, cwd, systemPrompt, model?, effort?, mode? }`.
- Reçoit `stream-history` (nouveau message serveur, voir §backend) → initialise `messages`. Puis `stream-ready` → pose model/effort/mode/status. Puis les `stream-event` live sont **réduits** en `messages` (agrégation, voir §réduction).
- Message user : ajout **optimiste** dans `messages` (le SDK ne réémet pas nos messages user — confirmé lot 1) + `stream-user-message`.
- `stream-permission-request` → alimente `pendingPermissions` ; `resolvePermission` → `stream-permission-response`.
- `stream-error` / `stream-closed` → `status`.
- Reconnexion : au `enabled` re-passé à true (réouverture modal), reconnecte et rejoue `stream-history`.

#### `AgentChatTab` (`src/components/agents/AgentChatTab.tsx`)
**Rôle** : compose le hook + le flux scrollable + le composer. Remplace le `<Box ref={setTermNode}>` de l'onglet `claude` dans `AgentTerminalModal`.
**Interface** : `{ sessionId, cwd, systemPrompt, isPastSession, onFirstUserMessage?(text) }`.
**Dépendances** : `useAgentChat`, les sous-composants ci-dessous.
**Responsabilités** : autoscroll (sauf si l'utilisateur a scrollé vers le haut), indicateur « busy », remontée du premier message user à `AgentTerminalModal` (pour l'auto-rename côté client si conservé — voir §auto-rename).

#### Sous-composants présentationnels (`src/components/agents/chat/`)
- `ChatBubble.tsx` — bulle user (droite, violet) / assistant (gauche, paper). Le texte assistant passe par `react-markdown` (déjà utilisé ailleurs).
- `ChatToolCard.tsx` — carte `tool_use` + `tool_result` fusionnés, repliée par défaut ; en-tête `icône + nom outil + cible + ✓/✗`. Icône/cible dérivées de `name`+`input` (Read/Edit/Write/Bash/…).
- `ChatThinking.tsx` — bloc thinking repliable, style atténué.
- `ChatPermissionCard.tsx` — carte inline orange : `title`/`displayName`, aperçu de `input`, 3 boutons **Autoriser** (`allow-once`) / **Toujours pour {toolName}** (`allow-always`) / **Refuser** (`reject`).
- `ChatComposer.tsx` — cadre unique : `TextField` multiligne (Entrée = envoyer, Shift+Entrée = nouvelle ligne) + ligne de contrôle : pills `Model` / `Effort` / `Mode` (chacun un `Menu` MUI) + bouton **Envoyer** (idle) qui devient **Stop** (busy → `interrupt`). Désactivé si `readOnly`.

**Aucun texte en dur** : toutes les chaînes via `useTranslations` (nouvelle clé `agentChat` dans les 5 locales).

#### Types (`src/types/index.ts`)
```ts
type ChatRole = 'user' | 'assistant';
interface ChatToolCall { id: string; name: string; input: unknown; result?: unknown; status: 'running' | 'done' | 'error' }
interface ChatMessage {
  id: string;
  role: ChatRole;
  segments: Array<
    | { kind: 'text'; text: string }
    | { kind: 'thinking'; text: string }
    | { kind: 'tool'; call: ChatToolCall }
  >;
}
type PermissionDecision = 'allow-once' | 'allow-always' | 'reject';
interface PendingPermission { id: string; toolName: string; input: Record<string, unknown>; title?: string; displayName?: string }
```

#### Réduction `stream-event` → `ChatMessage[]`
Fonction pure et testée `reduceStreamEvent(messages, event): ChatMessage[]`, dans `useAgentChat` (ou fichier voisin `chatReducer.ts`) :
- `assistant` texte → append segment `text` au message assistant courant (créé si absent).
- `thinking` → append segment `thinking`.
- `tool_use` → append segment `tool` avec `status:'running'`, indexé par `id`.
- `tool_result` → retrouve la `ChatToolCall` par `tool_use_id`, pose `result` + `status:'done'|'error'`.
- `result` → clôt le tour (repasse `busy=false`), pas de bulle dédiée.
- `session` → met à jour model/mode (pas de bulle).

### Backend (`packages/agent/`)

Ajouts au manager SDK existant (`src/sdk/sdkAgent.ts`) et au handler WS (`src/terminal.ts`), **sans casser** le protocole lot 1.

#### Persistance du transcript
- Nouvelle unité `src/sdk/transcriptStore.ts` : `appendEvent(sessionId, seq, event)` et `loadTranscript(sessionId): StreamEvent[]`, via `getDb()` (raw SQL, better-sqlite3). Dégrade proprement si `getDb()` renvoie `null`.
- Dans `runLoop`, après chaque `broadcast(stream-event)` : `transcriptStore.appendEvent(...)` (numéro de séquence monotone par session).
- Dans `startOrAttach` : avant/à l'attache, charger `loadTranscript(sessionId)` et envoyer au client **`stream-history { events: StreamEvent[] }`** (nouveau message serveur), suivi du `stream-ready` habituel. Pour une session vivante ré-attachée, l'historique = transcript persisté (source unique de vérité).

#### Resume après redémarrage / session passée
- Nouvelle colonne `claude_session_id` sur `agent_sessions`.
- Le manager persiste `claudeSessionId` (event `session`) sur `agent_sessions` (idempotent).
- `startOrAttach` : si la session n'est **pas** vivante en mémoire mais qu'un transcript + `claude_session_id` existent, démarrer le SDK avec `resume: claude_session_id` (la conversation Claude reprend). Le `stream-history` est renvoyé d'abord (transcript passé), puis le live reprend.

#### Dérivation des logs d'activité
- Nouvelle unité `src/sdk/activityDeriver.ts` : `deriveLogs(event): { log_type, content }[]` (fonction pure, testée) :
  - `tool_use` `Edit`/`Write`/`MultiEdit` → `file_change` (chemin extrait de `input`).
  - `tool_use` `Bash` dont la commande matche `git commit` → `commit` (message extrait).
  - `tool_use` `Bash` (autres) / erreurs de `tool_result` → `info`/`error`.
  - `result` final → `summary` (texte du result).
- Dans `runLoop`, écrire les logs dérivés dans `agent_activity_logs` via `getDb()` (même table que le reporting historique → l'onglet Activity et le dashboard fonctionnent sans changement côté lecture).
- **Titre de session** : dérivé du **premier message user** (troncature courte 3-5 mots ou texte complet tronqué), écrit en log `title` **et** utilisé pour l'auto-rename de branche.

#### Auto-rename de branche
- À la réception du **premier `stream-user-message`** d'une session dont la branche est auto-générée (`wip-…`), le manager appelle la logique de rename existante. Deux options d'implémentation (tranchées au plan) : soit le serveur agent appelle l'API Next `rename-from-prompt`, soit `AgentChatTab` remonte le premier message et **le client** appelle `rename-from-prompt` (comme le faisait `captureFirstPrompt`). **Recommandation** : côté client (réutilise l'endpoint existant, pas de nouvelle dépendance réseau agent→Next).

### DB (`src/db/`)
- `schema.ts` : nouvelle table `agent_chat_messages` `{ id, agent_session_id, seq (integer), role, event_type, content (json), created_at }` + colonne `claude_session_id` sur `agent_sessions`.
- Migration générée via `drizzle-kit generate` (jouée à l'import par `src/db/index.ts`). Le serveur agent lit/écrit ces tables en **raw SQL** (il ne joue pas les migrations — propriété app Next, cf. CLAUDE.md).

---

## Composition du `systemPrompt` (côté client)

`AgentTerminalModal` compose le prompt envoyé dans `stream-init`, **sans reporting curl** :
```
{ type: 'preset', preset: 'claude_code', append: <agentFile.content> + <bloc issue optionnel> }
```
Le bloc issue reste celui construit via `fetchIssueContext` (inchangé). Le lot 1 passe ce `systemPrompt` tel quel au SDK.

## Flux de données

```
AgentTerminalModal (step 'terminal', onglet 'claude')
  → AgentChatTab
    → useAgentChat  ── WS ──►  agent (terminal.ts → sdkAgent.ts)
       envoie stream-init / stream-user-message / stream-set-* / stream-permission-response
       reçoit stream-history → stream-ready → stream-event* / stream-permission-request / stream-closed|error
                                              │
                                              ├─ transcriptStore.appendEvent → agent_chat_messages
                                              └─ activityDeriver.deriveLogs → agent_activity_logs → onglet Activity + dashboard
```

## Gestion d'erreurs & cas limites

- **cwd absent / step ≠ terminal** : `enabled=false` → pas de connexion WS.
- **`stream-error fatal`** : bannière d'erreur + composer désactivé ; bouton « Reconnecter ».
- **`stream-closed`** : statut « fermé » ; pour une session vivante fermée manuellement (kill), le modal se ferme déjà via le flux existant.
- **Envoi pendant `busy`** : le composer est désactivé (le SDK met en file, mais on garde l'UX simple : un tour à la fois).
- **Permissions en attente à la ré-attache** : `stream-ready.pendingPermissions` (fourni par lot 1) réhydrate les cartes.
- **Changement d'effort mid-session** : envoyé via `stream-set-effort` (best-effort côté SDK — `applyFlagSettings`, non garanti mid-session d'après lot 1). L'UI reflète immédiatement la sélection ; la valeur s'applique de façon fiable au (re)démarrage de session. Documenté dans l'UI par un tooltip si nécessaire.
- **Session passée (`isPastSession`)** : `readOnly=true`, transcript rejoué, composer masqué, bouton **« Reprendre »** qui relance en mode éditable (déclenche un `stream-init` avec resume).
- **`getDb()` null** (DB pas encore créée) : persistance/dérivation dégradent en no-op ; le chat live fonctionne quand même.

## Code retiré

Dans `AgentTerminalModal` et le serveur, pour le path Claude uniquement (le shell Terminal garde tmux) :
- `buildReportingPrompt` (plus de reporting curl injecté).
- `captureFirstPrompt` + `promptBufferRef`/`promptSentRef` (auto-rename via keystrokes) → remplacé par la remontée du premier message chat.
- Le bloc d'init xterm de l'onglet `claude` (Terminal/FitAddon/Webgl/WS `init`) et ses refs dédiées.
- `launchClaudeInSession` n'est plus appelé pour le path Claude (à conserver seulement si encore utile ailleurs — à vérifier au plan).

## Stratégie de test

1. **`reduceStreamEvent`** (unitaire, pur) : séquence `assistant`+`thinking`+`tool_use`+`tool_result`+`result` → `ChatMessage[]` attendu ; corrélation `tool_use_id`.
2. **`activityDeriver.deriveLogs`** (unitaire, pur) : Edit→file_change, `git commit`→commit, result→summary.
3. **`transcriptStore`** (intégration SQLite en mémoire/temp) : append puis load = même ordre (seq).
4. **`useAgentChat`** (test hook, WS mocké) : stream-history initialise ; message user optimiste ; permission request→response ; busy/idle.
5. **Intégration manuelle** (checklist verify) : lancer un agent, envoyer un message, voir bulles + tool cards + un cycle de permission en mode `default` ; fermer/rouvrir le modal → transcript rejoué ; changer model/mode à chaud ; ouvrir une session passée en lecture seule puis « Reprendre ».
6. **Non-régression** : onglets Activity/Fichiers/Terminal/Issue et le flow de lancement inchangés ; dashboard/summaries toujours alimentés (via logs dérivés).

## Risques

- **Réduction des events** : le SDK émet le texte assistant par blocs ; l'agrégation en segments doit rester ordonnée et idempotente au replay. Mitigation : réducteur pur testé, replay = mêmes events que le live.
- **Effort mid-session** non garanti (hérité lot 1). Mitigation : UI honnête (applique au restart), pas de promesse fausse.
- **Double source de logs** pendant la transition : s'assurer que le reporting curl est bien retiré pour ne pas doublonner avec la dérivation. Mitigation : suppression explicite (§code retiré) + test non-régression.
- **Cohérence transcript ↔ agent_sessions** : un transcript sans `claude_session_id` (résultat non atteint) ne peut pas `resume` → fallback : nouvelle session SDK, transcript passé affiché en lecture seule au-dessus. Documenté.
- **Volume** : transcripts longs (gros diffs dans `tool_result`). Mitigation : tronquer le `content` persisté des `tool_result` (limite raisonnable, ex. 50 Ko) — le rendu complet vit dans le live.

## Dépendances

- Lot 1 livré (SDK + protocole WS). Aucune nouvelle dépendance npm côté frontend (MUI, react-markdown, react-query déjà présents).
- Binaire `claude` + `claude login` (abonnement) — prérequis runtime hérité du lot 1.
