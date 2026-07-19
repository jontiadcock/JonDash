/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained .next/standalone server (only the traced runtime files),
  // so the install doesn't carry the full node_modules at runtime.
  output: "standalone",

  // These native / generated packages are loaded via computed paths that the file
  // tracer (@vercel/nft) can miss. Force-include their binaries so the standalone
  // server is genuinely self-contained (Prisma query engine, argon2, sharp).
  outputFileTracingIncludes: {
    "/**": [
      "lib/generated/prisma/**/*",
      "node_modules/@node-rs/argon2/**/*",
      "node_modules/@node-rs/argon2-win32-x64-msvc/**/*",
      "node_modules/sharp/**/*",
      "node_modules/@img/**/*",
    ],
  },
};

export default nextConfig;
