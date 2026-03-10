import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const SKILLS_DIR = '.claude/skills';

export interface SkillEntry {
	name: string;
	filename: string; // e.g. "migration-checklist.md" or "interview/SKILL.md"
	content: string;
	isFolder: boolean;
}

// GET — list skill files from a project path
export async function GET(req: NextRequest) {
	const projectPath = req.nextUrl.searchParams.get('path');
	if (!projectPath) {
		return NextResponse.json({ error: 'Missing path' }, { status: 400 });
	}

	const skillsDir = join(projectPath, SKILLS_DIR);

	if (!existsSync(skillsDir)) {
		return NextResponse.json({ skills: [] });
	}

	try {
		const entries = await readdir(skillsDir);
		const skills: SkillEntry[] = [];

		for (const entry of entries) {
			const entryPath = join(skillsDir, entry);
			const info = await stat(entryPath);

			if (info.isDirectory()) {
				// Folder skill — read SKILL.md
				const skillFile = join(entryPath, 'SKILL.md');
				if (existsSync(skillFile)) {
					const content = await readFile(skillFile, 'utf-8');
					skills.push({
						name: entry,
						filename: `${entry}/SKILL.md`,
						content,
						isFolder: true,
					});
				}
			} else if (entry.endsWith('.md')) {
				const content = await readFile(entryPath, 'utf-8');
				skills.push({
					name: entry.replace(/\.md$/, ''),
					filename: entry,
					content,
					isFolder: false,
				});
			}
		}

		return NextResponse.json({ skills });
	} catch {
		return NextResponse.json({ skills: [] });
	}
}

// PUT — create or update a skill
export async function PUT(req: NextRequest) {
	const { path: projectPath, filename, content } = await req.json();

	if (!projectPath || !filename || content === undefined) {
		return NextResponse.json({ error: 'Missing path, filename, or content' }, { status: 400 });
	}

	const filePath = join(projectPath, SKILLS_DIR, filename);
	const dir = filePath.substring(0, filePath.lastIndexOf('/'));

	try {
		if (!existsSync(dir)) {
			await mkdir(dir, { recursive: true });
		}
		await writeFile(filePath, content, 'utf-8');
		return NextResponse.json({ ok: true, filename });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Write failed' },
			{ status: 500 },
		);
	}
}

// DELETE — remove a skill
export async function DELETE(req: NextRequest) {
	const { path: projectPath, filename, isFolder } = await req.json();

	if (!projectPath || !filename) {
		return NextResponse.json({ error: 'Missing path or filename' }, { status: 400 });
	}

	try {
		if (isFolder) {
			const { rm } = await import('fs/promises');
			const folderPath = join(projectPath, SKILLS_DIR, filename.split('/')[0]);
			if (existsSync(folderPath)) {
				await rm(folderPath, { recursive: true });
			}
		} else {
			const { unlink } = await import('fs/promises');
			const filePath = join(projectPath, SKILLS_DIR, filename);
			if (existsSync(filePath)) {
				await unlink(filePath);
			}
		}
		return NextResponse.json({ ok: true });
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'Delete failed' },
			{ status: 500 },
		);
	}
}
