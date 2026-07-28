import type { AgentSession, AgentActivityLog } from '@/hooks/useAgentSession';

export function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function buildReport(
	session: AgentSession,
	logs: AgentActivityLog[],
	labels: { reportTitle: string; branch: string },
): string {
	const lines: string[] = [];
	lines.push(`## 🤖 ${labels.reportTitle}`);
	lines.push('');
	if (session.branch) lines.push(`**${labels.branch}:** \`${session.branch}\``);
	lines.push('');

	for (const log of logs) {
		const time = formatTime(log.created_at);
		const icon =
			log.log_type === 'commit'
				? '📦'
				: log.log_type === 'file_change'
					? '📝'
					: log.log_type === 'error'
						? '❌'
						: log.log_type === 'summary'
							? '📋'
							: log.log_type === 'ask_question'
								? '❓'
								: 'ℹ️';
		lines.push(`- \`${time}\` ${icon} ${log.content}`);
	}

	lines.push('');
	lines.push('---');
	lines.push('*Published by [Kepler](https://github.com)*');
	return lines.join('\n');
}
