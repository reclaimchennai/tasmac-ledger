/**
 * Fill `name_i18n` with Tamil for everything the site displays as data.
 *
 * There is nothing Tamil to mirror: `dashboard-api.tasmace2e.in` returns English
 * for every endpoint regardless of `Accept-Language` or a `lang` body parameter,
 * tasmac.tn.gov.in has no Tamil edition, and the TNGIS layers carry English
 * attributes only. So Tamil is generated here, by three routes, and each row is
 * stamped with which one produced it:
 *
 *   curated  — written by hand. The 38 revenue districts and the liquor
 *              categories, where a standard Tamil form exists and matters.
 *   machine  — a translation API, used only if TRANSLATE_API_KEY is set.
 *   translit — rule-based Latin→Tamil respelling. The default for proper nouns,
 *              and the right answer for them: a brand name should be respelt,
 *              not translated.
 *
 * Re-runnable; only writes rows that are missing or whose English source moved.
 */

import { db } from '../lib/db.js';
import { istStamp } from '../lib/normalise.js';
import { toTamilPlace, toTamilScript } from '../lib/translit.js';
import { log } from './util.js';

const LANG = 'ta';

/**
 * The 38 revenue districts in Tamil, as the Tamil Nadu government writes them.
 * Hand-written: these are the names on every official form, and a transliterator
 * would produce plausible-looking but wrong spellings for most of them.
 */
const DISTRICTS_TA: Record<string, string> = {
  Ariyalur: 'அரியலூர்',
  Chengalpattu: 'செங்கல்பட்டு',
  Chennai: 'சென்னை',
  Coimbatore: 'கோயம்புத்தூர்',
  Cuddalore: 'கடலூர்',
  Dharmapuri: 'தருமபுரி',
  Dindigul: 'திண்டுக்கல்',
  Erode: 'ஈரோடு',
  Kallakurichi: 'கள்ளக்குறிச்சி',
  Kancheepuram: 'காஞ்சிபுரம்',
  Kanniyakumari: 'கன்னியாகுமரி',
  Karur: 'கரூர்',
  Krishnagiri: 'கிருஷ்ணகிரி',
  Madurai: 'மதுரை',
  Mayiladuthurai: 'மயிலாடுதுறை',
  Nagapattinam: 'நாகப்பட்டினம்',
  Namakkal: 'நாமக்கல்',
  Nilgiris: 'நீலகிரி',
  Perambalur: 'பெரம்பலூர்',
  Pudukkottai: 'புதுக்கோட்டை',
  Ramanathapuram: 'இராமநாதபுரம்',
  Ranipet: 'இராணிப்பேட்டை',
  Salem: 'சேலம்',
  Sivagangai: 'சிவகங்கை',
  Tenkasi: 'தென்காசி',
  Thanjavur: 'தஞ்சாவூர்',
  Theni: 'தேனி',
  Thiruchirappalli: 'திருச்சிராப்பள்ளி',
  Thirupathur: 'திருப்பத்தூர்',
  Thiruvarur: 'திருவாரூர்',
  Thoothukudi: 'தூத்துக்குடி',
  Tirunelveli: 'திருநெல்வேலி',
  Tiruppur: 'திருப்பூர்',
  Tiruvallur: 'திருவள்ளூர்',
  Tiruvannamalai: 'திருவண்ணாமலை',
  Vellore: 'வேலூர்',
  Viluppuram: 'விழுப்புரம்',
  Virudhunagar: 'விருதுநகர்',
};

/** Liquor categories, hand-written — these are ordinary Tamil words. */
const LIQUOR_TA: Record<string, string> = {
  BEER: 'பீர்',
  BRANDY: 'பிராந்தி',
  WHISKY: 'விஸ்கி',
  RUM: 'ரம்',
  GIN: 'ஜின்',
  VODKA: 'ஓட்கா',
  WINE: 'ஒயின்',
  OTHER: 'மற்றவை',
};

/**
 * Machine translation, used only when a key is configured. Google Cloud
 * Translation v2, because it is the one that takes a plain API key rather than a
 * service-account dance. Without a key this returns null and every caller falls
 * back to transliteration.
 */
async function machineTranslate(texts: string[]): Promise<string[] | null> {
  const key = process.env.TRANSLATE_API_KEY;
  if (!key) return null;
  const endpoint = process.env.TRANSLATE_API ?? 'https://translation.googleapis.com/language/translate/v2';

  const out: string[] = [];
  // The v2 endpoint takes repeated `q` parameters; 100 per call is well inside
  // the documented request-size limit for strings this short.
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const body = new URLSearchParams({ target: LANG, source: 'en', format: 'text' });
    for (const t of batch) body.append('q', t);

    const res = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`translate → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data: { translations: { translatedText: string }[] } };
    out.push(...json.data.translations.map((t) => t.translatedText));
    log(`  machine-translated ${out.length}/${texts.length}`);
  }
  return out;
}

interface Job {
  entity: string;
  rows: { id: number; text: string }[];
  /** Hand-written map keyed on the English text. */
  curated?: Record<string, string>;
  /** Proper nouns are transliterated even when an MT key is available. */
  properNoun: boolean;
  /**
   * Tamil place names are romanised Tamil, not English, and are read back
   * rather than sounded out. Brand names are the other way round.
   */
  place?: boolean;
}

export async function translate(opts: { force?: boolean; redoCurated?: boolean } = {}) {
  const d = db();
  const now = istStamp();

  const jobs: Job[] = [
    {
      entity: 'district',
      rows: d.prepare('SELECT district_id AS id, name AS text FROM district').all() as Job['rows'],
      curated: DISTRICTS_TA,
      properNoun: true,
    },
    {
      entity: 'liquor_type',
      rows: d.prepare('SELECT liquor_type_id AS id, category AS text FROM liquor_type').all() as Job['rows'],
      curated: LIQUOR_TA,
      properNoun: false,
    },
    {
      entity: 'taluk',
      rows: d.prepare('SELECT taluk_id AS id, name AS text FROM taluk').all() as Job['rows'],
      properNoun: true,
      place: true,
    },
    {
      // The corrected spelling, not the raw one — Tamil should follow the fix.
      entity: 'product_line',
      rows: d
        .prepare(
          `SELECT pl.product_line_id AS id, COALESCE(a.display_name, pl.name) AS text
             FROM product_line pl
             LEFT JOIN name_alias a ON a.entity = 'product_line' AND a.entity_id = pl.product_line_id`,
        )
        .all() as Job['rows'],
      properNoun: true,
    },
    {
      entity: 'supplier',
      rows: d
        .prepare(
          `SELECT sup.supplier_id AS id, COALESCE(a.display_name, sup.name) AS text
             FROM supplier sup
             LEFT JOIN name_alias a ON a.entity = 'supplier' AND a.entity_id = sup.supplier_id`,
        )
        .all() as Job['rows'],
      properNoun: true,
    },
    {
      entity: 'sku',
      rows: d
        .prepare(
          `SELECT s.sku_id AS id, COALESCE(a.display_name, s.product_name) AS text
             FROM sku s
             LEFT JOIN name_alias a ON a.entity = 'sku' AND a.entity_id = s.sku_id`,
        )
        .all() as Job['rows'],
      properNoun: true,
    },
  ];

  const upsert = d.prepare(
    `INSERT INTO name_i18n (entity, entity_id, lang, text, method, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity, entity_id, lang) DO UPDATE SET
       text = excluded.text, method = excluded.method,
       source = excluded.source, updated_at = excluded.updated_at`,
  );
  const prior = d
    .prepare('SELECT entity, entity_id, source, method FROM name_i18n WHERE lang = ?')
    .all(LANG) as { entity: string; entity_id: number; source: string | null; method: string }[];
  const existing = new Map(prior.map((r) => [`${r.entity}:${r.entity_id}`, r.source]));

  /*
    Rows a human has reviewed, and which the generator must not overwrite —
    including under `--force`, which is otherwise "redo everything". A reviewer
    working through 4,000 transliterations should not lose that work to a routine
    re-run, so passing over them is the default and `--redo-curated` is the
    explicit way to say otherwise.
  */
  const curated = new Set(
    prior.filter((r) => r.method === 'curated').map((r) => `${r.entity}:${r.entity_id}`),
  );

  const hasKey = Boolean(process.env.TRANSLATE_API_KEY);
  log(hasKey ? 'TRANSLATE_API_KEY set — machine translation enabled' : 'no TRANSLATE_API_KEY — transliterating instead');

  for (const job of jobs) {
    // Skip rows already translated from the same English source, unless forced —
    // and skip reviewed rows either way, unless explicitly told to redo them.
    const todo = job.rows.filter((r) => {
      const key = `${job.entity}:${r.id}`;
      if (curated.has(key) && !opts.redoCurated) return false;
      return opts.force || existing.get(key) !== r.text;
    });
    if (todo.length === 0) {
      log(`${job.entity}: up to date`);
      continue;
    }

    const curatedHits = job.curated ? todo.filter((r) => job.curated![r.text]) : [];
    const rest = todo.filter((r) => !job.curated?.[r.text]);

    // Proper nouns are transliterated whether or not a key is present; only
    // ordinary words go to the translation API.
    let machine: string[] | null = null;
    if (!job.properNoun && rest.length) machine = await machineTranslate(rest.map((r) => r.text));

    const write = d.transaction(() => {
      for (const r of curatedHits) {
        upsert.run(job.entity, r.id, LANG, job.curated![r.text], 'curated', r.text, now);
      }
      rest.forEach((r, i) => {
        const text = machine?.[i] ?? (job.place ? toTamilPlace(r.text) : toTamilScript(r.text));
        upsert.run(job.entity, r.id, LANG, text, machine ? 'machine' : 'translit', r.text, now);
      });
    });
    write();

    log(
      `${job.entity}: ${todo.length} written` +
        (curatedHits.length ? ` (${curatedHits.length} curated)` : '') +
        (machine ? ` (${rest.length} machine)` : rest.length ? ` (${rest.length} transliterated)` : ''),
    );
  }

  const summary = d
    .prepare('SELECT method, COUNT(*) AS n FROM name_i18n WHERE lang = ? GROUP BY method')
    .all(LANG) as { method: string; n: number }[];
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const redoCurated = process.argv.includes('--redo-curated');
  translate({ force, redoCurated })
    .then((summary) => {
      for (const s of summary) log(`${s.method}: ${s.n}`);
    })
    .catch((e) => {
      log(`failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
}
