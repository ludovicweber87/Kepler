import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';

export async function POST(req: NextRequest) {
	try {
		const { issueTitle, issueNumber, labels } = (await req.json()) as {
			issueTitle: string;
			issueNumber: number;
			labels?: string[];
		};

		if (!issueTitle || !issueNumber) {
			return NextResponse.json({ error: 'issueTitle and issueNumber required' }, { status: 400 });
		}

		// Determine karma prefix from labels
		const lowerLabels = (labels ?? []).map((l) => l.toLowerCase());
		let prefix = 'feat';
		if (lowerLabels.some((l) => l.includes('bug') || l.includes('fix'))) prefix = 'fix';
		else if (lowerLabels.some((l) => l.includes('refactor'))) prefix = 'refactor';
		else if (lowerLabels.some((l) => l.includes('docs') || l.includes('documentation')))
			prefix = 'docs';
		else if (lowerLabels.some((l) => l.includes('chore'))) prefix = 'chore';
		else if (lowerLabels.some((l) => l.includes('test'))) prefix = 'test';
		else if (lowerLabels.some((l) => l.includes('perf') || l.includes('performance')))
			prefix = 'perf';

		const prompt = `Generate a short git branch slug in English from this GitHub issue title. Rules:
- Output ONLY the slug, nothing else
- 2-5 words separated by hyphens
- Lowercase, no special characters
- Must be meaningful and summarize the issue
- Translate to English if needed

Issue title: "${issueTitle}"`;

		const escaped = prompt.replace(/'/g, "'\\''");
		const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

		const slug = execSync(`${CLAUDE_BIN} --print '${escaped}'`, {
			encoding: 'utf-8',
			timeout: 15_000,
			maxBuffer: 1024 * 512,
			env: cleanEnv,
		})
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40);

		if (!slug) {
			return NextResponse.json({ error: 'Empty slug generated' }, { status: 500 });
		}

		const branchName = `${prefix}/${issueNumber}-${slug}`;

		return NextResponse.json({ branchName, prefix, slug });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
