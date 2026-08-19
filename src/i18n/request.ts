import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['en', 'fr', 'es', 'de', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export default getRequestConfig(async () => {
	const store = await cookies();
	const raw = store.get('locale')?.value;
	const locale = LOCALES.includes(raw as Locale) ? (raw as Locale) : DEFAULT_LOCALE;

	return {
		locale,
		messages: (await import(`../config/translate/${locale}.json`)).default,
	};
});
