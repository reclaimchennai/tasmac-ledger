/**
 * Seed the spelling rules into `name_rule`, then materialise `name_alias`.
 *
 * Idempotent, and safe to run after every reference harvest — which is the point
 * of it. Editing `product_line.name` in place would be undone the next time
 * `harvest:ref` re-read the upstream catalogue; an alias layer survives, and
 * keeps the raw upstream spelling available for comparison.
 */

import { db } from '../lib/db.js';
import { NAME_RULES, applyNameRules, type NameRule } from '../lib/name-rules.js';
import { istStamp } from '../lib/normalise.js';
import { log } from './util.js';

/** Entities whose names carry brand text worth correcting. */
const ENTITIES = [
  { entity: 'product_line', table: 'product_line', id: 'product_line_id', col: 'name' },
  { entity: 'sku', table: 'sku', id: 'sku_id', col: 'product_name' },
  { entity: 'supplier', table: 'supplier', id: 'supplier_id', col: 'name' },
] as const;

function seedRules(d: ReturnType<typeof db>): number[] {
  const insert = d.prepare(
    `INSERT INTO name_rule (kind, pattern, replacement, official, source, note, seq)
     VALUES (@kind, @pattern, @replacement, @official, @source, @note, @seq)
     ON CONFLICT(pattern, replacement) DO UPDATE SET
       kind = excluded.kind, official = excluded.official,
       source = excluded.source, note = excluded.note, seq = excluded.seq
     RETURNING rule_id`,
  );

  // Rule ids, positionally aligned with NAME_RULES, so `fired` indices map to
  // real rows for the audit trail.
  return NAME_RULES.map((r: NameRule, seq) => {
    const row = insert.get({
      kind: r.kind,
      pattern: r.pattern,
      replacement: r.replacement,
      official: r.official ?? null,
      source: r.source ?? null,
      note: r.note ?? null,
      seq,
    }) as { rule_id: number };
    return row.rule_id;
  });
}

export function fixNames(): { checked: number; corrected: number } {
  const d = db();
  const now = istStamp();
  const ruleIds = seedRules(d);
  log(`${ruleIds.length} spelling rules seeded`);

  const upsert = d.prepare(
    `INSERT INTO name_alias (entity, entity_id, raw_name, display_name, rules_applied, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity, entity_id) DO UPDATE SET
       raw_name = excluded.raw_name, display_name = excluded.display_name,
       rules_applied = excluded.rules_applied, updated_at = excluded.updated_at`,
  );
  const drop = d.prepare('DELETE FROM name_alias WHERE entity = ? AND entity_id = ?');

  let checked = 0;
  let corrected = 0;

  const run = d.transaction(() => {
    for (const e of ENTITIES) {
      const rows = d.prepare(`SELECT ${e.id} AS id, ${e.col} AS name FROM ${e.table}`).all() as {
        id: number;
        name: string;
      }[];

      for (const row of rows) {
        checked++;
        const { name, fired } = applyNameRules(row.name);
        if (name === row.name) {
          // A rule may have been withdrawn since the last run — clear the stale alias.
          drop.run(e.entity, row.id);
          continue;
        }
        corrected++;
        upsert.run(e.entity, row.id, row.name, name, fired.map((i) => ruleIds[i]).join(','), now);
      }
    }
  });
  run();

  return { checked, corrected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const { checked, corrected } = fixNames();
  log(`${corrected} of ${checked} names corrected in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // Show the product-line corrections, which are the ones a reader will notice.
  const rows = db()
    .prepare(
      `SELECT raw_name, display_name FROM name_alias
        WHERE entity = 'product_line' ORDER BY raw_name`,
    )
    .all() as { raw_name: string; display_name: string }[];
  for (const r of rows) log(`  ${r.raw_name}  →  ${r.display_name}`);
}
