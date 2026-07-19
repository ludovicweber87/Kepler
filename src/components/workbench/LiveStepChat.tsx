'use client';

import { useEffect } from 'react';
import ChatBubble from '@/components/agents/chat/ChatBubble';
import ChatPending from '@/components/agents/chat/ChatPending';
import { useAgentChat } from '@/hooks/useAgentChat';

interface Props {
	sessionId: string;
	cwd: string | null;
	onActivity?: () => void;
}

/**
 * Streams the currently-running persona step over WS (observer only). The
 * session is driven server-side by the pipeline runner; we attach as a
 * read-only client (observeOnly) — no composer, never sends a user message.
 */
export default function LiveStepChat({ sessionId, cwd, onActivity }: Props) {
	const chat = useAgentChat({
		sessionId,
		cwd,
		enabled: true,
		// Must be false so the WS actually connects; observeOnly guarantees we
		// never spin up a new SDK agent if the step already finished.
		readOnly: false,
		observeOnly: true,
	});

	useEffect(() => {
		onActivity?.();
	}, [chat.messages, onActivity]);

	const busy = chat.status === 'busy';
	const lastRole = chat.messages[chat.messages.length - 1]?.role;
	const showPending = busy && lastRole !== 'assistant';

	return (
		<>
			{chat.messages.map((m) => (
				<ChatBubble key={m.id} message={m} />
			))}
			{showPending && <ChatPending />}
		</>
	);
}
