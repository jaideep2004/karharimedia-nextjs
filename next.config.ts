import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['archiver', 'exceljs'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
