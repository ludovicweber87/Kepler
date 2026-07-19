'use client';

import { useQuery } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import { reduceStreamEvent } from '@/lib/chatReducer';
import type { ChatMessage, StreamEventWire } from '@/types';

interface TranscriptRow {
	seq: number;
	event: { event: StreamEventWire['event']; data: Record<string, unknown> };
}

/**
 * Loads a session's persisted chat transcript over HTTP and reduces it to
 * ChatMessage[] — used to render completed persona steps in the run chat
 * (the live step streams over WS instead, see LiveStepChat).
 */
export function useSessionTranscript(sessionId: string | null | undefined) {
	const query = useQuery({
		queryKey: ['session-transcript', sessionId],
		queryFn: async () => {
			const res = await localFetch(
				`/agent-sessions/${encodeURIComponent(sessionId!)}/transcript`,
			);
			if (!res.ok) throw new Error('Failed to fetch transcript');
			const { events } = (await res.json()) as { events: TranscriptRow[] };
			return events.reduce<ChatMessage[]>(
				(msgs, row) => reduceStreamEvent(msgs, { seq: row.seq, ...row.event }),
				[],
			);
		},
		enabled: !!sessionId,
		staleTime: 60_000,
	});

	return { messages: query.data ?? [], isLoading: query.isLoading };
}
