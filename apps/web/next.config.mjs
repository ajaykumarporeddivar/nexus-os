/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexus-os/shared-types', '@nexus-os/ui'],
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', '@prisma/client'],
  },
  // Enable standalone output for Docker deployments (Enterprise on-premise)
  ...(process.env.DOCKER_BUILD === '1' && { output: 'standalone' }),
}

export default nextConfig
