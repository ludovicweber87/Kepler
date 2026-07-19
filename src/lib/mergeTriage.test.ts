import { describe, it, expect } from 'vitest';
import { planMergeTriage, type TriageSession } from './mergeTriage';

const base: TriageSession = {
	session_id: 'sess-1',
	issue_owner: 'acme',
	issue_repo: 'devora',
	issue_number: 92,
	archived_at: null,
};

describe('planMergeTriage', () => {
	it('renvoie tout à null sans session', () => {
		expect(planMergeTriage(null, 'QA')).toEqual({ issueMove: null, archiveSessionId: null });
		expect(planMergeTriage(undefined, 'QA')).toEqual({
			issueMove: null,
			archiveSessionId: null,
		});
	});

	it("n'agit pas si la session n'est pas liée à une issue", () => {
		const s: TriageSession = { ...base, issue_number: null, issue_owner: null, issue_repo: null };
		expect(planMergeTriage(s, 'QA')).toEqual({ issueMove: null, archiveSessionId: null });
	});

	it('déplace vers la colonne QA et archive quand tout est présent', () => {
		expect(planMergeTriage(base, 'QA')).toEqual({
			issueMove: { owner: 'acme', repo: 'devora', issueNumber: 92, newStatus: 'QA' },
			archiveSessionId: 'sess-1',
		});
	});

	it('archive quand même mais ne déplace pas si la colonne QA est vide/espaces', () => {
		expect(planMergeTriage(base, '')).toEqual({ issueMove: null, archiveSessionId: 'sess-1' });
		expect(planMergeTriage(base, '   ')).toEqual({ issueMove: null, archiveSessionId: 'sess-1' });
		expect(planMergeTriage(base, null)).toEqual({ issueMove: null, archiveSessionId: 'sess-1' });
	});

	it('trim le nom de colonne', () => {
		expect(planMergeTriage(base, '  QA  ').issueMove?.newStatus).toBe('QA');
	});

	it('ne ré-archive pas une session déjà archivée', () => {
		const s: TriageSession = { ...base, archived_at: '2026-01-01T00:00:00Z' };
		expect(planMergeTriage(s, 'QA')).toEqual({
			issueMove: { owner: 'acme', repo: 'devora', issueNumber: 92, newStatus: 'QA' },
			archiveSessionId: null,
		});
	});
});
