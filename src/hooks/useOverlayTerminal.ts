'use client';

import { createContext, useContext } from 'react';

export interface OverlaySession {
	sessionId: string;
	projectPath: string;
	projectName: string;
	isPastSession?: boolean;
}

interface OverlayTerminalCtx {
	session: OverlaySession | null;
	open: (session: OverlaySession) => void;
	close: () => void;
}

export const OverlayTerminalContext = createContext<OverlayTerminalCtx>({
	session: null,
	open: () => {},
	close: () => {},
});

export function useOverlayTerminal() {
	return useContext(OverlayTerminalContext);
}
