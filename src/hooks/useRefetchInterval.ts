import { useCallback } from 'react';
import { useAppSetting } from '@/hooks/useAppSetting';

/**
 * Intervalle d'auto-refetch (en ms) persisté dans `app_settings`.
 * `0` = désactivé (rafraîchissement manuel).
 */
export function useRefetchInterval(settingKey: string): readonly [number, (ms: number) => void] {
	const { valueOrDefault, save } = useAppSetting(settingKey, '0');
	const value = Number(valueOrDefault) || 0;
	const setValue = useCallback(
		(ms: number) => {
			save(String(ms)).catch(() => {});
		},
		[save],
	);
	return [value, setValue] as const;
}
