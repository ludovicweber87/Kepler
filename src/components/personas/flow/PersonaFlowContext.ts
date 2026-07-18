'use client';

import { createContext, useContext } from 'react';
import type { Persona } from '@/types';

/** Live persona lookup shared with custom node components. */
export const PersonaFlowContext = createContext<Map<string, Persona>>(new Map());

export function usePersonaLookup() {
	return useContext(PersonaFlowContext);
}
