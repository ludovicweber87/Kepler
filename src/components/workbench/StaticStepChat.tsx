'use client';

import ChatBubble from '@/components/agents/chat/ChatBubble';
import { useSessionTranscript } from '@/hooks/useSessionTranscript';

/** Renders a completed persona step's persisted transcript (read-only, no WS). */
export default function StaticStepChat({ sessionId }: { sessionId: string }) {
	const { messages } = useSessionTranscript(sessionId);
	return (
		<>
			{messages.map((m) => (
				<ChatBubble key={m.id} message={m} />
			))}
		</>
	);
}
