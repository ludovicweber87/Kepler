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
	it('retombe sur le défaut pour NaN et Infinity', () => {
		// Le handler de drag appelle cette fonction directement : un NaN qui passe
		// finirait dans une largeur CSS et casserait le layout sans bruit.
		expect(clampDocChatWidth(NaN)).toBe(DOC_CHAT_WIDTH_DEFAULT);
		expect(clampDocChatWidth(Infinity)).toBe(DOC_CHAT_WIDTH_DEFAULT);
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
	it("ne renvoie jamais NaN, y compris sur une chaîne d'espaces", () => {
		// `Number(' ')` vaut 0 — la valeur est donc clampée au minimum, pas rejetée.
		expect(parseDocChatWidth(' ')).toBe(DOC_CHAT_WIDTH_MIN);
	});
});
