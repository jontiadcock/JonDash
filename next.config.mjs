/** @type {import('next').NextConfig} */
const nextConfig = {
  // JonDash is distributed as source and built on each machine. We already run
  // `npm run typecheck` in CI before every release, so the per-machine build must
  // NOT re-type-check: it's redundant, slower, and — since the launcher strips
  // *.d.ts from node_modules to shrink the install — the build-time type-check
  // would otherwise fail for lack of declaration files. (Next 16 no longer runs
  // ESLint during the build, so nothing to disable there.)
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Server Actions bodies default to 1 MB — too small for a 2 MB icon upload or
    // a backup restore, which caused an unhandled 413 crash. Raise the ceiling so
    // those requests reach our own size checks (which return a friendly message).
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
