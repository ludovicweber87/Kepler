import type { Metadata } from 'next';
import ThemeRegistry from '@/components/ThemeRegistry';
import QueryProvider from '@/components/QueryProvider';
import AppShell from '@/components/layout/AppShell';
import './globals.css';

export const metadata: Metadata = {
	title: 'Devora — Developer Dashboard',
	description: 'Personal developer dashboard for tracking tasks and issues',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body style={{ margin: 0 }}>
				<QueryProvider>
					<ThemeRegistry>
						<AppShell>{children}</AppShell>
					</ThemeRegistry>
				</QueryProvider>
			</body>
		</html>
	);
}
