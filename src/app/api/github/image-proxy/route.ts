import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(req: NextRequest) {
	const url = req.nextUrl.searchParams.get('url');
	if (!url) {
		return NextResponse.json({ error: 'url required' }, { status: 400 });
	}

	// Only proxy github.com and githubusercontent.com URLs
	const parsed = new URL(url);
	if (
		!parsed.hostname.endsWith('github.com') &&
		!parsed.hostname.endsWith('githubusercontent.com')
	) {
		return NextResponse.json({ error: 'invalid host' }, { status: 403 });
	}

	const res = await fetch(url, {
		headers: {
			...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
			Accept: 'application/octet-stream',
		},
	});

	if (!res.ok) {
		return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: res.status });
	}

	const contentType = res.headers.get('content-type') ?? 'image/png';
	const buffer = await res.arrayBuffer();

	return new NextResponse(buffer, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400',
		},
	});
}
