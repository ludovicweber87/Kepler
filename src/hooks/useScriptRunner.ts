'use client';

import { createContext, useContext } from 'react';
import type { RepoScriptRunMode } from '@/types';

/**
 * Un script cliqué dans la topbar, en attente d'exécution par le Workbench.
 * Le `nonce` distingue deux clics successifs sur le même script.
 */
export interface PendingScriptRun {
	nonce: number;
	sessionId: string;
	mode: RepoScriptRunMode;
	name: string;
	script: string;
}

interface ScriptRunnerCtx {
	pending: PendingScriptRun | null;
	run: (payload: Omit<PendingScriptRun, 'nonce'>) => void;
	consume: () => void;
}

export const ScriptRunnerContext = createContext<ScriptRunnerCtx>({
	pending: null,
	run: () => {},
	consume: () => {},
});

export function useScriptRunner() {
	return useContext(ScriptRunnerContext);
}
