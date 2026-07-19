/** @type {import('next').NextConfig} */
const nextConfig = {
  // JonDash is distributed as source and built on each machine. We already run
  // `npm run typecheck` and `npm run lint` in CI before every release, so the
  // per-machine build must NOT re-check them: it's redundant, slower, and — since
  // the launcher strips *.d.ts from node_modules to shrink the install — the
  // build-time type-check would fail for lack of declaration files.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
