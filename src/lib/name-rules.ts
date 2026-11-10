/**
 * Official-spelling reference for the upstream catalogue.
 *
 * TASMAC's product list spells the same brand more than one way. "KINGFISHER
 * MAGNUM STRONG BEER" and "KING FISHER SELECT PREMIUM BEER" are both United
 * Breweries lines under one registered mark; "Dewar", "Dewars" and "Dewar's" are
 * one whisky. None of this is a duplicate row to be merged — the product lines
 * are genuinely different products — it is the *brand name inside them* that is
 * inconsistent, so the fix is a spelling rule, not a merge.
 *
 * Each rule records the registered spelling it enforces and where that spelling
 * was verified, so the list is reviewable rather than a pile of magic strings.
 * The rules are seeded into `name_rule` and the result materialised into
 * `name_alias` by `npm run fix:names`; nothing here ever edits the upstream text.
 *
 * Deliberately NOT corrected, though the matcher surfaced them: ACCORD vs
 * ACCORDS, IMPERIAL vs IMPERIALS, CHEVALIER vs CHEVALIERS and NAPOLEON vs
 * NAPOLEAN are separate registered marks, not misspellings of each other; and
 * age or strength variants (Dewar's 12/15/18, Glenfiddich 12/15/18, SNJ
 * 10000/20000, Sterren 7/8, VS/VSOP/XO) are different products that merely look
 * alike to an edit-distance check.
 */

export interface NameRule {
  kind: 'mojibake' | 'brand' | 'style';
  /** Regex source, applied case-insensitively and globally. */
  pattern: string;
  replacement: string;
  /** The registered spelling this enforces. */
  official?: string;
  /** Where that spelling was verified. */
  source?: string;
  note?: string;
}

/**
 * Mojibake repair, first.
 *
 * Six catalogue entries carry UTF-8 that was decoded as GBK somewhere upstream:
 * the bytes for È (C3 88) came back as 脠, and a non-breaking space (C2 A0) as
 * 聽. Repaired by mapping the observed characters back to what they encode.
 */
const MOJIBAKE: NameRule[] = [
  { kind: 'mojibake', pattern: '\\u807D', replacement: ' ', note: 'GBK reading of U+00A0 no-break space' },
  { kind: 'mojibake', pattern: '\\u9225\\u6A6D', replacement: '’O', note: 'GBK reading of U+2019 + "O" — CELLIER D’OR' },
  { kind: 'mojibake', pattern: '\\u8120', replacement: 'È', note: 'GBK reading of U+00C8 È — CRÈME' },
  { kind: 'mojibake', pattern: '\\u8121', replacement: 'É', note: 'GBK reading of U+00C9 É — CUVÉE' },
];

/**
 * Split-word variants — the class the Kingfisher case belongs to: one registered
 * mark written both as one word and as two, in the same catalogue.
 */
const SPLIT_WORD: NameRule[] = [
  {
    kind: 'brand',
    pattern: '\\bKING\\s+FISHER\\b',
    replacement: 'Kingfisher',
    official: 'Kingfisher',
    source: 'United Breweries Ltd — registered mark, one word',
    note: '3 lines spelt it as two words; 8 lines from the same brewer spell it as one',
  },
  {
    kind: 'brand',
    pattern: '\\bBREW\\s+DOG\\b',
    replacement: 'BrewDog',
    official: 'BrewDog',
    source: 'BrewDog plc — one word, medial capital',
  },
  {
    kind: 'brand',
    pattern: '\\bCAOLILA\\b',
    replacement: 'Caol Ila',
    official: 'Caol Ila',
    source: 'Diageo — Islay distillery, two words',
    note: 'here the single-word form is the error, not the spaced one',
  },
  {
    kind: 'brand',
    pattern: '\\bGLENGRANT\\b',
    replacement: 'Glen Grant',
    official: 'Glen Grant',
    source: 'Campari Group — two words',
  },
];

/** Misspellings of well-known marks. */
const MISSPELLING: NameRule[] = [
  { kind: 'brand', pattern: "\\bBALL[AE]NTINE'?S\\b", replacement: "Ballantine's", official: "Ballantine's", source: 'Pernod Ricard' },
  { kind: 'brand', pattern: '\\bAMARUL\\b', replacement: 'Amarula', official: 'Amarula', source: 'Distell Group' },
  { kind: 'brand', pattern: '\\bGLENLIVIT\\b', replacement: 'Glenlivet', official: 'The Glenlivet', source: 'Pernod Ricard' },
  { kind: 'brand', pattern: '\\bSTOLICHANAYA\\b', replacement: 'Stolichnaya', official: 'Stolichnaya', source: 'SPI Group' },
  { kind: 'brand', pattern: '\\bBISHOT\\b', replacement: 'Bichot', official: 'Albert Bichot', source: 'Maison Albert Bichot, Beaune' },
  { kind: 'brand', pattern: '\\bCARRIBBEAN\\b', replacement: 'Caribbean', note: 'doubled R' },
  { kind: 'style', pattern: '\\bCLASIC\\b', replacement: 'Classic' },
  { kind: 'style', pattern: '\\bCHARDONAY\\b', replacement: 'Chardonnay', official: 'Chardonnay', source: 'grape variety' },
  { kind: 'style', pattern: '\\bSPRIRT\\b', replacement: 'Spirit' },
];

/**
 * Possessive and plural inconsistency. Upstream writes the same mark as bare
 * stem, bare plural and true possessive — sometimes all three — which splits one
 * brand across three spellings in any grouped view.
 */
const POSSESSIVE: NameRule[] = [
  {
    kind: 'brand',
    pattern: "\\bJACOB(?:'S|S|\\s+S)?\\s+CREEK\\b",
    replacement: "Jacob's Creek",
    official: "Jacob's Creek",
    source: 'Pernod Ricard Winemakers',
    note: 'catalogue carries JACOB S CREEK and JACOBS CREEK',
  },
  {
    kind: 'brand',
    pattern: "\\bJACK\\s+DANIEL(?:'S|S)?\\b",
    replacement: "Jack Daniel's",
    official: "Jack Daniel's",
    source: 'Brown-Forman',
  },
  {
    kind: 'brand',
    pattern: "\\bMC\\s?DOWELL(?:'S|S)?\\b",
    replacement: "McDowell's",
    official: "McDowell's",
    source: 'United Spirits Ltd',
    note: 'catalogue carries MCDOWELL, MCDOWELLS, McDOWELLS and MCDOWELL’S',
  },
  {
    kind: 'brand',
    pattern: "\\bSEAGRAM(?:'S|S)?\\b",
    replacement: "Seagram's",
    official: "Seagram's",
    source: 'Pernod Ricard India',
  },
  {
    kind: 'brand',
    pattern: "\\bDEWAR(?:'S|S)?\\b",
    replacement: "Dewar's",
    official: "Dewar's",
    source: 'John Dewar & Sons, Bacardi',
  },
];

/** Style and region words, not brands — normalised so they group. */
const STYLE: NameRule[] = [
  { kind: 'style', pattern: '\\bSPEY\\s+SIDE\\b', replacement: 'Speyside', official: 'Speyside', source: 'Scotch Whisky Regulations 2009 — protected region' },
  { kind: 'style', pattern: '\\bWEISS\\s+BIER\\b', replacement: 'Weissbier', official: 'Weissbier', source: 'German beer style, one word' },
];

/** Ordered: mojibake first, then longest brand phrases, then single tokens. */
export const NAME_RULES: NameRule[] = [
  ...MOJIBAKE,
  ...SPLIT_WORD,
  ...POSSESSIVE,
  ...MISSPELLING,
  ...STYLE,
];

/**
 * Replacement that matches the case of what it replaced, so a rule authored as
 * "Kingfisher" lands as "KINGFISHER" inside a shouted name and "Kingfisher"
 * inside a title-cased one. Without this every corrected row would read as
 * though someone had typed over it.
 */
function matchCase(matched: string, replacement: string): string {
  const letters = matched.replace(/[^A-Za-z]/g, '');
  if (!letters) return replacement;
  if (letters === letters.toUpperCase()) return replacement.toUpperCase();
  if (letters === letters.toLowerCase()) return replacement.toLowerCase();
  return replacement;
}

export interface Applied {
  name: string;
  /** Indices into the rule list that actually fired. */
  fired: number[];
}

/** Apply every rule in order, reporting which ones changed anything. */
export function applyNameRules(raw: string, rules: NameRule[] = NAME_RULES): Applied {
  let name = raw;
  const fired: number[] = [];

  rules.forEach((rule, i) => {
    const re = new RegExp(rule.pattern, 'giu');
    let hit = false;
    const next = name.replace(re, (m) => {
      hit = true;
      return rule.kind === 'mojibake' ? rule.replacement : matchCase(m, rule.replacement);
    });
    if (hit && next !== name) {
      fired.push(i);
      name = next;
    }
  });

  // Rules can leave doubled spaces behind (the no-break-space repair especially).
  name = name.replace(/\s+/g, ' ').trim();
  return { name, fired };
}
