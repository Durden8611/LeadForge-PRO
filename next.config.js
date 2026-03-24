/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // ESLint runs separately in CI; skip during Vercel build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // No TypeScript in this project; ignore any stray .d.ts errors
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
