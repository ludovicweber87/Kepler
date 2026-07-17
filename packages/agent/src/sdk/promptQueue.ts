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
