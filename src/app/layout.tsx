import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import ThemeRegistry from '@/components/ThemeRegistry';
import QueryProvider from '@/components/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
	title: 'Devora — Developer Dashboard',
	description: 'Personal developer dashboard for tracking tasks and issues',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale}>
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
			</head>
			<body style={{ margin: 0 }}>
				<NextIntlClientProvider messages={messages}>
					<QueryProvider>
						<ThemeRegistry>{children}</ThemeRegistry>
					</QueryProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
