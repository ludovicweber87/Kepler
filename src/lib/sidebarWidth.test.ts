import { describe, it, expect } from 'vitest';
import {
	clampSidebarWidth,
	parseSidebarWidth,
	SIDEBAR_WIDTH_DEFAULT,
	SIDEBAR_WIDTH_MAX,
	SIDEBAR_WIDTH_MIN,
} from './sidebarWidth';

describe('clampSidebarWidth', () => {
	it('laisse passer une largeur dans la plage', () => {
		expect(clampSidebarWidth(320)).toBe(320);
	});

	it('borne en dessous du minimum et au-dessus du maximum', () => {
		expect(clampSidebarWidth(10)).toBe(SIDEBAR_WIDTH_MIN);
		expect(clampSidebarWidth(9999)).toBe(SIDEBAR_WIDTH_MAX);
	});

	it('arrondit les largeurs fractionnaires', () => {
		expect(clampSidebarWidth(300.6)).toBe(301);
	});

	it('retombe sur le défaut pour une valeur non finie', () => {
		expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT);
		expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_WIDTH_DEFAULT);
	});
});

describe('parseSidebarWidth', () => {
	it('parse une valeur persistée', () => {
		expect(parseSidebarWidth('312')).toBe(312);
	});

	it('retombe sur le défaut quand rien n’est persisté ou que la valeur est illisible', () => {
		expect(parseSidebarWidth(null)).toBe(SIDEBAR_WIDTH_DEFAULT);
		expect(parseSidebarWidth(undefined)).toBe(SIDEBAR_WIDTH_DEFAULT);
		expect(parseSidebarWidth('wide')).toBe(SIDEBAR_WIDTH_DEFAULT);
	});

	it('borne une valeur persistée hors plage', () => {
		expect(parseSidebarWidth('2000')).toBe(SIDEBAR_WIDTH_MAX);
	});
});
