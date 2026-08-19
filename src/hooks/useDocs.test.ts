import { describe, it, expect } from 'vitest';
import { isDocPending, countPendingDocs } from './useDocs';
import type { DocStatus } from '@/types';

const doc = (status: DocStatus) => ({ status });

describe('isDocPending', () => {
	it('considère queued et generating comme en cours', () => {
		expect(isDocPending(doc('queued'))).toBe(true);
		expect(isDocPending(doc('generating'))).toBe(true);
	});

	it('considère ready et failed comme résolus', () => {
		expect(isDocPending(doc('ready'))).toBe(false);
		expect(isDocPending(doc('failed'))).toBe(false);
	});
});

describe('countPendingDocs', () => {
	it('cumule les docs en cours', () => {
		expect(
			countPendingDocs([doc('generating'), doc('ready'), doc('queued'), doc('failed')]),
		).toBe(2);
	});

	it('renvoie 0 quand tout est résolu', () => {
		expect(countPendingDocs([doc('ready'), doc('failed')])).toBe(0);
	});

	it('renvoie 0 sur une liste vide ou absente', () => {
		expect(countPendingDocs([])).toBe(0);
		expect(countPendingDocs()).toBe(0);
	});

	it('décrémente au fur et à mesure que chaque doc se résout indépendamment', () => {
		const docs = [doc('generating'), doc('generating'), doc('generating')];
		expect(countPendingDocs(docs)).toBe(3);
		docs[1] = doc('ready');
		expect(countPendingDocs(docs)).toBe(2);
		docs[0] = doc('failed');
		expect(countPendingDocs(docs)).toBe(1);
		docs[2] = doc('ready');
		expect(countPendingDocs(docs)).toBe(0);
	});
});
