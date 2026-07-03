/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  // @napi-rs/canvas ships a native .node binary that must not be webpack-bundled.
  serverExternalPackages: ['@napi-rs/canvas'],
  // Ensure the font files are bundled with the serverless functions that render
  // the text overlay (server-side canvas reads them from disk at runtime).
  outputFileTracingIncludes: {
    '/api/compose-text': ['./fonts/**'],
    '/api/bulk-generate': ['./fonts/**'],
  },
  experimental: {
    // Allow larger FormData uploads (background + main + alternatives + objects)
    middlewareClientMaxBodySize: '50mb',
  },
};

module.exports = nextConfig;
