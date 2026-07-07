import type { NextConfig } from "next";

const allowedDevOriginsFromEnv = String(process.env.ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.15.156',
    ...allowedDevOriginsFromEnv
  ],
  async rewrites() {
    const apiServerUrl = process.env.API_SERVER_URL || 'http://127.0.0.1:3001'

    return [
      {
        source: '/api/:path*',
        destination: `${apiServerUrl}/api/:path*`
      }
    ]
  }
};

export default nextConfig;
