'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';
import { DEFAULT_THEME_PREFS, normalizeThemePrefs, type ThemePrefs } from '@/lib/themePrefs';
import { readStoredItem } from '@/lib/legacyStorage';

const STORAGE_KEY = 'kepler-theme-prefs';
const LEGACY_STORAGE_KEY = 'devora-theme-prefs';
const CHANGE_EVENT = 'kepler-theme-prefs-change';
const DB_KEY = 'theme_prefs';

interface ThemePrefsContextValue {
	prefs: ThemePrefs;
	preview: (next: ThemePrefs) => void;
	resetPreview: () => void;
	save: (next: ThemePrefs) => Promise<void>;
	isSaving: boolean;
}

const ThemePrefsContext = createContext<ThemePrefsContextValue>({
	prefs: DEFAULT_THEME_PREFS,
	preview: () => {},
	resetPreview: () => {},
	save: async () => {},
	isSaving: false,
});

// Cached snapshot so useSyncExternalStore keeps a stable reference.
let cachedRaw: string | null = null;
let cachedPrefs: ThemePrefs = DEFAULT_THEME_PREFS;

function getSnapshot(): ThemePrefs {
	const raw = readStoredItem(STORAGE_KEY, LEGACY_STORAGE_KEY);
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		try {
			cachedPrefs = normalizeThemePrefs(raw ? JSON.parse(raw) : null);
		} catch {
			cachedPrefs = DEFAULT_THEME_PREFS;
		}
	}
	return cachedPrefs;
}

const getServerSnapshot = (): ThemePrefs => DEFAULT_THEME_PREFS;

function subscribe(callback: () => void) {
	window.addEventListener('storage', callback);
	window.addEventListener(CHANGE_EVENT, callback);
	return () => {
		window.removeEventListener('storage', callback);
		window.removeEventListener(CHANGE_EVENT, callback);
	};
}

function writeStorage(value: string) {
	localStorage.setItem(STORAGE_KEY, value);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemePrefsProvider({ children }: { children: ReactNode }) {
	const qc = useQueryClient();
	const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const [previewPrefs, setPreviewPrefs] = useState<ThemePrefs | null>(null);

	const { data } = useQuery({
		queryKey: ['app-setting', DB_KEY],
		queryFn: async () => {
			const res = await apiFetch(`/api/settings?key=${DB_KEY}`);
			if (!res.ok) throw new Error('Failed to fetch theme prefs');
			const { value } = (await res.json()) as { value: string | null };
			return value;
		},
	});

	// Reconcile the DB value into localStorage (source of truth for first paint).
	useEffect(() => {
		if (data == null) return;
		if (data !== localStorage.getItem(STORAGE_KEY)) writeStorage(data);
	}, [data]);

	const mutation = useMutation({
		mutationFn: async (next: ThemePrefs) => {
			const value = JSON.stringify(next);
			const res = await apiFetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: DB_KEY, value }),
			});
			if (!res.ok) throw new Error('Failed to save theme prefs');
			return value;
		},
		onSuccess: (value) => {
			writeStorage(value);
			qc.setQueryData(['app-setting', DB_KEY], value);
		},
	});

	const preview = useCallback((next: ThemePrefs) => setPreviewPrefs(next), []);
	const resetPreview = useCallback(() => setPreviewPrefs(null), []);
	const save = useCallback(
		async (next: ThemePrefs) => {
			await mutation.mutateAsync(next);
			setPreviewPrefs(null);
		},
		[mutation],
	);

	const prefs = previewPrefs ?? stored;

	const value = useMemo(
		() => ({ prefs, preview, resetPreview, save, isSaving: mutation.isPending }),
		[prefs, preview, resetPreview, save, mutation.isPending],
	);

	return <ThemePrefsContext.Provider value={value}>{children}</ThemePrefsContext.Provider>;
}

export function useThemePrefs() {
	return useContext(ThemePrefsContext);
}
