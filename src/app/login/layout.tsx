import ThemeRegistry from '@/components/ThemeRegistry';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
	return <ThemeRegistry>{children}</ThemeRegistry>;
}
