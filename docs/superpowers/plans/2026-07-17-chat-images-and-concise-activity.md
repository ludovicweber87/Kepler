# Chat Images + Concise Activity & Synthesized Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Let the user drop/paste images into the chat composer (chip with name + delete X, sent to the Claude Agent SDK, rendered as a thumbnail, persisted by file path); (B) make Activity logs short/clear (LLM per-turn summary) and make "Publish report" synthesize the Activity via LLM.

**Architecture:** Images travel client→server as base64 over the existing chat WebSocket; the agent server writes them under `data/attachments/<sessionId>/`, serves them from a new `/attachments/` route, feeds base64 image content-blocks to the SDK, and stores only the URL in the transcript. Activity summaries are produced by a non-blocking `claude --print` call per turn; the publish button calls a new synthesize route over the stored Activity logs.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, MUI 7, xterm-adjacent WS chat, @anthropic-ai/claude-agent-sdk, better-sqlite3, Vitest (client) + node:test (agent server).

## Global Constraints

- **Two test runners.** `src/**` → **Vitest** (`import { describe, it, expect } from 'vitest'`; run `npx vitest run <path>`; imports use `@/` or relative without `.js`). `packages/agent/src/**` → **node:test** (`import { test } from 'node:test'; import assert from 'node:assert/strict';`; **imports MUST use the `.js` extension**; run `npm test -w packages/agent`). Match the runner of the directory you're testing.
- Tests: pure logic only. UI/wiring verified by `npm run lint` + `npx tsc --noEmit` + `npm run build` + manual.
- Never hardcode UI text — use `next-intl`; add keys to all 5 locales `src/config/translate/{en,fr,es,de,pt}.json`.
- TAB indentation everywhere. Path alias `@/*` → `./src/*`. `"use client"` on interactive components.
- The per-turn summarizer MUST be non-blocking: use async `execFile` (never `execSync`), and never gate `s.busy`/idle on it.
- LLM calls use `findClaude()` (from `packages/agent/src/helpers.ts`) + strip `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` from env + model `haiku`.
- Image caps: media types `image/png|jpeg|gif|webp` only, ≤ 5 MB each; multiple images allowed. No disk cleanup.
- Do not commit/push to remote; commit locally per task only.
- tsc must remain 0 errors; eslint 0 problems on touched files; `npm run build` must succeed.

---

### Task 1: Server — image content blocks + attachment storage (pure + module)

**Files:**
- Modify: `packages/agent/src/sdk/promptQueue.ts`
- Create: `packages/agent/src/sdk/attachments.ts`
- Test: `packages/agent/src/sdk/promptQueue.test.ts` (create), `packages/agent/src/sdk/attachments.test.ts` (create)

**Interfaces:**
- Produces:
  - `export type ChatImageInput = { name: string; mediaType: string; data: string }` (in `promptQueue.ts`)
  - `buildUserContent(text: string, images?: ChatImageInput[]): unknown` — returns the SDK message `content` (string when no images, else content-block array)
  - `PromptQueue.push(text: string, images?: ChatImageInput[]): void`
  - `attachments.ts`: `extForMediaType(m: string): string | null`, `sanitizeSegment(s: string): string`, `attachmentRelUrl(sessionId: string, file: string): string`, `attachmentsDir(): string`, `saveAttachment(sessionId: string, mediaType: string, base64: string): { url: string } | null`, `serveAttachment(req, res, path): void`

- [ ] **Step 1: Write failing tests — content builder (node:test)**

Create `packages/agent/src/sdk/promptQueue.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserContent } from './promptQueue.js';

test('buildUserContent: no images → plain string', () => {
	assert.equal(buildUserContent('hello'), 'hello');
	assert.equal(buildUserContent('hi', []), 'hi');
});

test('buildUserContent: with images → content-block array', () => {
	const content = buildUserContent('look', [
		{ name: 'a.png', mediaType: 'image/png', data: 'BASE64DATA' },
	]) as Array<Record<string, unknown>>;
	assert.ok(Array.isArray(content));
	assert.deepEqual(content[0], { type: 'text', text: 'look' });
	assert.deepEqual(content[1], {
		type: 'image',
		source: { type: 'base64', media_type: 'image/png', data: 'BASE64DATA' },
	});
});

test('buildUserContent: empty text with image → only image block', () => {
	const content = buildUserContent('', [
		{ name: 'a.png', mediaType: 'image/png', data: 'X' },
	]) as Array<Record<string, unknown>>;
	assert.equal(content.length, 1);
	assert.equal((content[0] as Record<string, unknown>).type, 'image');
});
```

Create `packages/agent/src/sdk/attachments.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extForMediaType, sanitizeSegment, attachmentRelUrl } from './attachments.js';

test('extForMediaType maps supported types', () => {
	assert.equal(extForMediaType('image/png'), 'png');
	assert.equal(extForMediaType('image/jpeg'), 'jpg');
	assert.equal(extForMediaType('image/gif'), 'gif');
	assert.equal(extForMediaType('image/webp'), 'webp');
	assert.equal(extForMediaType('image/bmp'), null);
	assert.equal(extForMediaType('text/plain'), null);
});

test('sanitizeSegment strips path traversal and unsafe chars', () => {
	assert.equal(sanitizeSegment('../../etc'), '______etc');
	assert.equal(sanitizeSegment('ok_name-1'), 'ok_name-1');
});

test('attachmentRelUrl composes a safe relative url', () => {
	assert.equal(attachmentRelUrl('sess/1', 'abc.png'), '/attachments/sess_1/abc.png');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/agent 2>&1 | grep -A2 attachments` (and promptQueue)
Expected: FAIL — modules/exports not found.

- [ ] **Step 3: Implement `attachments.ts`**

Create `packages/agent/src/sdk/attachments.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
};
const EXT_TO_MEDIA: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

export function extForMediaType(mediaType: string): string | null {
	return EXT[mediaType] ?? null;
}

export function sanitizeSegment(s: string): string {
	return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function attachmentRelUrl(sessionId: string, file: string): string {
	return `/attachments/${sanitizeSegment(sessionId)}/${file}`;
}

export function attachmentsDir(): string {
	const dbPath =
		process.env.DEVORA_DB_PATH ??
		fileURLToPath(new URL('../../../../data/devora.db', import.meta.url));
	return join(dirname(dbPath), 'attachments');
}

export function saveAttachment(
	sessionId: string,
	mediaType: string,
	base64: string,
): { url: string } | null {
	const ext = extForMediaType(mediaType);
	if (!ext) return null;
	const dir = join(attachmentsDir(), sanitizeSegment(sessionId));
	mkdirSync(dir, { recursive: true });
	const file = `${randomUUID()}.${ext}`;
	writeFileSync(join(dir, file), Buffer.from(base64, 'base64'));
	return { url: attachmentRelUrl(sessionId, file) };
}

// GET /attachments/<session>/<file>
export function serveAttachment(_req: IncomingMessage, res: ServerResponse, path: string): void {
	const parts = path.split('/').filter(Boolean); // ['attachments', session, file]
	if (parts.length !== 3) {
		res.writeHead(404);
		res.end();
		return;
	}
	const session = sanitizeSegment(decodeURIComponent(parts[1]));
	const file = sanitizeSegment(decodeURIComponent(parts[2]));
	const full = normalize(join(attachmentsDir(), session, file));
	if (!full.startsWith(attachmentsDir()) || !existsSync(full)) {
		res.writeHead(404);
		res.end();
		return;
	}
	const ext = file.split('.').pop() ?? '';
	res.writeHead(200, { 'Content-Type': EXT_TO_MEDIA[ext] ?? 'application/octet-stream' });
	res.end(readFileSync(full));
}
```

> Note: verify the `../../../../data/devora.db` relative depth resolves to the repo `data/` dir from `packages/agent/src/sdk/` at runtime; `DEVORA_DB_PATH` is set in dev so this fallback is only for safety. Mirror the resolution used in `packages/agent/src/db.ts` (adjust `..` count to the `sdk/` subdir).

- [ ] **Step 4: Implement content builder in `promptQueue.ts`**

Replace the file with:

```ts
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

export type ChatImageInput = { name: string; mediaType: string; data: string };

export interface PromptQueue {
	iterable: AsyncIterable<SDKUserMessage>;
	push(text: string, images?: ChatImageInput[]): void;
	close(): void;
}

export function buildUserContent(text: string, images?: ChatImageInput[]): unknown {
	if (!images || images.length === 0) return text;
	const blocks: Array<Record<string, unknown>> = [];
	if (text) blocks.push({ type: 'text', text });
	for (const img of images) {
		blocks.push({
			type: 'image',
			source: { type: 'base64', media_type: img.mediaType, data: img.data },
		});
	}
	return blocks;
}

export function makePromptQueue(): PromptQueue {
	const queue: SDKUserMessage[] = [];
	let resolve: (() => void) | null = null;
	let done = false;

	async function* gen(): AsyncGenerator<SDKUserMessage> {
		while (!done || queue.length > 0) {
			if (queue.length === 0) {
				await new Promise<void>((r) => (resolve = r));
				continue;
			}
			yield queue.shift() as SDKUserMessage;
		}
	}

	return {
		iterable: gen(),
		push(text: string, images?: ChatImageInput[]) {
			queue.push({
				type: 'user',
				message: { role: 'user', content: buildUserContent(text, images) },
				parent_tool_use_id: null,
			} as SDKUserMessage);
			resolve?.();
			resolve = null;
		},
		close() {
			done = true;
			resolve?.();
			resolve = null;
		},
	};
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w packages/agent`
Expected: new promptQueue + attachments tests PASS; existing agent tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/sdk/promptQueue.ts packages/agent/src/sdk/attachments.ts packages/agent/src/sdk/promptQueue.test.ts packages/agent/src/sdk/attachments.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): blocs image SDK + stockage des pièces jointes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server — thread images through WS → SDK → transcript + serve route

**Files:**
- Modify: `packages/agent/src/terminal.ts`
- Modify: `packages/agent/src/sdk/sdkAgent.ts`
- Modify: `packages/agent/src/sdk/types.ts`
- Modify: `packages/agent/src/index.ts`

**Interfaces:**
- Consumes: `ChatImageInput`, `buildUserContent` via queue (Task 1); `saveAttachment`, `serveAttachment` (Task 1).
- Produces: `sdkAgent.sendUserMessage(sessionId: string, text: string, images?: ChatImageInput[])`; `StreamEvent` `user` data becomes `{ text: string; images?: { name: string; url: string }[] }`.

- [ ] **Step 1: Extend `StreamEvent` user type in `packages/agent/src/sdk/types.ts`**

Change the `user` variant:

```ts
	| { event: 'user'; data: { text: string; images?: { name: string; url: string }[] } }
```

- [ ] **Step 2: Extend `StreamUserMessage` + handler in `packages/agent/src/terminal.ts`**

Add `images` to the interface (after `text: string;`):

```ts
	images?: { name: string; mediaType: string; data: string }[];
```

Update the handler (currently `sdkAgent.sendUserMessage(msg.sessionId, msg.text);`):

```ts
			if (msg.type === 'stream-user-message') {
				sdkAgent.sendUserMessage(msg.sessionId, msg.text, msg.images);
				return;
			}
```

- [ ] **Step 3: Update `sendUserMessage` in `packages/agent/src/sdk/sdkAgent.ts`**

Add the import near the top imports:

```ts
import { saveAttachment } from './attachments.js';
import type { ChatImageInput } from './promptQueue.js';
```

Replace `sendUserMessage`:

```ts
	sendUserMessage(sessionId: string, text: string, images?: ChatImageInput[]) {
		const s = sessions.get(sessionId);
		if (!s) return;
		s.busy = true;
		// Persist attachments to disk; store only {name,url} in the transcript (no base64 in DB).
		const saved: { name: string; url: string }[] = [];
		for (const img of images ?? []) {
			const res = saveAttachment(sessionId, img.mediaType, img.data);
			if (res) saved.push({ name: img.name, url: res.url });
		}
		const seq = s.seq++;
		const ev = {
			event: 'user',
			data: { text, ...(saved.length ? { images: saved } : {}) },
		} as const;
		transcript.appendEvent(sessionId, seq, 'user', ev);
		broadcast(s, { type: 'stream-event', seq, ...ev });
		s.queue.push(text, images);
	},
```

(`s.queue` is the `PromptQueue` — `push` now accepts images and builds the SDK content blocks.)

- [ ] **Step 4: Add the `/attachments/` serve route in `packages/agent/src/index.ts`**

Add the import at the top:

```ts
import { serveAttachment } from './sdk/attachments.js';
```

Add this block just before the final `sendJson(res, { error: 'Not found' }, 404);`:

```ts
		if (path.startsWith('/attachments/') && req.method === 'GET') {
			serveAttachment(req, res, path);
			return;
		}
```

- [ ] **Step 5: Verify build + existing tests**

Run: `npm run build -w packages/agent && npm test -w packages/agent`
Expected: agent builds; existing tests pass (note: `sdkAgent.test.ts` may reference `sendUserMessage` — if its 2-arg calls still typecheck since `images` is optional, no change needed; if a test breaks, it is a real signature issue — report it).

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/terminal.ts packages/agent/src/sdk/sdkAgent.ts packages/agent/src/sdk/types.ts packages/agent/src/index.ts
git commit -m "$(cat <<'EOF'
feat(agent): transmet les images au SDK, persiste par chemin, sert /attachments

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Client — plumb images through hook, reducer, types, bubble

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/chatReducer.ts`
- Modify: `src/hooks/useAgentChat.ts`
- Modify: `src/components/agents/AgentChatTab.tsx`
- Modify: `src/lib/local-fetch.ts`
- Modify: `src/components/agents/chat/ChatBubble.tsx`
- Test: `src/lib/chatReducer.test.ts` (create or extend)

**Interfaces:**
- Produces: `ChatImageInput` (client type) in `src/types/index.ts`; `ChatSegment` gains `{ kind: 'image'; url: string; name: string }`; `userMessage(text, images?)`; `useAgentChat.send(text, images?)`; `getAgentHttpUrl(): string`.

- [ ] **Step 1: Types — `src/types/index.ts`**

Add to the ChatSegment union:

```ts
export type ChatSegment =
	| { kind: 'text'; text: string }
	| { kind: 'thinking'; text: string }
	| { kind: 'image'; url: string; name: string }
	| { kind: 'tool'; call: ChatToolCall };
```

Add near the chat types:

```ts
export interface ChatImageInput {
	name: string;
	mediaType: string;
	data: string;
}
```

- [ ] **Step 2: `getAgentHttpUrl` in `src/lib/local-fetch.ts`**

Add an exported helper returning the agent HTTP base (the module already computes `AGENT_BASE_URL`):

```ts
export function getAgentHttpUrl(): string {
	return AGENT_BASE_URL;
}
```

- [ ] **Step 3: Failing test — reducer (Vitest)**

Extend/create `src/lib/chatReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { userMessage } from './chatReducer';

describe('userMessage', () => {
	it('text-only → single text segment', () => {
		const m = userMessage('hi');
		expect(m.role).toBe('user');
		expect(m.segments).toEqual([{ kind: 'text', text: 'hi' }]);
	});

	it('with images → text + image segments', () => {
		const m = userMessage('look', [{ name: 'a.png', url: '/attachments/s/a.png' }]);
		expect(m.segments[0]).toEqual({ kind: 'text', text: 'look' });
		expect(m.segments[1]).toEqual({ kind: 'image', url: '/attachments/s/a.png', name: 'a.png' });
	});

	it('empty text with image → only image segment', () => {
		const m = userMessage('', [{ name: 'a.png', url: '/x/a.png' }]);
		expect(m.segments).toEqual([{ kind: 'image', url: '/x/a.png', name: 'a.png' }]);
	});
});
```

Run: `npx vitest run src/lib/chatReducer.test.ts` → FAIL (userMessage signature).

- [ ] **Step 4: Update `userMessage` + user branch in `src/lib/chatReducer.ts`**

Replace `userMessage` and the `event === 'user'` line:

```ts
if (event === 'user')
	return [
		...messages,
		userMessage(
			String(data.text ?? ''),
			(data.images as { name: string; url: string }[] | undefined) ?? undefined,
		),
	];
```

```ts
export function userMessage(text: string, images?: { name: string; url: string }[]): ChatMessage {
	const segments: ChatSegment[] = [];
	if (text) segments.push({ kind: 'text', text });
	for (const img of images ?? []) segments.push({ kind: 'image', url: img.url, name: img.name });
	if (segments.length === 0) segments.push({ kind: 'text', text: '' });
	return { id: nextId(), role: 'user', segments };
}
```

Run: `npx vitest run src/lib/chatReducer.test.ts` → PASS.

- [ ] **Step 5: `useAgentChat.ts` — carry images**

Change `QueuedMessage`:

```ts
export interface QueuedMessage {
	id: string;
	text: string;
	images?: ChatImageInput[];
}
```

Add `ChatImageInput` to the type import from `@/types`.

Update `dispatchUserMessage`, `send`, and the flush effect:

```ts
	const dispatchUserMessage = useCallback(
		(text: string, images?: ChatImageInput[]) => {
			setStatus('busy');
			sendCtl({ type: 'stream-user-message', text, images });
		},
		[sendCtl],
	);

	const send = useCallback(
		(text: string, images?: ChatImageInput[]) => {
			const t = text.trim();
			if (!t && (!images || images.length === 0)) return;
			if (statusRef.current === 'idle' && queuedRef.current.length === 0)
				dispatchUserMessage(t, images);
			else
				setQueued((prev) => [...prev, { id: `q${queuedId.current++}`, text: t, images }]);
		},
		[dispatchUserMessage],
	);
```

Flush effect: `dispatchUserMessage(next.text, next.images);`

- [ ] **Step 6: `AgentChatTab.tsx` — handleSend**

```ts
	const handleSend = (text: string, images?: ChatImageInput[]) => {
		if (!firstSent.current) {
			firstSent.current = true;
			onFirstUserMessage?.(text);
		}
		chat.send(text, images);
	};
```

Add `ChatImageInput` to the `@/types` import in this file. (`sendRef.current = chat.send` needs no change.)

- [ ] **Step 7: `ChatBubble.tsx` — render image segment**

Add import:

```ts
import { getAgentHttpUrl } from '@/lib/local-fetch';
```

In the segment map, before the text return, add:

```ts
					if (seg.kind === 'image') {
						const src = getAgentHttpUrl() + seg.url;
						return (
							<Box
								component="img"
								key={i}
								src={src}
								alt={seg.name}
								onClick={() => window.open(src, '_blank')}
								sx={{
									display: 'block',
									maxWidth: 180,
									maxHeight: 180,
									borderRadius: 1,
									mt: 0.5,
									cursor: 'pointer',
								}}
							/>
						);
					}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run src/lib/chatReducer.test.ts && npx tsc --noEmit && npx eslint src/hooks/useAgentChat.ts src/lib/chatReducer.ts src/components/agents/AgentChatTab.tsx src/components/agents/chat/ChatBubble.tsx src/lib/local-fetch.ts`
Expected: tests pass, tsc 0, eslint 0.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/lib/chatReducer.ts src/lib/chatReducer.test.ts src/hooks/useAgentChat.ts src/components/agents/AgentChatTab.tsx src/components/agents/chat/ChatBubble.tsx src/lib/local-fetch.ts
git commit -m "$(cat <<'EOF'
feat(chat): plomberie images côté client (hook, reducer, rendu miniature)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Client — ChatComposer drag & drop / paste + chips

**Files:**
- Modify: `src/components/agents/chat/ChatComposer.tsx`
- Create: `src/lib/imageAttach.ts` (pure validation + file→base64)
- Test: `src/lib/imageAttach.test.ts` (create)
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (agentChat keys)

**Interfaces:**
- Consumes: `ChatImageInput` (Task 3).
- Produces: `imageAttach.ts`: `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`, `validateImageFile(file: { type: string; size: number }): 'type' | 'size' | null`, `stripDataUrlPrefix(dataUrl: string): { mediaType: string; data: string }`. `ChatComposer` `onSend` becomes `(text: string, images?: ChatImageInput[]) => void`.

- [ ] **Step 1: Failing test — validation (Vitest)**

Create `src/lib/imageAttach.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateImageFile, stripDataUrlPrefix, MAX_IMAGE_BYTES } from './imageAttach';

describe('validateImageFile', () => {
	it('accepts a small png', () => {
		expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull();
	});
	it('rejects an unsupported type', () => {
		expect(validateImageFile({ type: 'image/bmp', size: 1000 })).toBe('type');
		expect(validateImageFile({ type: 'application/pdf', size: 10 })).toBe('type');
	});
	it('rejects an oversized image', () => {
		expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('size');
	});
});

describe('stripDataUrlPrefix', () => {
	it('splits media type and base64 payload', () => {
		expect(stripDataUrlPrefix('data:image/png;base64,AAAB')).toEqual({
			mediaType: 'image/png',
			data: 'AAAB',
		});
	});
});
```

Run: `npx vitest run src/lib/imageAttach.test.ts` → FAIL.

- [ ] **Step 2: Implement `src/lib/imageAttach.ts`**

```ts
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: { type: string; size: number }): 'type' | 'size' | null {
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'type';
	if (file.size > MAX_IMAGE_BYTES) return 'size';
	return null;
}

export function stripDataUrlPrefix(dataUrl: string): { mediaType: string; data: string } {
	const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
	if (!m) return { mediaType: 'application/octet-stream', data: '' };
	return { mediaType: m[1], data: m[2] };
}

export function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}
```

Run: `npx vitest run src/lib/imageAttach.test.ts` → PASS.

- [ ] **Step 3: i18n keys (5 locales)**

In each `src/config/translate/*.json`, add to the `agentChat` namespace:
- en: `"attachTypeError": "Unsupported image type", "attachSizeError": "Image too large (max 5 MB)", "removeImage": "Remove image"`
- fr: `"attachTypeError": "Type d'image non supporté", "attachSizeError": "Image trop lourde (max 5 Mo)", "removeImage": "Supprimer l'image"`
- es: `"attachTypeError": "Tipo de imagen no soportado", "attachSizeError": "Imagen demasiado grande (máx 5 MB)", "removeImage": "Eliminar imagen"`
- de: `"attachTypeError": "Bildtyp nicht unterstützt", "attachSizeError": "Bild zu groß (max. 5 MB)", "removeImage": "Bild entfernen"`
- pt: `"attachTypeError": "Tipo de imagem não suportado", "attachSizeError": "Imagem demasiado grande (máx 5 MB)", "removeImage": "Remover imagem"`

Validate JSON: `node -e "['en','fr','es','de','pt'].forEach(l=>{const j=require('./src/config/translate/'+l+'.json'); if(!j.agentChat.removeImage) throw new Error('missing '+l)}); console.log('ok')"`

- [ ] **Step 4: ChatComposer — attachments, handlers, chips**

Edit `src/components/agents/chat/ChatComposer.tsx`:

4a. Imports:

```ts
import { useState, useRef, type KeyboardEvent, type ClipboardEvent, type DragEvent } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import { useSnackbar } from '@/hooks/useSnackbar';
import { validateImageFile, readFileAsDataUrl, stripDataUrlPrefix } from '@/lib/imageAttach';
import type { ChatImageInput } from '@/types';
```

4b. Change `onSend` in `Props`:

```ts
	onSend: (text: string, images?: ChatImageInput[]) => void;
```

4c. Add attachment type + state (inside the component, near `const [text, setText] = useState('')`):

```ts
	const { showSnackbar } = useSnackbar();
	type Attachment = { id: string; name: string; mediaType: string; data: string };
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const attachId = useRef(0);
	const [dragOver, setDragOver] = useState(false);

	const addFiles = async (files: File[]) => {
		for (const file of files) {
			const err = validateImageFile(file);
			if (err) {
				showSnackbar(t(err === 'type' ? 'attachTypeError' : 'attachSizeError'), 'error');
				continue;
			}
			const dataUrl = await readFileAsDataUrl(file);
			const { mediaType, data } = stripDataUrlPrefix(dataUrl);
			setAttachments((prev) => [
				...prev,
				{ id: `a${attachId.current++}`, name: file.name || 'image', mediaType, data },
			]);
		}
	};

	const onPaste = (e: ClipboardEvent) => {
		const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
		if (files.length) {
			e.preventDefault();
			void addFiles(files);
		}
	};
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
		if (files.length) void addFiles(files);
	};
	const removeAttachment = (id: string) =>
		setAttachments((prev) => prev.filter((a) => a.id !== id));
```

4d. Update `submit`:

```ts
	const submit = () => {
		if (!text.trim() && attachments.length === 0) return;
		onSend(
			text,
			attachments.length
				? attachments.map((a) => ({ name: a.name, mediaType: a.mediaType, data: a.data }))
				: undefined,
		);
		setText('');
		setAttachments([]);
	};
```

4e. Wire paste/drop onto the outer bordered `Box` (the one with the dashed/solid border, ~line 138): add `onPaste={onPaste}`, `onDrop={onDrop}`, `onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}`, `onDragLeave={() => setDragOver(false)}`, and when `dragOver` set `borderColor: 'primary.main'`.

4f. Render chips directly above the `InputBase`:

```tsx
					{attachments.length > 0 && (
						<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
							{attachments.map((a) => (
								<Box
									key={a.id}
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 0.5,
										pl: 0.75,
										pr: 0.25,
										py: 0.25,
										borderRadius: 999,
										bgcolor: (th) => alpha(th.palette.primary.main, 0.12),
										maxWidth: 200,
									}}
								>
									<ImageRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
									<Typography
										variant="caption"
										noWrap
										sx={{ fontSize: '0.7rem', maxWidth: 130 }}
									>
										{a.name}
									</Typography>
									<IconButton
										size="small"
										aria-label={t('removeImage')}
										onClick={() => removeAttachment(a.id)}
										sx={{ p: 0.25 }}
									>
										<CloseRoundedIcon sx={{ fontSize: 13 }} />
									</IconButton>
								</Box>
							))}
						</Box>
					)}
```

4g. Enable the send button when there is text OR an attachment: change `disabled={disabled || !text.trim()}` to `disabled={disabled || (!text.trim() && attachments.length === 0)}`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/lib/imageAttach.test.ts && npx tsc --noEmit && npx eslint src/components/agents/chat/ChatComposer.tsx src/lib/imageAttach.ts && npm run build`
Expected: tests pass, tsc 0, eslint 0, build succeeds.

- [ ] **Step 6: Manual check (deferred to controller/user)**

`npm run dev` → open a chat session, drag an image into the composer and paste one → chips appear (name + X); X removes; send → thumbnail shows in the bubble and Claude can reference the image. Manual only; do not start a dev server in the subagent.

- [ ] **Step 7: Commit**

```bash
git add src/components/agents/chat/ChatComposer.tsx src/lib/imageAttach.ts src/lib/imageAttach.test.ts src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "$(cat <<'EOF'
feat(chat): drag-and-drop et coller d'images dans le composer (chips)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Server — per-turn summarizer module (pure + injectable runner)

**Files:**
- Create: `packages/agent/src/sdk/turnSummarizer.ts`
- Test: `packages/agent/src/sdk/turnSummarizer.test.ts`

**Interfaces:**
- Produces: `buildTurnSummaryPrompt(finalText: string, actions: string[]): string`; `fallbackSummary(finalText: string): string`; `summarizeTurn(finalText: string, actions: string[], run?: (prompt: string) => Promise<string>): Promise<string>`.

- [ ] **Step 1: Failing test (node:test)**

Create `packages/agent/src/sdk/turnSummarizer.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnSummaryPrompt, fallbackSummary, summarizeTurn } from './turnSummarizer.js';

test('buildTurnSummaryPrompt includes final text and actions', () => {
	const p = buildTurnSummaryPrompt('did stuff', ['file_change: a.ts', 'commit: fix']);
	assert.match(p, /did stuff/);
	assert.match(p, /a\.ts/);
	assert.match(p, /fix/);
});

test('fallbackSummary truncates long text', () => {
	const long = 'x'.repeat(500);
	const out = fallbackSummary(long);
	assert.ok(out.length <= 281);
	assert.match(out, /…$/);
});

test('summarizeTurn returns runner output when non-empty', async () => {
	const out = await summarizeTurn('final', ['info: ls'], async () => '- discovered X');
	assert.equal(out, '- discovered X');
});

test('summarizeTurn falls back on empty runner output', async () => {
	const out = await summarizeTurn('final text', [], async () => '   ');
	assert.equal(out, fallbackSummary('final text'));
});

test('summarizeTurn falls back when runner throws', async () => {
	const out = await summarizeTurn('boom text', [], async () => {
		throw new Error('nope');
	});
	assert.equal(out, fallbackSummary('boom text'));
});
```

Run: `npm test -w packages/agent` → FAIL (module missing).

- [ ] **Step 2: Implement `turnSummarizer.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude } from '../helpers.js';

const execFileAsync = promisify(execFile);

export function buildTurnSummaryPrompt(finalText: string, actions: string[]): string {
	const actionsBlock = actions.length ? actions.join('\n') : '(aucune action outil)';
	return `Résume ce tour d'un agent de développement en 1 à 3 puces TRÈS courtes et précises (découvertes, décisions prises, résultat). Style télégraphique, pas de préambule, pas de répétition du prompt. Réponds UNIQUEMENT avec les puces markdown.

Message final de l'agent :
${finalText}

Actions réalisées :
${actionsBlock}`;
}

export function fallbackSummary(finalText: string): string {
	const t = finalText.trim();
	return t.length > 280 ? `${t.slice(0, 280)}…` : t;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
		string,
		string | undefined
	>;
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 20_000,
		maxBuffer: 1024 * 1024,
		env: cleanEnv as NodeJS.ProcessEnv,
	});
	return stdout;
}

export async function summarizeTurn(
	finalText: string,
	actions: string[],
	run: (prompt: string) => Promise<string> = defaultRun,
): Promise<string> {
	try {
		const out = (await run(buildTurnSummaryPrompt(finalText, actions))).trim();
		return out || fallbackSummary(finalText);
	} catch {
		return fallbackSummary(finalText);
	}
}
```

Run: `npm test -w packages/agent` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/sdk/turnSummarizer.ts packages/agent/src/sdk/turnSummarizer.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): summarizer de tour (prompt concis + fallback, runner injectable)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Server — concise Activity (wire summarizer, stop verbose summary)

**Files:**
- Modify: `packages/agent/src/sdk/activityDeriver.ts`
- Modify: `packages/agent/src/sdk/activityDeriver.test.ts`
- Modify: `packages/agent/src/sdk/sdkAgent.ts`

**Interfaces:**
- Consumes: `summarizeTurn` (Task 5). `SessionState` gains `turnActions: string[]`.

- [ ] **Step 1: Update `activityDeriver.ts` — result no longer emits verbose summary**

Replace the `result` branch:

```ts
	if (event.event === 'result') {
		// Le résumé concis de fin de tour est produit séparément (turnSummarizer).
		// Ici on ne remonte que les erreurs.
		return event.data.is_error ? [{ log_type: 'error', content: event.data.text }] : [];
	}
```

- [ ] **Step 2: Update the existing test `activityDeriver.test.ts`**

The existing test `'result → summary'` asserts the OLD behavior and must change. Replace it with:

```ts
test('result non-erreur → aucun log (résumé produit séparément)', () => {
	const out = deriveLogs({ event: 'result', data: { is_error: false, text: 'fait', session_id: 's', num_turns: 1, usage: {}, total_cost_usd: 0 } });
	assert.deepEqual(out, []);
});

test('result erreur → log error', () => {
	const out = deriveLogs({ event: 'result', data: { is_error: true, text: 'boom', session_id: 's', num_turns: 1, usage: {}, total_cost_usd: 0 } });
	assert.deepEqual(out, [{ log_type: 'error', content: 'boom' }]);
});
```

(Keep all other existing tests in the file unchanged.)

- [ ] **Step 3: Wire summarizer into `sdkAgent.ts` runLoop**

3a. Add import:

```ts
import { summarizeTurn } from './turnSummarizer.js';
```

3b. Add `turnActions: string[]` to the `SessionState` type/shape and initialize it to `[]` where sessions are created (find the `SessionState` interface and the object literal that builds `s`). If unsure of the exact init site, initialize lazily: treat `s.turnActions ??= []` in the loop.

3c. In `runLoop`, replace the derive-logs line and the result handling. Current lines:

```ts
					if (ev.event === 'result') s.busy = false;
					...
					for (const log of deriveLogs(ev)) writeActivityLog(sessionId, log.log_type, log.content);
					broadcast(s, { type: 'stream-event', seq, ...ev });
```

Change to accumulate tool actions, and on a non-error `result` fire the async summary (non-blocking):

```ts
					if (ev.event === 'result') s.busy = false;
					...
					for (const log of deriveLogs(ev)) {
						writeActivityLog(sessionId, log.log_type, log.content);
						if (log.log_type === 'file_change' || log.log_type === 'commit' || log.log_type === 'info') {
							(s.turnActions ??= []).push(`${log.log_type}: ${log.content}`);
						}
					}
					if (ev.event === 'result') {
						const actions = s.turnActions ?? [];
						s.turnActions = [];
						if (!ev.data.is_error) {
							const finalText = ev.data.text;
							// Non bloquant : n'attend pas la synthèse pour rendre la main.
							void summarizeTurn(finalText, actions).then((sum) =>
								writeActivityLog(sessionId, 'summary', sum),
							);
						}
					}
					broadcast(s, { type: 'stream-event', seq, ...ev });
```

(Keep the existing ordering of `transcript.appendEvent` before this block; only the derive/summary logic changes.)

- [ ] **Step 4: Verify**

Run: `npm test -w packages/agent && npm run build -w packages/agent`
Expected: updated `activityDeriver` tests pass; existing `sdkAgent.test.ts` passes (if it asserted a `summary` log from `result`, that assertion must be updated to the new behavior — report if so); agent builds.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/sdk/activityDeriver.ts packages/agent/src/sdk/activityDeriver.test.ts packages/agent/src/sdk/sdkAgent.ts
git commit -m "$(cat <<'EOF'
feat(agent): logs Activity concis via synthèse LLM par tour

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Server — synthesize-report route

**Files:**
- Modify: `packages/agent/src/routes/sessions.ts`
- Create: `packages/agent/src/sdk/reportSynth.ts` (pure prompt builder + injectable runner)
- Test: `packages/agent/src/sdk/reportSynth.test.ts`

**Interfaces:**
- Produces: `buildReportPrompt(logs: { log_type: string; content: string }[]): string`; `synthesizeReport(logs, run?): Promise<string>`. Route: `POST /agent-sessions/:sessionId/synthesize-report` → `{ report: string }`.

- [ ] **Step 1: Failing test (node:test)**

Create `packages/agent/src/sdk/reportSynth.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportPrompt, synthesizeReport } from './reportSynth.js';

test('buildReportPrompt includes the log contents and the section headers', () => {
	const p = buildReportPrompt([
		{ log_type: 'summary', content: 'lu le fichier X' },
		{ log_type: 'error', content: 'échec test Y' },
	]);
	assert.match(p, /lu le fichier X/);
	assert.match(p, /échec test Y/);
	assert.match(p, /## Fait/);
	assert.match(p, /## Décisions/);
	assert.match(p, /## Reste à faire/);
});

test('synthesizeReport returns runner output', async () => {
	const out = await synthesizeReport([{ log_type: 'summary', content: 'x' }], async () => '## Fait\n- x');
	assert.match(out, /## Fait/);
});

test('synthesizeReport throws on empty logs is avoided — returns empty string', async () => {
	const out = await synthesizeReport([], async () => 'unused');
	assert.equal(out, '');
});
```

Run: `npm test -w packages/agent` → FAIL.

- [ ] **Step 2: Implement `reportSynth.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findClaude } from '../helpers.js';

const execFileAsync = promisify(execFile);

export function buildReportPrompt(logs: { log_type: string; content: string }[]): string {
	const body = logs.map((l) => `- [${l.log_type}] ${l.content}`).join('\n');
	return `À partir du journal d'activité d'un agent de développement ci-dessous, produis un rapport de synthèse EN FRANÇAIS, clair et concis. Réponds UNIQUEMENT avec le rapport markdown, sans préambule.

Format exact :
## Fait
- (ce qui a été accompli, puces courtes)

## Décisions
- (décisions techniques notables — sinon "Aucune")

## Reste à faire
- (ce qui manque ou nécessite une review — sinon "Rien")

Journal d'activité :
${body}`;
}

async function defaultRun(prompt: string): Promise<string> {
	const CLAUDE_BIN = findClaude();
	const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env as Record<
		string,
		string | undefined
	>;
	const { stdout } = await execFileAsync(CLAUDE_BIN, ['--print', '--model', 'haiku', prompt], {
		timeout: 30_000,
		maxBuffer: 1024 * 1024,
		env: cleanEnv as NodeJS.ProcessEnv,
	});
	return stdout;
}

export async function synthesizeReport(
	logs: { log_type: string; content: string }[],
	run: (prompt: string) => Promise<string> = defaultRun,
): Promise<string> {
	if (logs.length === 0) return '';
	return (await run(buildReportPrompt(logs))).trim();
}
```

Run: `npm test -w packages/agent` → PASS.

- [ ] **Step 3: Add the route in `packages/agent/src/routes/sessions.ts`**

Add import at the top:

```ts
import { synthesizeReport } from '../sdk/reportSynth.js';
```

Add a new route handler alongside the existing `auto-summary` block (same `handleSessionRoutes` function):

```ts
	// POST /agent-sessions/:sessionId/synthesize-report
	const synthMatch = path.match(/^\/agent-sessions\/([^/]+)\/synthesize-report$/);
	if (synthMatch && method === 'POST') {
		const sessionId = decodeURIComponent(synthMatch[1]);
		try {
			const db = getDb();
			if (!db) return sendError(res, 'Database not available', 500);
			const session = db
				.prepare('SELECT id FROM agent_sessions WHERE session_id = ?')
				.get(sessionId) as { id: string } | undefined;
			if (!session) return sendJson(res, { error: 'Session not found' }, 404);
			const logs = db
				.prepare(
					"SELECT log_type, content FROM agent_activity_logs WHERE agent_session_id = ? AND log_type IN ('summary','error') ORDER BY created_at ASC",
				)
				.all(session.id) as { log_type: string; content: string }[];
			const report = await synthesizeReport(logs);
			sendJson(res, { report });
		} catch (err) {
			sendError(res, err instanceof Error ? err.message : 'Unknown error');
		}
		return;
	}
```

(Place it before the existing `auto-summary` match or after — order among these regex matches doesn't matter as long as it's inside `handleSessionRoutes` and returns.)

- [ ] **Step 4: Verify**

Run: `npm test -w packages/agent && npm run build -w packages/agent`
Expected: reportSynth tests pass; agent builds.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/routes/sessions.ts packages/agent/src/sdk/reportSynth.ts packages/agent/src/sdk/reportSynth.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): route synthesize-report (synthèse LLM des logs Activity)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Client — publish button uses synthesized report

**Files:**
- Modify: `src/components/agents/AgentActivityTab.tsx`
- Modify: `src/config/translate/{en,fr,es,de,pt}.json` (agentActivity keys)

**Interfaces:**
- Consumes: `POST /agent-sessions/:sessionId/synthesize-report` (Task 7) via `localFetch`. Keeps `buildReport` as fallback.

- [ ] **Step 1: i18n keys (5 locales)**

Add to the `agentActivity` namespace in each locale:
- en: `"synthesizing": "Synthesizing report…", "synthesizeError": "Could not synthesize, using raw activity"`
- fr: `"synthesizing": "Synthèse du rapport…", "synthesizeError": "Synthèse impossible, activité brute utilisée"`
- es: `"synthesizing": "Sintetizando informe…", "synthesizeError": "No se pudo sintetizar, se usa la actividad en bruto"`
- de: `"synthesizing": "Bericht wird zusammengefasst…", "synthesizeError": "Zusammenfassung fehlgeschlagen, Rohaktivität wird verwendet"`
- pt: `"synthesizing": "A sintetizar o relatório…", "synthesizeError": "Não foi possível sintetizar, a usar atividade em bruto"`

Validate: `node -e "['en','fr','es','de','pt'].forEach(l=>{const j=require('./src/config/translate/'+l+'.json'); if(!j.agentActivity.synthesizing) throw new Error('missing '+l)}); console.log('ok')"`

- [ ] **Step 2: Use the synthesize route in `handlePublish`**

In `src/components/agents/AgentActivityTab.tsx`, replace the report construction at the start of the `try` block:

```ts
			let report: string;
			try {
				const synthRes = await localFetch(
					`/agent-sessions/${session.session_id}/synthesize-report`,
					{ method: 'POST' },
				);
				const synthData = (await synthRes.json().catch(() => ({}))) as { report?: string };
				report =
					synthRes.ok && synthData.report && synthData.report.trim()
						? synthData.report
						: buildReport(session, visibleLogs, {
								reportTitle: t('reportTitle'),
								branch: t('branch'),
							});
			} catch {
				report = buildReport(session, visibleLogs, {
					reportTitle: t('reportTitle'),
					branch: t('branch'),
				});
			}
```

(The rest of `handlePublish` — the `if (hasIssue)` block using `report` — is unchanged. `localFetch` is already imported in this file.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/agents/AgentActivityTab.tsx && npm run build`
Expected: tsc 0, eslint 0, build succeeds.

- [ ] **Step 4: Manual check (deferred)**

`npm run dev` → run an agent session that produces activity, click "Publish report" → the report posted to the issue/PR is a concise synthesized summary (## Fait / ## Décisions / ## Reste à faire), not the raw per-log dump; on route failure it falls back to the raw list.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/AgentActivityTab.tsx src/config/translate/en.json src/config/translate/fr.json src/config/translate/es.json src/config/translate/de.json src/config/translate/pt.json
git commit -m "$(cat <<'EOF'
feat(activity): bouton Publier synthétise l'activité via LLM (fallback brut)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Drag & drop + paste image, chip (name + X delete) → Task 4. ✓
- Image sent to Claude SDK (reads images) → Task 1 (content blocks) + Task 2 (wiring). ✓
- Thumbnail in bubble + file on disk + path in transcript → Task 1 (`saveAttachment`) + Task 2 (transcript url + serve route) + Task 3 (render). ✓
- Multiple images, caps (types/5MB) → Task 4 (`imageAttach`). ✓
- Concise Activity logs (discoveries/decisions) via LLM per turn, non-blocking → Task 5 + Task 6. ✓
- Chat conversation unchanged (full reply) — only Activity condensed → Task 6 (only the `summary` log path changes; chat renders from `assistant` events). ✓
- Publish report synthesizes all Activity (logs only) → Task 7 (route) + Task 8 (button). ✓
- i18n 5 locales → Tasks 4 & 8. ✓
- Pure-logic tests only, correct runner per dir → Tasks 1,3,4,5,7 (node:test for agent, Vitest for src). ✓

**Placeholder scan:** No TBD/TODO; complete code in each code step; anchored edits name exact files/symbols.

**Type consistency:** `ChatImageInput` (client `src/types`, server `promptQueue`), `buildUserContent`, `saveAttachment`/`serveAttachment`/`attachmentRelUrl`, `userMessage(text, images?)`, `getAgentHttpUrl`, `summarizeTurn`, `buildReportPrompt`/`synthesizeReport`, `StreamEvent user.images {name,url}` — names consistent across tasks.

## Notes / Risks

- Adding `custom`-like breakage: the existing `activityDeriver.test.ts` asserts the old `result → summary`; Task 6 Step 2 updates it deliberately. `sdkAgent.test.ts` may also assert the old summary — update it if so and report.
- The per-turn summary appears in Activity a moment after the turn ends (async LLM + 10s log polling in `useAgentSession`); acceptable by design.
- `attachmentsDir()` relative-path fallback depth must resolve to repo `data/` from `packages/agent/src/sdk/`; `DEVORA_DB_PATH` is set in dev so the fallback rarely runs — verify the `..` count at implementation.
- Base64 images cross the WS; the 5 MB cap bounds payload size. No resize/compression (YAGNI).
