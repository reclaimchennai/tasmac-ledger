/**
 * Server start-up hook (Next.js instrumentation).
 *
 * Keeps the /db dashboard's statewide figures warm. They take a few seconds to
 * aggregate and are cached until the analysis window moves on (once per
 * trading day, at 11:00), so without this the first reader after every
 * restart, and every morning, waits for them. Checking every ten minutes is a
 * cache lookup when nothing has moved.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { dashboard } = await import('./lib/dashboard');
  const warm = () => {
    try {
      dashboard(null);
    } catch (e) {
      console.error('dashboard warm-up failed:', e instanceof Error ? e.message : e);
    }
  };
  setTimeout(warm, 2_000);
  setInterval(warm, 10 * 60_000).unref();
}
