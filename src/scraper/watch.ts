/**
 * Continuous harvester.
 *
 * Upstream refreshes a shop's `last_updated_time` roughly every half hour and all
 * shops in a district move together, so polling much faster than that only burns
 * bandwidth. Twenty minutes gives us a comfortable margin against drift without
 * missing a refresh cycle.
 *
 *   npx tsx src/scraper/watch.ts [--every=20] [--reference-every=24]
 *
 * Reference data (catalogue, prices, shop locations) changes on the order of days,
 * so it is re-harvested once a day rather than every cycle.
 */
import { harvestStock } from './harvest-stock';
import { harvestReference } from './harvest-reference';
import { rebuildRollups } from './rollup';
import { rebuildAnalytics, tradingDay } from './analytics';
import { db } from '../lib/db';
import { rollEventFirsts } from '../lib/event-counts';
import { fixNames } from './fix-names';
import { translate } from './translate';
import { istDay } from '../lib/normalise';
import { log } from './util';

const argOf = (name: string, fallback: number) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : fallback;
};

const everyMs = argOf('every', 20) * 60_000;
const referenceEveryMs = argOf('reference-every', 24) * 3_600_000;

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log(`${sig} received — finishing current cycle then stopping`);
    stopping = true;
  });
}

async function main() {
  let lastReference = 0;
  for (let cycle = 1; !stopping; cycle++) {
    const started = Date.now();
    try {
      if (started - lastReference > referenceEveryMs) {
        await harvestReference();
        // Both of these follow the reference harvest and only the reference
        // harvest: they derive from the catalogue, so they are stale the moment
        // a new product line appears and pointless to redo at stock cadence.
        // Corrections first — the Tamil is generated from the corrected
        // spelling, not the raw one.
        const { corrected, checked } = fixNames();
        log(`${corrected} of ${checked} names corrected`);
        await translate();
        lastReference = started;
      }
      await harvestStock();
      // Only today's rollups need recomputing; yesterday's are already final
      // unless a late snapshot lands, which the day boundary handles anyway.
      rebuildRollups(istDay());
      // The trading day in progress and the one before it: the previous
      // evening's last hour is still arriving after midnight.
      rebuildAnalytics(tradingDay(new Date(Date.now() - 86_400_000)));
      rollEventFirsts(db());
    } catch (err) {
      log(`cycle ${cycle} failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (stopping) break;
    const waitMs = Math.max(30_000, everyMs - (Date.now() - started));
    log(`cycle ${cycle} complete — sleeping ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  log('watcher stopped');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
