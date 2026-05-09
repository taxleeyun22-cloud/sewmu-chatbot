import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_RELEASE: process.env.CF_PAGES_COMMIT_SHA || 'dev',
  },
};

export default nextConfig;
