import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
	const isLoggedIn = !!req.auth;
	const isLoginPage = req.nextUrl.pathname === '/login';
	const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth');
	const isAgentLog = req.nextUrl.pathname.startsWith('/api/agent-sessions/log');

	// Allow auth API and agent log endpoint without auth
	if (isAuthApi || isAgentLog) return NextResponse.next();

	// Redirect logged-in users away from login page
	if (isLoginPage && isLoggedIn) {
		return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
	}

	// Return 401 for unauthenticated API requests
	if (!isLoggedIn && req.nextUrl.pathname.startsWith('/api/')) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Redirect unauthenticated users to login
	if (!isLoggedIn && !isLoginPage) {
		const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
		const loginUrl = new URL('/login', req.nextUrl);
		loginUrl.searchParams.set('callbackUrl', callbackUrl);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
});

export const config = {
	matcher: [
		// Match all paths except static files and images
		'/((?!_next/static|_next/image|favicon.ico|logo.svg).*)',
	],
};
