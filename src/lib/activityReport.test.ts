import { describe, it, expect } from 'vitest';
import { buildReport } from './activityReport';
import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

const baseSession = { branch: 'feat/x' } as AgentSession;
const log = (log_type: AgentActivityLog['log_type'], content: string): AgentActivityLog =>
	({
		id: log_type + content,
		log_type,
		content,
		created_at: '2026-07-15T10:00:00.000Z',
	}) as AgentActivityLog;
const labels = { reportTitle: 'Rapport agent', branch: 'Branch' };

describe('buildReport', () => {
	it('includes the title header and footer', () => {
		const md = buildReport(baseSession, [], labels);
		expect(md).toContain('## 🤖 Rapport agent');
		expect(md).toContain('*Published by [Devora](https://github.com)*');
	});

	it('includes the branch line when the session has a branch', () => {
		const md = buildReport(baseSession, [], labels);
		expect(md).toContain('**Branch:** `feat/x`');
	});

	it('omits the branch line when there is no branch', () => {
		const md = buildReport({ branch: null } as unknown as AgentSession, [], labels);
		expect(md).not.toContain('**Branch:**');
	});

	it('renders each log with its type icon and content', () => {
		const md = buildReport(
			baseSession,
			[
				log('commit', 'did a commit'),
				log('file_change', 'changed a file'),
				log('error', 'boom'),
				log('summary', 'a summary'),
				log('ask_question', 'a question'),
				log('info', 'some info'),
			],
			labels,
		);
		expect(md).toMatch(/📦 did a commit/);
		expect(md).toMatch(/📝 changed a file/);
		expect(md).toMatch(/❌ boom/);
		expect(md).toMatch(/📋 a summary/);
		expect(md).toMatch(/❓ a question/);
		expect(md).toMatch(/ℹ️ some info/);
	});
});
