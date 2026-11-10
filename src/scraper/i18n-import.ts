/**
 * Apply reviewed Tamil corrections from `data/i18n/i18n-review.csv`.
 *
 * Data names go straight into `name_i18n`, marked `curated` so a later
 * `npm run translate` will not overwrite a human's work with the transliterator's
 * guess. Interface strings cannot be written from here — they live in
 * `src/lib/strings.ts` under version control — so those are printed as a patch
 * to paste, which keeps the source of truth in the repo rather than the database.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../lib/db.js';
import { STRINGS } from '../lib/strings.js';
import { istStamp } from '../lib/normalise.js';
import { log } from './util.js';

const CSV_PATH = process.argv[2] ?? join(process.cwd(), 'data', 'i18n', 'i18n-review.csv');

/** Minimal RFC 4180 reader — quoted fields, doubled quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}

export function importCorrections(path = CSV_PATH) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length < 2) throw new Error(`${path}: no rows`);

  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${path}: missing column "${name}"`);
    return i;
  };
  const iKind = col('kind');
  const iId = col('id');
  const iCur = col('tamil_current');
  const iNew = col('tamil_corrected');

  const d = db();
  const now = istStamp();
  const upsert = d.prepare(
    `INSERT INTO name_i18n (entity, entity_id, lang, text, method, source, updated_at)
     VALUES (?, ?, 'ta', ?, 'curated', ?, ?)
     ON CONFLICT(entity, entity_id, lang) DO UPDATE SET
       text = excluded.text, method = 'curated', updated_at = excluded.updated_at`,
  );

  const uiChanges: { key: string; from: string; to: string }[] = [];
  let dataChanges = 0;
  let skippedUnknown = 0;

  const run = d.transaction(() => {
    for (const r of rows.slice(1)) {
      const corrected = (r[iNew] ?? '').trim();
      // Empty means "no change" — never "blank it".
      if (!corrected || corrected === (r[iCur] ?? '').trim()) continue;

      const kind = r[iKind];
      const id = r[iId];

      if (kind === 'ui') {
        if (!(id in STRINGS)) { skippedUnknown++; continue; }
        uiChanges.push({ key: id, from: (STRINGS as Record<string, { ta: string }>)[id].ta, to: corrected });
        continue;
      }

      const [entity, rawId] = id.split(':');
      const entityId = Number(rawId);
      if (!entity || !Number.isFinite(entityId)) { skippedUnknown++; continue; }
      // `source` keeps the English the correction was made against, so a later
      // upstream rename shows up as a mismatch rather than silently going stale.
      upsert.run(entity, entityId, corrected, r[header.indexOf('english')] ?? null, now);
      dataChanges++;
    }
  });
  run();

  // Interface strings are code, so they come back as a patch rather than a write.
  if (uiChanges.length) {
    const patch = uiChanges
      .map((c) => `  '${c.key}': ta was ${JSON.stringify(c.from)}\n${' '.repeat(4)}now ${JSON.stringify(c.to)}`)
      .join('\n');
    const out = join(process.cwd(), 'data', 'i18n', 'ui-corrections.txt');
    writeFileSync(out, `${patch}\n`, 'utf8');
  }

  return { dataChanges, uiChanges, skippedUnknown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dataChanges, uiChanges, skippedUnknown } = importCorrections();
  log(`${dataChanges} data names updated (marked curated, safe from re-translation)`);
  if (uiChanges.length) {
    log(`${uiChanges.length} interface strings need editing in src/lib/strings.ts:`);
    for (const c of uiChanges) log(`  ${c.key}: ${c.from}  →  ${c.to}`);
    log('written to data/i18n/ui-corrections.txt');
  }
  if (skippedUnknown) log(`${skippedUnknown} rows skipped — unrecognised id`);
}
