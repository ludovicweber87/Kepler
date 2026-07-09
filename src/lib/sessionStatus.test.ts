import { test, expect } from 'vitest';
import { classifySession, isActive, isPast, isArchived } from './sessionStatus';

test('active: status active, non archivé', () => {
	expect(classifySession({ status: 'active', archived_at: null })).toBe('active');
	expect(isActive({ status: 'active' })).toBe(true);
});

test('past: status completed/error, non archivé', () => {
	expect(classifySession({ status: 'completed', archived_at: null })).toBe('past');
	expect(classifySession({ status: 'error' })).toBe('past');
	expect(isPast({ status: 'completed' })).toBe(true);
});

test('archived prime sur le statut', () => {
	expect(classifySession({ status: 'active', archived_at: '2026-01-01' })).toBe('archived');
	expect(classifySession({ status: 'completed', archived_at: '2026-01-01' })).toBe('archived');
	expect(isArchived({ status: 'active', archived_at: 'x' })).toBe(true);
});

test('statut manquant → past', () => {
	expect(classifySession({})).toBe('past');
});
