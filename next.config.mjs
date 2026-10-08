import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'export',
  // Static export normally emits flat files (out/dashboard.html) — a direct
  // request or hard refresh on /dashboard 404s unless the host has a
  // rewrite rule mapping extensionless paths to .html files, which Vercel
  // doesn't do by default for a plain static export. trailingSlash instead
  // emits out/dashboard/index.html, which every static host (Vercel
  // included) serves correctly for /dashboard or /dashboard/ with zero
  // extra config — the standard, host-agnostic fix for this exact class of
  // bug, not a Vercel-specific workaround.
  trailingSlash: true,
  // Pins the workspace root to this project folder. Without this, Next.js
  // auto-detects the root by walking up for the nearest lockfile — and a
  // stray package-lock.json one level up (e.g. from a zip once extracted
  // directly onto the Desktop instead of into its own folder) gets picked
  // instead, which is wrong and produces a build-time warning.
  outputFileTracingRoot: path.resolve(process.cwd()),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(process.cwd(), "src"),
    };
    return config;
  },
};

export default nextConfig;
