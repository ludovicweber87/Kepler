'use client';

import { createContext, useContext } from 'react';

interface RightSidebarCtx {
	open: boolean;
	toggle: () => void;
	width: number;
	setWidth: (w: number) => void;
}

export const RightSidebarContext = createContext<RightSidebarCtx>({
	open: true,
	toggle: () => {},
	width: 260,
	setWidth: () => {},
});

export function useRightSidebar() {
	return useContext(RightSidebarContext);
}
