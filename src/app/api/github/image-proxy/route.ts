import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
	const url = req.nextUrl.searchParams.get('url');
	if (!url) {
		return NextResponse.json({ error: 'url required' }, { status: 400 });
	}

	const parsed = new URL(url);
	if (
		!parsed.hostname.endsWith('github.com') &&
		!parsed.hostname.endsWith('githubusercontent.com')
	) {
		return NextResponse.json({ error: 'invalid host' }, { status: 403 });
	}

	// Use user's token if authenticated, fallback to env var
	const auth = await getAuthContext();
	const token = auth?.accessToken ?? process.env.GITHUB_TOKEN;

	const res = await fetch(url, {
		headers: {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
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
