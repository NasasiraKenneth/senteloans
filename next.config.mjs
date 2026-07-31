/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/sacco',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
