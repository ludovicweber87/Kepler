import { describe, it, expect } from 'vitest';
import {
	clampDocChatWidth,
	parseDocChatWidth,
	DOC_CHAT_WIDTH_MIN,
	DOC_CHAT_WIDTH_MAX,
	DOC_CHAT_WIDTH_DEFAULT,
} from './docChatWidth';

describe('clampDocChatWidth', () => {
	it('laisse passer une valeur dans les bornes', () => {
		expect(clampDocChatWidth(500)).toBe(500);
	});
	it('clampe en dessous du minimum', () => {
		expect(clampDocChatWidth(100)).toBe(DOC_CHAT_WIDTH_MIN);
	});
	it('clampe au-dessus du maximum', () => {
		expect(clampDocChatWidth(2000)).toBe(DOC_CHAT_WIDTH_MAX);
	});
	it('arrondit les décimales', () => {
		expect(clampDocChatWidth(420.7)).toBe(421);
	});
});

describe('parseDocChatWidth', () => {
	it('parse une valeur stockée valide', () => {
		expect(parseDocChatWidth('500')).toBe(500);
	});
	it('clampe une valeur stockée hors bornes', () => {
		expect(parseDocChatWidth('9999')).toBe(DOC_CHAT_WIDTH_MAX);
	});
	it('retombe sur le défaut si absent', () => {
		expect(parseDocChatWidth(null)).toBe(DOC_CHAT_WIDTH_DEFAULT);
		expect(parseDocChatWidth(undefined)).toBe(DOC_CHAT_WIDTH_DEFAULT);
		expect(parseDocChatWidth('')).toBe(DOC_CHAT_WIDTH_DEFAULT);
	});
	it('retombe sur le défaut si non numérique', () => {
		expect(parseDocChatWidth('large')).toBe(DOC_CHAT_WIDTH_DEFAULT);
	});
});
