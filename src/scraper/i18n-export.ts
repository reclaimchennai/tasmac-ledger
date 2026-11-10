/**
 * Export every English string and its Tamil, for review.
 *
 * The interface strings are hand-written and can be trusted to the extent the
 * author can be. The data names are a different matter: 4,154 of them were
 * produced by the transliterator in `src/lib/translit.ts`, and while it gets the
 * common cases right it has no way to know that "Velachery" is வேளச்சேரி rather
 * than வெலசெர்ய். Those need a native reader, or a model acting as one.
 *
 * So this writes two files:
 *
 *   i18n-review.csv   — every row, flat, for a spreadsheet or an LLM
 *   i18n-review.md    — the same grouped and annotated, with the instructions a
 *                       reviewer needs to give useful corrections back
 *
 * Corrections come back as CSV with the `tamil_corrected` column filled in, and
 * `npm run i18n:import` applies them.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../lib/db.js';
import { STRINGS } from '../lib/strings.js';
import { log } from './util.js';

const OUT_DIR = join(process.cwd(), 'data', 'i18n');

interface Row {
  /** ui | district | taluk | product_line | supplier | sku */
  kind: string;
  /** String key, or `entity:id` for data names. */
  id: string;
  english: string;
  tamil: string;
  /** curated | translit | machine — how the Tamil was produced. */
  method: string;
  /** Where it appears, so a reviewer can judge register and length. */
  context: string;
}

/** Where each interface key shows up, keyed on its prefix. */
const CONTEXT: [RegExp, string][] = [
  [/^nav\./, 'Main navigation and bottom tab bar — must stay short'],
  [/^masthead\.|^search\.|^theme\.|^lang\./, 'Site header'],
  [/^common\./, 'Buttons and pagination, used on every page'],
  [/^col\./, 'Table column heading — must stay short, sits in a narrow cell'],
  [/^category\./, 'Liquor category label'],
  [/^type\./, 'Supplier type label'],
  [/^brands\./, 'Brands listing page'],
  [/^districts\./, 'Districts listing page'],
  [/^suppliers\./, 'Suppliers listing page'],
  [/^catalogue\./, 'Catalogue listing page'],
  [/^shops\.|^scope\.|^class\./, 'Shops page and map filters'],
  [/^map\./, 'Map controls and legend'],
  [/^home\./, 'Front page'],
  [/^footer\./, 'Footer, every page'],
  [/^method\./, 'Method page — long-form prose, explanatory register'],
  [/^brand\./, 'Single brand page'],
  [/^district\./, 'Single district page'],
  [/^supplier\./, 'Single supplier page'],
  [/^sku\./, 'Single product page'],
  [/^shop\./, 'Single shop page'],
  [/^i18n\./, 'Translation provenance note'],
];

const contextFor = (key: string) => CONTEXT.find(([re]) => re.test(key))?.[1] ?? 'Interface';

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function exportForReview() {
  const d = db();
  const rows: Row[] = [];

  // ── interface strings ──
  for (const [key, entry] of Object.entries(STRINGS) as [string, { en: string; ta: string }][]) {
    rows.push({
      kind: 'ui', id: key, english: entry.en, tamil: entry.ta,
      method: 'curated', context: contextFor(key),
    });
  }

  // ── data names ──
  const dataRows = d
    .prepare(
      `SELECT entity, entity_id, text, method, source
         FROM name_i18n WHERE lang = 'ta'
        ORDER BY entity, entity_id`,
    )
    .all() as { entity: string; entity_id: number; text: string; method: string; source: string | null }[];

  const CONTEXT_BY_ENTITY: Record<string, string> = {
    district: 'Revenue district name — official Tamil spelling exists, use it',
    taluk: 'Taluk name — romanised Tamil, should be read back to Tamil, not sounded out as English',
    product_line: 'Liquor brand name — transliterate the sound, do not translate the meaning',
    supplier: 'Company name — transliterate; keep Pvt Ltd style suffixes readable',
    sku: 'Brand name plus size — same rule as product_line',
    liquor_type: 'Liquor category',
  };

  for (const r of dataRows) {
    rows.push({
      kind: r.entity,
      id: `${r.entity}:${r.entity_id}`,
      english: r.source ?? '',
      tamil: r.text,
      method: r.method,
      context: CONTEXT_BY_ENTITY[r.entity] ?? r.entity,
    });
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // ── CSV ──
  const header = 'kind,id,english,tamil_current,tamil_corrected,method,context';
  const csv = [
    header,
    ...rows.map((r) =>
      [r.kind, r.id, r.english, r.tamil, '', r.method, r.context].map(csvCell).join(','),
    ),
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'i18n-review.csv'), `${csv}\n`, 'utf8');

  // ── Markdown ──
  const byKind = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind)!.push(r);
  }

  const counts = [...byKind].map(([k, v]) => `${k}: ${v.length}`).join(' · ');
  const md: string[] = [
    '# TASMAC Ledger — Tamil review',
    '',
    `${rows.length} strings · ${counts}`,
    '',
    '## What this is',
    '',
    'An independent mirror of the Tamil Nadu State Marketing Corporation\'s public',
    'stock feed. It is a government stock register that updates every twenty minutes:',
    'the reader is looking up a shop or a price, not reading an essay. Tamil register',
    'should be plain and functional, matching the language on a government form.',
    '',
    '## What needs checking',
    '',
    '| Column | Meaning |',
    '| --- | --- |',
    '| `method: curated` | Hand-written. Check for register, tone and grammar. |',
    '| `method: translit` | Machine transliteration. **Most likely to be wrong.** |',
    '| `method: machine` | Machine translation. Check meaning. |',
    '',
    'The transliterated rows are the priority. Two different problems live there:',
    '',
    '1. **Place names** (`kind: taluk`) are romanised Tamil, so they should be *read',
    '   back*, not sounded out as English. The tool gets this wrong when the',
    '   romanisation is loose — it produced `வெலசெர்ய்` for Velachery, where the',
    '   Tamil is `வேளச்சேரி`. Vowel length and ல/ள/ழ, ர/ற, ன/ண/ந distinctions are',
    '   where it fails.',
    '2. **Brand and company names** (`kind: product_line`, `supplier`, `sku`) are',
    '   English and should be transliterated by sound, never translated. Kingfisher',
    '   the beer is `கிங்ஃபிஷர்`, not `மீன்கொத்தி`. Leave sizes, `VSOP`, `XO`, `ml`',
    '   and initialisms in Latin.',
    '',
    '## How to return corrections',
    '',
    'Edit `i18n-review.csv`, filling in the **`tamil_corrected`** column for any row',
    'that is wrong. Leave it empty where the current Tamil is fine — empty means',
    '"no change", not "blank it". Do not edit any other column: `id` is the key the',
    'corrections are matched on. Then run `npm run i18n:import`.',
    '',
    '## Constraints',
    '',
    '- `{name}` placeholders must survive exactly as they are, and may need to move',
    '  within the sentence for Tamil word order.',
    '- Rows whose context says "must stay short" sit in a table heading or a tab bar.',
    '  A translation twice the length of the English will break the layout.',
    '- `MRP`, `SKU`, `FL2`, `TASMAC` stay in Latin — they are what is printed on the',
    '  bottle and the shop board.',
    '',
  ];

  for (const [kind, list] of byKind) {
    md.push(`## ${kind} (${list.length})`, '');
    md.push('| id | English | Tamil now | method |');
    md.push('| --- | --- | --- | --- |');
    for (const r of list) {
      const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md.push(`| \`${r.id}\` | ${cell(r.english)} | ${cell(r.tamil)} | ${r.method} |`);
    }
    md.push('');
  }

  writeFileSync(join(OUT_DIR, 'i18n-review.md'), md.join('\n'), 'utf8');

  return { rows: rows.length, byKind: [...byKind].map(([k, v]) => [k, v.length] as const) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, byKind } = exportForReview();
  log(`${rows} strings written to data/i18n/`);
  for (const [kind, n] of byKind) log(`  ${kind}: ${n}`);
}
