import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

export interface PromptQueue {
  iterable: AsyncIterable<SDKUserMessage>;
  push(text: string): void;
  close(): void;
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
    push(text: string) {
      queue.push({
        type: 'user',
        message: { role: 'user', content: text },
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
