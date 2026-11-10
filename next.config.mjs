/**
 * The build directory is overridable, and `npm run dev` overrides it.
 *
 * This checkout runs a production server continuously — `next start` off `.next`,
 * behind the tunnel — so a `next dev` or `next build` in the same tree used to
 * scribble over the artefacts the live site was serving from, and take it down
 * until the next rebuild. Development gets `.next-dev` instead; the two no
 * longer touch.
 *
 * @type {import('next').NextConfig}
 */
export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-sqlite3'],
  experimental: { workerThreads: false },
};
