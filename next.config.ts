import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
	serverExternalPackages: ['node-pty', 'ws'],
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
