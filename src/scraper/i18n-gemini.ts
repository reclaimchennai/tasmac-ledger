/**
 * Run the whole corpus past Gemini and collect its Tamil.
 *
 * This is the reviewer step, automated: `i18n-export` produces the questions,
 * this answers them, and `i18n-import` applies whatever survives. Output goes
 * into the CSV's `tamil_corrected` column rather than straight into the database,
 * so the result is a reviewable diff and not an unattended overwrite.
 *
 * Three things make the difference between usable output and noise here:
 *
 *   Kind-specific instructions. A taluk name, a brand name and a column heading
 *   need three different operations — read back, transliterate, translate — and
 *   one prompt asking for "Tamil" gets all three wrong some of the time.
 *
 *   The current Tamil goes in with the English. Most of it is right, and showing
 *   the model what is already there stops it rewriting good strings for the sake
 *   of it, and anchors the register.
 *
 *   Resumability. A hundred-odd requests will not all succeed; the CSV is
 *   rewritten after every batch, and a re-run skips rows that already have an
 *   answer. Interrupt it and start it again.
 *
 * Needs GEMINI_API_KEY. Never called at runtime — this is a build-time tool.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { log } from './util.js';

config({ path: '.env.local' });
config({ path: '.env' });

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CSV_PATH = join(process.cwd(), 'data', 'i18n', 'i18n-review.csv');

/** Batch size is a trade between prompt overhead and how much the model has to hold. */
const BATCH = 40;
/**
 * One request at a time, with a pause between them. The free tier rate-limits on
 * requests per minute, and four in parallel walked straight into 429s and spent
 * longer backing off than it would have taken to go steadily.
 */
const CONCURRENCY = 1;
const PAUSE_MS = 2_000;

// ─────────────────────────── prompts ───────────────────────────

const SHARED = `You are translating the interface and data of an independent public-interest
website that mirrors the Tamil Nadu State Marketing Corporation (TASMAC) liquor stock feed.
Its readers are ordinary people in Tamil Nadu checking what a shop has in stock and what it
costs.

REGISTER — this matters more than anything else:
Write the Tamil that a Chennai newspaper would print in a consumer-affairs story. Everyday
spoken vocabulary, but written correctly and respectfully — not literary Tamil
(செந்தமிழ்), not textbook translationese, not English word order with Tamil words.

SCRIPT — the page must read as Tamil, not as English with Tamil around it:
Almost nothing should remain in the Latin alphabet. Where an English word is genuinely the
word Tamil speakers use, write it in TAMIL SCRIPT (பீர், விஸ்கி, பாட்டில், ஸ்டாக்) rather
than leaving it in Latin letters. Where a natural Tamil word exists and is actually used,
prefer it.

The ONLY things that stay in Latin letters:
- MRP — it is printed that way on every bottle and every price list.
- TASMAC — the organisation's own name.
- Digits: 650, 2026, 1800-425-2041.
Everything else becomes Tamil script, including units (ml → மி.லி, L → லி), grade marks
(VSOP → வி.எஸ்.ஓ.பி, XO → எக்ஸ்.ஓ), licence classes (FL2 → எஃப்.எல்.2), and abbreviations
(SKU → வகை or பொருள் வகை, whichever reads better in context).

HARD RULES:
- Preserve every {placeholder} exactly as written. You may move it for Tamil word order.
- Never add explanation, romanisation, or alternatives. One Tamil string per item.

Return ONLY a JSON array of {"id": string, "ta": string}. No prose, no markdown fence.`;

const KIND_PROMPT: Record<string, string> = {
  ui: `${SHARED}

These are interface strings. Column headings and buttons must stay SHORT — they sit in
narrow table cells and a bottom tab bar, and a string twice the length of the English
breaks the layout. Prose strings can breathe. Terms of art should be consistent across the
whole set: pick one Tamil term for "stock", one for "shop", one for "value at MRP", and use
it everywhere.`,

  taluk: `${SHARED}

These are Tamil place names that have been written in the Latin alphabet. Do NOT sound them
out as if they were English words — recover the Tamil name they represent. The romanisation
is lossy and you must restore what it dropped: vowel length, and the ல/ள/ழ, ர/ற, ன/ண/ந
distinctions. "Velachery" is வேளச்சேரி. "Sholinganallur" is சோழிங்கநல்லூர். "Alandur" is
ஆலந்தூர். If a name is genuinely ambiguous, choose the spelling the Tamil Nadu government
uses on its own revenue records.`,

  district: `${SHARED}

Revenue district names. Use the official Tamil spelling that appears on Tamil Nadu
government forms.`,

  product_line: `${SHARED}

Liquor brand names. TRANSLITERATE the sound into Tamil script — never translate the
meaning. "Kingfisher" the beer is கிங்ஃபிஷர், never மீன்கொத்தி. "Old Monk" is ஓல்ட் மங்க்.
Descriptive words that are part of the name (Premium, Strong, Deluxe, Reserve) are also
transliterated, not translated, because that is how they are printed on the label. Grade
marks go into Tamil script as well: VSOP → வி.எஸ்.ஓ.பி, XO → எக்ஸ்.ஓ, XXX → எக்ஸ்.எக்ஸ்.எக்ஸ்.
Digits stay as digits.`,

  sku: `${SHARED}

Liquor product names, brand plus bottle size. Same rule as brands: transliterate the sound,
never translate the meaning. Sizes keep their digits but take a Tamil unit:
"650ml" → "650 மி.லி", "1000ml" → "1000 மி.லி".`,

  supplier: `${SHARED}

Company names — distilleries, breweries and importers. Transliterate. Keep corporate
suffixes readable: "Private Limited" becomes பிரைவேட் லிமிடெட், "M/s." can be dropped.
Nothing stays in Latin letters.`,

  liquor_type: `${SHARED}

Liquor categories. These are ordinary words a shopper uses: பீர், பிராந்தி, விஸ்கி, ரம்,
ஜின், ஓட்கா, ஒயின்.`,
};

// ─────────────────────────── CSV ───────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
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

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

// ─────────────────────────── API ───────────────────────────

interface Item { id: string; en: string; ta: string; context: string }

async function callGemini(kind: string, items: Item[], attempt = 0): Promise<Map<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set (put it in .env.local)');

  const body = {
    contents: [{
      parts: [{
        text: `${KIND_PROMPT[kind] ?? KIND_PROMPT.ui}\n\nItems (\`ta_now\` is the existing Tamil — keep it if it is already right):\n${
          JSON.stringify(items.map((i) => ({ id: i.id, en: i.en, ta_now: i.ta, context: i.context })))
        }`,
      }],
    }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // 429 and 5xx are worth waiting out; anything else will not improve on retry.
    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < 5) {
      const wait = Math.min(60_000, 3_000 * 2 ** attempt);
      log(`  ${res.status} — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return callGemini(kind, items, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    if (attempt < 3) return callGemini(kind, items, attempt + 1);
    throw new Error('empty response');
  }

  let parsed: { id: string; ta: string }[];
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\n?|\n?```$/g, ''));
  } catch {
    if (attempt < 3) { log('  unparseable JSON — retrying'); return callGemini(kind, items, attempt + 1); }
    throw new Error(`unparseable: ${raw.slice(0, 200)}`);
  }

  const out = new Map<string, string>();
  for (const p of parsed) {
    if (!p?.id || typeof p.ta !== 'string' || !p.ta.trim()) continue;
    out.set(p.id, p.ta.trim());
  }
  return out;
}

/** Bounded-concurrency runner that keeps going when one batch fails. */
async function runBatches(
  batches: { kind: string; items: Item[] }[],
  onDone: (got: Map<string, string>) => void,
) {
  let next = 0;
  let done = 0;
  let failed = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= batches.length) return;
      const b = batches[i];
      try {
        const got = await callGemini(b.kind, b.items);
        onDone(got);
        done++;
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      } catch (e) {
        failed++;
        log(`  batch ${i + 1} (${b.kind}) failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      if ((done + failed) % 5 === 0 || done + failed === batches.length) {
        log(`  ${done + failed}/${batches.length} batches (${failed} failed)`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return { done, failed };
}

// ─────────────────────────── main ───────────────────────────

export async function translateWithGemini(opts: { only?: string[]; redo?: boolean } = {}) {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const header = rows[0];
  const idx = (n: string) => header.indexOf(n);
  const [iKind, iId, iEn, iCur, iNew, , iCtx] =
    ['kind', 'id', 'english', 'tamil_current', 'tamil_corrected', 'method', 'context'].map(idx);

  const body = rows.slice(1);
  const pending: { kind: string; items: Item[] }[] = [];
  const byKind = new Map<string, Item[]>();

  for (const r of body) {
    const kind = r[iKind];
    if (opts.only?.length && !opts.only.includes(kind)) continue;
    // Already answered on an earlier run — leave it be unless asked to redo.
    if (!opts.redo && (r[iNew] ?? '').trim()) continue;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push({ id: r[iId], en: r[iEn], ta: r[iCur], context: r[iCtx] });
  }

  for (const [kind, items] of byKind) {
    for (let i = 0; i < items.length; i += BATCH) {
      pending.push({ kind, items: items.slice(i, i + BATCH) });
    }
  }

  const total = [...byKind.values()].reduce((a, v) => a + v.length, 0);
  if (!total) { log('nothing to do — every row already has an answer (use --redo to redo)'); return; }
  log(`${total} strings in ${pending.length} batches, model ${MODEL}`);

  const rowById = new Map(body.map((r) => [r[iId], r]));
  let written = 0;
  let unchanged = 0;

  const flush = () => writeFileSync(CSV_PATH, toCsv([header, ...body]), 'utf8');

  const { failed } = (await runBatches(pending, (got) => {
    for (const [id, ta] of got) {
      const row = rowById.get(id);
      if (!row) continue;
      // Only record it as a correction if it actually differs — an unchanged row
      // should stay empty so the import skips it.
      if (ta === row[iCur]) { unchanged++; continue; }
      row[iNew] = ta;
      written++;
    }
    flush(); // after every batch, so an interrupted run loses nothing
  })) ?? { failed: 0 };

  flush();
  log(`${written} corrections written, ${unchanged} already correct, ${failed} batches failed`);
  log(`review data/i18n/i18n-review.csv, then: npm run i18n:import`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const only = args.filter((a) => !a.startsWith('--'));
  translateWithGemini({ only, redo: args.includes('--redo') }).catch((e) => {
    log(`failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
