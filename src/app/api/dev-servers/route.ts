import { NextRequest, NextResponse } from 'next/server';
import { spawn, type ChildProcess } from 'child_process';

export const dynamic = 'force-dynamic';

interface DevServer {
	pid: number;
	port: number;
	cwd: string;
	branch: string | null;
	startedAt: number;
}

// In-memory store — lives as long as the Next.js server process
const servers = new Map<number, { process: ChildProcess; info: DevServer }>();

const BASE_PORT = 4002;
const MAX_PORT = 4050;

function findNextPort(): number {
	const usedPorts = new Set([...servers.values()].map((s) => s.info.port));
	for (let port = BASE_PORT; port <= MAX_PORT; port++) {
		if (!usedPorts.has(port)) return port;
	}
	throw new Error('No available port');
}

/** GET — list running dev servers */
export async function GET() {
	const list: DevServer[] = [];
	for (const [pid, entry] of servers) {
		// Check if process is still alive
		try {
			process.kill(pid, 0);
			list.push(entry.info);
		} catch {
			// Process died — clean up
			servers.delete(pid);
		}
	}
	return NextResponse.json({ servers: list });
}

/** POST — start a new dev server for a worktree */
export async function POST(req: NextRequest) {
	const { cwd, branch } = (await req.json()) as { cwd: string; branch?: string };

	if (!cwd) {
		return NextResponse.json({ error: 'cwd is required' }, { status: 400 });
	}

	// Check if a server is already running for this cwd
	for (const entry of servers.values()) {
		if (entry.info.cwd === cwd) {
			return NextResponse.json({ server: entry.info });
		}
	}

	const port = findNextPort();

	const child = spawn('npx', ['next', 'dev', '-p', String(port)], {
		cwd,
		stdio: 'ignore',
		detached: true,
		env: { ...process.env, PORT: String(port) },
	});

	child.unref();

	if (!child.pid) {
		return NextResponse.json({ error: 'Failed to start dev server' }, { status: 500 });
	}

	const info: DevServer = {
		pid: child.pid,
		port,
		cwd,
		branch: branch ?? null,
		startedAt: Date.now(),
	};

	servers.set(child.pid, { process: child, info });

	// Clean up on exit
	child.on('exit', () => {
		servers.delete(child.pid!);
	});

	return NextResponse.json({ server: info }, { status: 201 });
}

/** DELETE — stop a dev server by pid */
export async function DELETE(req: NextRequest) {
	const { pid } = (await req.json()) as { pid: number };

	if (!pid) {
		return NextResponse.json({ error: 'pid is required' }, { status: 400 });
	}

	const entry = servers.get(pid);
	if (!entry) {
		return NextResponse.json({ error: 'Server not found' }, { status: 404 });
	}

	try {
		// Kill process group (detached)
		process.kill(-pid, 'SIGTERM');
	} catch {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// already dead
		}
	}

	servers.delete(pid);
	return NextResponse.json({ ok: true });
}
