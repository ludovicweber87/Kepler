'use server';

import { cookies } from 'next/headers';
import type { Locale } from '@/i18n/request';

export async function setLocale(locale: Locale) {
	const store = await cookies();
	store.set('locale', locale, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365, // 1 year
		sameSite: 'lax',
	});
}
