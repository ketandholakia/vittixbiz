import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Reads env at runtime from process.env; all env vars referenced by the app
  // must be NEXT_PUBLIC_* so they are inlined into the client bundle.
  reactStrictMode: true,
};

export default nextConfig;
