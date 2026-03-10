import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const AGENTS_DIR = '.claude/agents';

// GET — list agent .md files from a project path
export async function GET(req: NextRequest) {
	const projectPath = req.nextUrl.searchParams.get('path');
	if (!projectPath) {
		return NextResponse.json({ error: 'Missing path' }, { status: 400 });
	}

	const agentsDir = join(projectPath, AGENTS_DIR);

	if (!existsSync(agentsDir)) {
		return NextResponse.json({ agents: [] });
	}

	try {
		const files = await readdir(agentsDir);
		const mdFiles = files.filter((f) => f.endsWith('.md'));

		const agents = await Promise.all(
			mdFiles.map(async (filename) => {
				const content = await readFile(join(agentsDir, filename), 'utf-8');
				return {
					filename,
					name: filename.replace(/\.md$/, ''),
					content,
				};
			}),
		);

		return NextResponse.json({ agents });
	} catch {
		return NextResponse.json({ agents: [] });
	}
}

// PUT — create or update an agent .md file
export async function PUT(req: NextRequest) {
	const { path: projectPath, filename, content } = await req.json();

	if (!projectPath || !filename || content === undefined) {
		return NextResponse.json({ error: 'Missing path, filename, or content' }, { status: 400 });
	}

	const agentsDir = join(projectPath, AGENTS_DIR);

	try {
		if (!existsSync(agentsDir)) {
			await mkdir(agentsDir, { recursive: true });
		}

		const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
		await writeFile(join(agentsDir, safeName), content, 'utf-8');

		return NextResponse.json({ ok: true, filename: safeName });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Write failed' },
			{ status: 500 },
		);
	}
}

// DELETE — remove an agent .md file
export async function DELETE(req: NextRequest) {
	const { path: projectPath, filename } = await req.json();

	if (!projectPath || !filename) {
		return NextResponse.json({ error: 'Missing path or filename' }, { status: 400 });
	}

	const { unlink } = await import('fs/promises');
	const filePath = join(projectPath, AGENTS_DIR, filename);

	try {
		if (existsSync(filePath)) {
			await unlink(filePath);
		}
		return NextResponse.json({ ok: true });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Delete failed' },
			{ status: 500 },
		);
	}
}
