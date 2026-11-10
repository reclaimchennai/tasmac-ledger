/**
 * Latin → Tamil for proper nouns.
 *
 * Used for taluk, brand and supplier names, where *translation* would be wrong
 * even with a translation API to hand: "Kingfisher" as a beer is not a kingfisher
 * the bird, and a reader looking for it on a shop board wants கிங்ஃபிஷர், not
 * மீன்கொத்தி. So names are respelt in Tamil script, and every row generated this
 * way is tagged `translit` in `name_i18n` so the site can say where it came from.
 *
 * Two stages, because English spelling is not phonetic:
 *
 *   1. A lexicon of the words that actually occur in this catalogue. Two hundred
 *      entries cover about 60% of all token occurrences — "brandy", "whisky",
 *      "premium", "scotch" and their friends repeat endlessly — and hand-written
 *      Tamil for those is worth far more than any rule.
 *   2. A letter-to-sound pass for everything else: spelling → phonemes →
 *      Tamil, with the usual English irregularities (silent final e, -tion, open
 *      vs closed syllables, soft c and g) handled explicitly.
 *
 * Tamil has one stop series where English has voiced/unvoiced pairs, so k and g
 * both land on க and p and b both on ப. The grantha letters ஜ ஷ ஸ ஹ are used for
 * borrowings, because that is how these names are printed in Tamil here.
 */

// ─────────────────────────── lexicon ───────────────────────────

/**
 * The catalogue's own vocabulary. Ordered roughly by how often each word occurs,
 * which is also the order in which getting one wrong would be most visible.
 */
const LEXICON: Record<string, string> = {
  // liquor and category words
  brandy: 'பிராந்தி', whisky: 'விஸ்கி', whiskey: 'விஸ்கி', beer: 'பீர்', wine: 'ஒயின்',
  vodka: 'ஓட்கா', rum: 'ரம்', gin: 'ஜின்', tequila: 'டெக்கீலா', cognac: 'கோன்யாக்',
  liqueur: 'லிக்கியூர்', liquor: 'மது', lager: 'லேகர்', pilsner: 'பில்ஸ்னர்',
  soju: 'சோஜு', bourbon: 'பர்பன்', scotch: 'ஸ்காட்ச்', malt: 'மால்ட்', grain: 'கிரெயின்',
  spirit: 'ஸ்பிரிட்', spirits: 'ஸ்பிரிட்ஸ்', ale: 'ஏல்', stout: 'ஸ்டவுட்', cider: 'சைடர்',
  sherry: 'ஷெர்ரி', port: 'போர்ட்', vermouth: 'வெர்மவுத்', absinthe: 'அப்சிந்த்',

  // qualifiers
  premium: 'பிரீமியம்', blended: 'பிளெண்டட்', strong: 'ஸ்ட்ராங்', single: 'சிங்கிள்',
  french: 'பிரெஞ்ச்', old: 'ஓல்ட்', super: 'சூப்பர்', years: 'இயர்ஸ்', year: 'இயர்',
  reserve: 'ரிசர்வ்', reserva: 'ரிசர்வா', classic: 'கிளாசிக்', deluxe: 'டீலக்ஸ்',
  royal: 'ராயல்', special: 'ஸ்பெஷல்', original: 'ஒரிஜினல்', fine: 'ஃபைன்',
  finest: 'ஃபைனஸ்ட்', dry: 'டிரை', select: 'செலக்ட்', extra: 'எக்ஸ்ட்ரா',
  superior: 'சுப்பீரியர்', ultra: 'அல்ட்ரா', aged: 'ஏஜ்ட்', matured: 'மெச்சூர்ட்',
  distilled: 'டிஸ்டில்ட்', double: 'டபுள்', triple: 'டிரிபிள்', medium: 'மீடியம்',
  authentic: 'ஆதன்டிக்', pure: 'ப்யூர்', smooth: 'ஸ்மூத்', imported: 'இறக்குமதி',
  limited: 'லிமிடெட்', private: 'பிரைவேட்', collection: 'கலெக்‌ஷன்', edition: 'எடிஷன்',
  quality: 'குவாலிட்டி', exceptional: 'எக்ஸெப்‌ஷனல்', exquisite: 'எக்ஸ்குயிசிட்',
  celebration: 'செலிபிரேஷன்', signature: 'சிக்னேச்சர்', heritage: 'ஹெரிடேஜ்',

  // colours and descriptors
  red: 'ரெட்', white: 'ஒயிட்', black: 'பிளாக்', blue: 'புளூ', gold: 'கோல்ட்',
  golden: 'கோல்டன்', silver: 'சில்வர்', green: 'கிரீன்', pink: 'பிங்க்', dark: 'டார்க்',
  light: 'லைட்', mild: 'மைல்ட்', rose: 'ரோஸ்', blanc: 'பிளாங்', blanco: 'பிளாங்கோ',
  rouge: 'ரூஷ்', noir: 'நுவார்', brut: 'ப்ரூட்', sweet: 'ஸ்வீட்',

  // grapes and flavours
  sauvignon: 'சாவிஞ்யோன்', cabernet: 'கேபர்னே', merlot: 'மெர்லோ', shiraz: 'ஷிராஸ்',
  chardonnay: 'ஷார்டோனே', pinot: 'பினோ', riesling: 'ரீஸ்லிங்', tempranillo: 'டெம்பிரானியோ',
  grape: 'திராட்சை', apple: 'ஆப்பிள்', orange: 'ஆரஞ்சு', lemon: 'எலுமிச்சை',
  honey: 'ஹனி', wheat: 'கோதுமை', cream: 'கிரீம்', spice: 'ஸ்பைஸ்', cinnamon: 'இலவங்கம்',
  fire: 'ஃபயர்', vineyards: 'திராட்சைத் தோட்டம்',

  // packaging and measures
  can: 'கேன்', bottle: 'பாட்டில்', barrel: 'பீப்பாய்', cask: 'கஸ்க்', label: 'லேபிள்',
  star: 'ஸ்டார்', monk: 'மங்க்', empire: 'எம்பயர்', crown: 'கிரவுன்',

  // company words
  breweries: 'ப்ரூவரீஸ்', brewery: 'ப்ரூவரி', distilleries: 'டிஸ்டிலரீஸ்',
  distillery: 'டிஸ்டிலரி', winery: 'ஒயினரி', beverages: 'பானங்கள்',
  industries: 'இண்டஸ்ட்ரீஸ்', products: 'புராடக்ட்ஸ்', company: 'கம்பெனி',
  corporation: 'கழகம்', imports: 'இறக்குமதி', importers: 'இறக்குமதியாளர்',
  distributors: 'விநியோகஸ்தர்', international: 'இண்டர்நேஷனல்', group: 'குழுமம்',
  india: 'இந்தியா', indian: 'இந்திய', highland: 'ஹைலாண்ட்', london: 'லண்டன்',
  tennessee: 'டென்னஸி', british: 'பிரிட்டிஷ்', tamil: 'தமிழ்', nadu: 'நாடு',

  // grammar words that survive into names
  the: 'த', and: 'மற்றும்', with: 'உடன்', new: 'நியூ',
  // `of` and `at` inside a company name read as a stray preposition in Tamil
  // ("United Breweries Limited AT Aranvoyal"), so they are dropped rather than rendered.
  of: '', at: '',
  no: 'எண்', king: 'கிங்', queen: 'குயின்', baron: 'பாரன்', napoleon: 'நெப்போலியன்',
  napolean: 'நெப்போலியன்', magic: 'மேஜிக்', diamond: 'டயமண்ட்', creek: 'கிரீக்',
  walker: 'வாக்கர்', johnnie: 'ஜானி', jack: 'ஜாக்', kingfisher: 'கிங்ஃபிஷர்',
  speyside: 'ஸ்பேசைட்', glenlivet: 'கிளென்லிவெட்', bacardi: 'பகார்டி',
  absolut: 'அப்சல்யூட்', regal: 'ரீகல்', pipers: 'பைப்பர்ஸ்', accord: 'அக்கார்ட்',
};

// ─────────────────────────── letter to sound ───────────────────────────

type Ph = string;

const TAMIL_CONS: Record<string, string> = {
  k: 'க', g: 'க', ch: 'ச', j: 'ஜ', t: 'ட', d: 'ட', th: 'த', dh: 'த',
  p: 'ப', b: 'ப', f: 'ஃப', m: 'ம', n: 'ன', nn: 'ண', nd: 'ந', ng: 'ங',
  r: 'ர', l: 'ல', v: 'வ', s: 'ஸ', sh: 'ஷ', h: 'ஹ', y: 'ய', z: 'ஸ',
};

const TAMIL_SIGN: Record<string, string> = {
  a: '', aa: 'ா', i: 'ி', ii: 'ீ', u: 'ு', uu: 'ூ',
  e: 'ெ', ee: 'ே', ai: 'ை', o: 'ொ', oo: 'ோ', au: 'ௌ',
};

const TAMIL_VOWEL: Record<string, string> = {
  a: 'அ', aa: 'ஆ', i: 'இ', ii: 'ஈ', u: 'உ', uu: 'ஊ',
  e: 'எ', ee: 'ஏ', ai: 'ஐ', o: 'ஒ', oo: 'ஓ', au: 'ஔ',
};

const isVowelPh = (p: Ph) => p in TAMIL_SIGN;
const VOWEL_LETTER = /[aeiou]/;
const CONS_LETTER = /[bcdfghjklmnpqrstvwxyz]/;

/** Germanic words where "g" before e/i stays hard, against the soft-g rule. */
const HARD_G = /^(get|give|gift|girl|gear|geese|gild|gilt|gig|gill|begin|target|tiger|anger|finger|longer|younger|together|forget|gate|giant)/;

/** Long vowel a silent final "e" produces in the syllable before it. */
const MAGIC_E: Record<string, Ph> = { a: 'ee', e: 'ii', i: 'ai', o: 'oo', u: 'uu' };

/**
 * Spelling → phonemes. Left to right, longest match first, with the handful of
 * English patterns that a naive letter map always gets wrong: silent final e,
 * -tion, -y as a vowel, open vs closed syllables, soft c and g.
 */
function phonemes(raw: string): Ph[] {
  let w = raw.toLowerCase();
  const out: Ph[] = [];

  // Silent final "e" lengthens the vowel before it: wine → வைன், not வினெ.
  const magic = /([aeiou])([bcdfgklmnprstvz])e$/.exec(w);
  if (magic && w.length > 3) {
    w = `${w.slice(0, magic.index)}${MAGIC_E[magic[1]]}${magic[2]}`;
  } else if (/[bcdfgklmnprstvz]e$/.test(w) && w.length > 3) {
    w = w.slice(0, -1); // plain silent e: "hence", "pale" already handled above
  }

  let i = 0;
  const at = (s: string) => w.startsWith(s, i);
  const next = (n = 1) => w[i + n] ?? '';
  const atEnd = (n = 1) => i + n >= w.length;

  while (i < w.length) {
    // ── suffixes that are whole sounds ──
    if (at('tion') && atEnd(4)) { out.push('sh', 'a', 'n'); i += 4; continue; }
    if (at('sion') && atEnd(4)) { out.push('sh', 'a', 'n'); i += 4; continue; }
    if (at('ture') && atEnd(4)) { out.push('ch', 'a', 'r'); i += 4; continue; }
    // "-le" after a consonant is a syllabic l: bottle → பாட்டில்.
    if (at('le') && atEnd(2) && CONS_LETTER.test(w[i - 1] ?? '')) { out.push('i', 'l'); i += 2; continue; }

    // ── consonant digraphs ──
    if (at('tch')) { out.push('ch'); i += 3; continue; }
    if (at('sch')) { out.push('s', 'k'); i += 3; continue; }
    if (at('ch')) { out.push('ch'); i += 2; continue; }
    if (at('sh')) { out.push('sh'); i += 2; continue; }
    if (at('ph')) { out.push('f'); i += 2; continue; }
    if (at('th')) { out.push('th'); i += 2; continue; }
    if (at('wh')) { out.push('v'); i += 2; continue; }
    if (at('ck')) { out.push('k'); i += 2; continue; }
    if (at('qu')) { out.push('k', 'v'); i += 2; continue; }
    if (at('gh')) {
      // Silent at the end of a word or before "t": "high", "night".
      if (atEnd(2) || next(2) === 't') { i += 2; continue; }
      out.push('k'); i += 2; continue;
    }
    if (at('ng')) {
      // "ng" + vowel is two sounds ("finger"); otherwise one ("strong").
      out.push('ng');
      if (VOWEL_LETTER.test(next(2))) out.push('k');
      i += 2; continue;
    }
    if (at('nk')) { out.push('ng', 'k'); i += 2; continue; }
    if (at('kn') && i === 0) { out.push('n'); i += 2; continue; }
    if (at('wr') && i === 0) { out.push('r'); i += 2; continue; }

    // ── r-coloured vowels ──
    if (at('ar')) { out.push(atEnd(2) ? 'a' : 'aa', 'r'); i += 2; continue; }
    if (at('or')) { out.push(atEnd(2) ? 'a' : 'oo', 'r'); i += 2; continue; }
    if (at('er') || at('ir') || at('ur')) {
      // Stressed before a consonant ("first"), reduced at the end ("silver").
      out.push(atEnd(2) || CONS_LETTER.test(next(2)) ? 'a' : 'a', 'r');
      i += 2; continue;
    }

    // ── vowel digraphs ──
    const VD: [string, Ph[]][] = [
      ['ai', ['ee']], ['ay', ['ee']], ['ei', ['ee']], ['ey', ['i']],
      ['ea', ['ii']], ['ee', ['ii']], ['ie', ['ii']],
      ['eu', ['y', 'uu']], ['ew', ['y', 'uu']],
      ['oa', ['oo']], ['oe', ['oo']], ['oo', ['uu']],
      ['oi', ['o', 'y']], ['oy', ['o', 'y']],
      ['ou', ['au']], ['ow', ['au']],
      ['au', ['aa']], ['aw', ['aa']],
      ['ue', ['uu']], ['ui', ['u']],
    ];
    const vd = VD.find(([s]) => at(s));
    if (vd) { out.push(...vd[1]); i += vd[0].length; continue; }

    const c = w[i];

    // ── single vowels ──
    if (VOWEL_LETTER.test(c)) {
      // Open syllable — vowel, one consonant, another vowel — is long in English:
      // "lager" is லேகர், not லகர்.
      const open = CONS_LETTER.test(next(1)) && VOWEL_LETTER.test(next(2));
      if (c === 'a') out.push(/[lu]/.test(next(1)) && CONS_LETTER.test(next(2)) ? 'aa' : open ? 'ee' : 'a');
      else if (c === 'e') out.push(open ? 'ii' : 'e');
      else if (c === 'i') out.push(open ? 'ai' : 'i');
      else if (c === 'o') out.push(/l[dtk]/.test(w.slice(i + 1, i + 3)) ? 'oo' : open ? 'oo' : 'aa');
      else out.push(open ? 'uu' : 'a'); // short u is /ʌ/: "rum" → ரம்
      i++; continue;
    }

    // ── single consonants ──
    if (c === 'c') { out.push(/[eiy]/.test(next()) ? 's' : 'k'); i++; continue; }
    if (c === 'g') { out.push(/[eiy]/.test(next()) && !HARD_G.test(w) ? 'j' : 'k'); i++; continue; }
    if (c === 'x') { out.push('k', 's'); i++; continue; }
    if (c === 'w') { out.push('v'); i++; continue; }
    if (c === 'y') { out.push(i === 0 ? 'y' : 'i'); i++; continue; }
    if (c === 'z') { out.push('s'); i++; continue; }
    if (c === 'n') {
      // Retroflex before a retroflex stop ("and" → அண்ட்), dental before "th".
      out.push(/[td]/.test(next()) ? 'nn' : w.startsWith('th', i + 1) ? 'nd' : 'n');
      i++; continue;
    }
    if (TAMIL_CONS[c]) { out.push(c); i++; continue; }

    out.push(c); i++; // digit or punctuation, passed through
  }
  return out;
}

/** Phonemes → Tamil script. */
function render(ps: Ph[]): string {
  let out = '';
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (isVowelPh(p)) {
      // A vowel with no consonant before it needs the independent letter.
      const prev = ps[i - 1];
      if (i === 0 || isVowelPh(prev) || !TAMIL_CONS[prev]) out += TAMIL_VOWEL[p];
      continue;
    }
    const letter = TAMIL_CONS[p];
    if (!letter) { out += p; continue; }
    const vowel = ps[i + 1];
    if (vowel && isVowelPh(vowel)) {
      // Gemination: a doubled stop is written out, which is what gives "bottle"
      // its பாட்டில் rather than பாடில்.
      out += letter + TAMIL_SIGN[vowel];
    } else {
      out += `${letter}்`;
    }
  }
  return out;
}

// ─────────────────────────── Tamil place names ───────────────────────────

/**
 * Place names are a different problem from brand names, and the English rules
 * above are actively wrong for them.
 *
 * "Ariyalur" is not an English word that has been spelt phonetically — it is
 * அரியலூர் written in Latin letters. Romanised Tamil is close to regular, so it
 * can be read back rather than sounded out: run it through English rules and
 * ஆரைஇஏலர் comes out; read it as Tamil and அரியலூர் does.
 *
 * Two passes: the recurring name-elements first (ஊர், பாளையம், பட்டு, குறிச்சி —
 * a few dozen of these account for most Tamil place names, and they carry vowel
 * lengths the spelling drops), then a letter-by-letter reading of what is left.
 */
const PLACE_PARTS: [RegExp, string][] = [
  // Suffixes, longest first.
  [/samudram$/, 'சமுத்திரம்'], [/pattinam$/, 'பட்டினம்'], [/palayam$/, 'பாளையம்'],
  [/pakkam$/, 'பாக்கம்'], [/kurichi$/, 'குறிச்சி'], [/kuruchi$/, 'குறிச்சி'],
  [/kkottai$/, 'க்கோட்டை'], [/kottai$/, 'கோட்டை'], [/nallur$/, 'நல்லூர்'],
  [/pettai$/, 'பேட்டை'], [/thurai$/, 'துறை'], [/kulam$/, 'குளம்'],
  [/kkudi$/, 'க்குடி'], [/kudi$/, 'குடி'], [/puram$/, 'புரம்'], [/puri$/, 'புரி'],
  [/nagar$/, 'நகர்'], [/mangalam$/, 'மங்கலம்'], [/valam$/, 'வளம்'],
  [/malai$/, 'மலை'], [/medu$/, 'மேடு'], [/kovil$/, 'கோவில்'], [/koil$/, 'கோயில்'],
  [/vadi$/, 'வாடி'], [/patti$/, 'பட்டி'], [/pattu$/, 'பட்டு'], [/giri$/, 'கிரி'],
  [/eri$/, 'ஏரி'], [/oor$/, 'ஊர்'], [/ur$/, 'ஊர்'], [/pet$/, 'பேட்டை'],
  // Prefixes.
  [/^thiru/, 'திரு'], [/^tiru/, 'திரு'], [/^periya/, 'பெரிய'], [/^chinna/, 'சின்ன'],
  [/^vada/, 'வட'], [/^then/, 'தென்'], [/^mel/, 'மேல்'], [/^keel/, 'கீழ்'],
  [/^kil/, 'கீழ்'], [/^sri/, 'ஸ்ரீ'], [/^new /, 'புதிய '],
];

/**
 * Whole tokens that appear in taluk names and are not romanised Tamil at all —
 * the English compass words the revenue lists use ("Madurai South") — plus the
 * major towns whose Tamil spelling the romanisation does not determine.
 */
const PLACE_WORDS: Record<string, string> = {
  north: 'வடக்கு', south: 'தெற்கு', east: 'கிழக்கு', west: 'மேற்கு', central: 'மத்திய',
  madurai: 'மதுரை', chennai: 'சென்னை', coimbatore: 'கோயம்புத்தூர்', salem: 'சேலம்',
  erode: 'ஈரோடு', vellore: 'வேலூர்', thanjavur: 'தஞ்சாவூர்', tanjore: 'தஞ்சாவூர்',
  trichy: 'திருச்சி', tiruchirappalli: 'திருச்சிராப்பள்ளி', thiruchirappalli: 'திருச்சிராப்பள்ளி',
  tirunelveli: 'திருநெல்வேலி', thoothukudi: 'தூத்துக்குடி', tuticorin: 'தூத்துக்குடி',
  dindigul: 'திண்டுக்கல்', karur: 'கரூர்', namakkal: 'நாமக்கல்', theni: 'தேனி',
  cuddalore: 'கடலூர்', kanchipuram: 'காஞ்சிபுரம்', kancheepuram: 'காஞ்சிபுரம்',
  nagercoil: 'நாகர்கோவில்', ooty: 'ஊட்டி', udhagamandalam: 'உதகமண்டலம்',
  hosur: 'ஓசூர்', krishnagiri: 'கிருஷ்ணகிரி', dharmapuri: 'தருமபுரி',
  pollachi: 'பொள்ளாச்சி', avinashi: 'அவினாசி', mettupalayam: 'மேட்டுப்பாளையம்',
  gudiyatham: 'குடியாத்தம்', arakkonam: 'அரக்கோணம்', arcot: 'ஆற்காடு',
  villupuram: 'விழுப்புரம்', viluppuram: 'விழுப்புரம்', tindivanam: 'திண்டிவனம்',
  chidambaram: 'சிதம்பரம்', virudhunagar: 'விருதுநகர்', sivakasi: 'சிவகாசி',
  rajapalayam: 'ராஜபாளையம்', srivilliputhur: 'ஸ்ரீவில்லிபுத்தூர்',
  paramakudi: 'பரமக்குடி', devakottai: 'தேவகோட்டை', karaikudi: 'காரைக்குடி',
  kumbakonam: 'கும்பகோணம்', mannargudi: 'மன்னார்குடி', pattukkottai: 'பட்டுக்கோட்டை',
  ambur: 'ஆம்பூர்', vaniyambadi: 'வாணியம்பாடி', gobichettipalayam: 'கோபிசெட்டிபாளையம்',
  bhavani: 'பவானி', sathyamangalam: 'சத்தியமங்கலம்', tiruppur: 'திருப்பூர்',
  udumalpet: 'உடுமலைப்பேட்டை', valparai: 'வால்பாறை', mettur: 'மேட்டூர்',
  attur: 'ஆத்தூர்', omalur: 'ஓமலூர்', sankari: 'சங்கரி', tharangambadi: 'தரங்கம்பாடி',
  /*
    Chennai's taluks, where the romanisation is furthest from the Tamil: English
    spells Velachery with a "V-e-l", but the Tamil is வேளச்சேரி — long ே, and ள
    rather than ல. No rule recovers that from the Latin, so these are listed.
  */
  velachery: 'வேளச்சேரி', mambalam: 'மாம்பலம்', alandur: 'ஆலந்தூர்',
  sholinganallur: 'சோழிங்கநல்லூர்', sholingur: 'சோளிங்கர்',
  guindy: 'கிண்டி', saidapet: 'சைதாப்பேட்டை', egmore: 'எழும்பூர்',
  mylapore: 'மயிலாப்பூர்', triplicane: 'திருவல்லிக்கேணி', perambur: 'பெரம்பூர்',
  tondiarpet: 'தண்டையார்பேட்டை', ambattur: 'அம்பத்தூர்', maduravoyal: 'மாதவரம்',
  madhavaram: 'மாதவரம்', sriperumbudur: 'ஸ்ரீபெரும்புதூர்', poonamallee: 'பூந்தமல்லி',
  tambaram: 'தாம்பரம்', pallavaram: 'பல்லாவரம்', chengalpattu: 'செங்கல்பட்டு',
  purasawalkam: 'புரசைவாக்கம்', pursawalkam: 'புரசைவாக்கம்', ayanavaram: 'அயனாவரம்',
  villivakkam: 'வில்லிவாக்கம்', kodambakkam: 'கோடம்பாக்கம்', adyar: 'அடையாறு',
  thiruvanmiyur: 'திருவான்மியூர்', velacheri: 'வேளச்சேரி',
};

/** Romanised Tamil → Tamil, longest match first. */
const PLACE_MAP: [string, string][] = [
  // consonant clusters
  ['ndr', 'ன்ற'], ['nth', 'ந்த'], ['nt', 'ந்த'], ['nch', 'ஞ்ச'], ['chch', 'ச்ச'], ['cch', 'ச்ச'],
  ['zh', 'ழ'], ['ng', 'ங்க'], ['nj', 'ஞ்ச'], ['ny', 'ஞ'], ['ndh', 'ந்த'],
  ['nd', 'ண்ட'], ['nk', 'ங்க'], ['mp', 'ம்ப'], ['mb', 'ம்ப'],
  ['kk', 'க்க'], ['tt', 'ட்ட'], ['pp', 'ப்ப'], ['cc', 'ச்ச'], ['ll', 'ல்ல'],
  ['nn', 'ண்ண'], ['mm', 'ம்ம'], ['rr', 'ற்ற'], ['ss', 'ச்ச'], ['tr', 'ட்ர'],
  ['th', 'த'], ['dh', 'த'], ['ch', 'ச'], ['sh', 'ஷ'],
  // vowels, long before short
  ['aa', 'ஆ'], ['ai', 'ஐ'], ['au', 'ஔ'], ['ee', 'ஈ'], ['ii', 'ஈ'],
  ['oo', 'ஊ'], ['uu', 'ஊ'], ['ae', 'ஏ'], ['oa', 'ஓ'],
  ['a', 'அ'], ['e', 'எ'], ['i', 'இ'], ['o', 'ஒ'], ['u', 'உ'],
  // single consonants
  ['b', 'ப'], ['c', 'க'], ['d', 'ட'], ['f', 'ஃப'], ['g', 'க'], ['h', 'ஹ'],
  ['j', 'ஜ'], ['k', 'க'], ['l', 'ல'], ['m', 'ம'], ['n', 'ன'], ['p', 'ப'],
  ['q', 'க'], ['r', 'ர'], ['s', 'ச'], ['t', 'ட'], ['v', 'வ'], ['w', 'வ'],
  ['x', 'க்ஸ'], ['y', 'ய'], ['z', 'ஸ'],
];

/** Independent vowel letter → the sign that follows a consonant. */
const SIGN_FOR: Record<string, string> = {
  அ: '', ஆ: 'ா', இ: 'ி', ஈ: 'ீ', உ: 'ு', ஊ: 'ூ',
  எ: 'ெ', ஏ: 'ே', ஐ: 'ை', ஒ: 'ொ', ஓ: 'ோ', ஔ: 'ௌ',
};

const IS_TAMIL_CONS = /[க-ஹ]/;

/**
 * Stitch a run of Tamil pieces together: a vowel after a consonant becomes a
 * sign, a consonant with no vowel after it takes a pulli.
 */
function joinTamil(pieces: string[]): string {
  let out = '';
  let pendingCons = '';

  const flush = () => { if (pendingCons) { out += `${pendingCons}்`; pendingCons = ''; } };

  for (const piece of pieces) {
    if (SIGN_FOR[piece] !== undefined) {
      if (pendingCons) { out += pendingCons + SIGN_FOR[piece]; pendingCons = ''; }
      else out += piece;
      continue;
    }
    if (piece.length === 1 && IS_TAMIL_CONS.test(piece)) { flush(); pendingCons = piece; continue; }
    // A cluster like "ங்க" or "ச்ச": everything but the last letter is settled,
    // the last letter is still waiting for its vowel.
    flush();
    if (IS_TAMIL_CONS.test(piece.slice(-1)) && !piece.endsWith('்')) {
      out += piece.slice(0, -1);
      pendingCons = piece.slice(-1);
    } else out += piece;
  }
  flush();
  return out;
}

/**
 * A name-element carries its own vowel, so joining it to the stem leaves a dead
 * consonant next to an independent vowel — "ல் + ஊர்". Tamil writes that as one
 * syllable, so the pulli is dropped and the vowel becomes a sign: லூர்.
 */
const VOWEL_AFTER_PULLI = /்([அஆஇஈஉஊஎஏஐஒஓஔ])/g;

function mergeSyllables(s: string): string {
  return s.replace(VOWEL_AFTER_PULLI, (_, v: string) => SIGN_FOR[v]);
}

/** Read a romanised Tamil place name back into Tamil script. */
export function toTamilPlace(name: string): string {
  return name
    .split(/(\s+|[()[\]/,.\-–])/)
    .map((tok) => {
      if (!/[A-Za-z]/.test(tok)) return tok;
      let w = tok.toLowerCase();
      if (PLACE_WORDS[w]) return PLACE_WORDS[w];

      // Word-initial t/d/n are dental in Tamil place names — Thanjavur and
      // Tiruvallur both open on த, Namakkal on ந — but retroflex in the middle,
      // which is what makes Ambattur அம்பட்டூர்.
      w = w.replace(/^t(?![hrt])/, 'th').replace(/^d(?!h)/, 'dh');
      const dentalN = /^n[aeiou]/.test(w);

      // Lift out the recurring name-elements first — they carry vowel lengths
      // the romanisation drops ("ur" is ஊர், not உர்).
      let head = '';
      let tail = '';
      for (const [re, ta] of PLACE_PARTS) {
        if (!re.test(w)) continue;
        const m = re.exec(w)!;
        if (re.source.startsWith('^')) { head += ta; w = w.slice(m[0].length); }
        else { tail = ta + tail; w = w.slice(0, m.index); }
      }

      const pieces: string[] = [];
      let i = 0;
      while (i < w.length) {
        const hit = PLACE_MAP.find(([latin]) => w.startsWith(latin, i));
        if (hit) { pieces.push(hit[1]); i += hit[0].length; }
        else { pieces.push(w[i]); i++; }
      }
      let body = joinTamil(pieces);
      if (dentalN && body.startsWith('ன')) body = `ந${body.slice(1)}`;
      return mergeSyllables(head + body + tail);
    })
    .join('');
}

/**
 * Grade marks, units and trade abbreviations, in Tamil script.
 *
 * These used to be passed through in Latin, on the grounds that they are what is
 * printed on the label. But a Tamil page with "VSOP", "XO" and "ml" scattered
 * through it reads as English text with Tamil around it — so they are spelt out
 * in Tamil letters instead, the way a Tamil label prints them. Only MRP and
 * TASMAC stay Latin, because those two genuinely are read as Latin here.
 */
const ABBREV: Record<string, string> = {
  vsop: 'வி.எஸ்.ஓ.பி', vs: 'வி.எஸ்', xo: 'எக்ஸ்.ஓ', xxx: 'எக்ஸ்.எக்ஸ்.எக்ஸ்',
  xr: 'எக்ஸ்.ஆர்', yo: 'ஆண்டு', yrs: 'ஆண்டுகள்', ipa: 'ஐ.பி.ஏ',
  igp: 'ஐ.ஜி.பி', igt: 'ஐ.ஜி.டி', doc: 'டி.ஓ.சி',
  imfs: 'ஐ.எம்.எஃப்.எஸ்', iml: 'ஐ.எம்.எல்', fl: 'எஃப்.எல்',
  pvt: 'பிரைவேட்', ltd: 'லிமிடெட்', 'm/s': '', inc: 'இன்க்', co: 'கம்பெனி',
  snj: 'எஸ்.என்.ஜே', mgm: 'எம்.ஜி.எம்', ub: 'யு.பி', va: 'வி.ஏ',
  ml: 'மி.லி', cl: 'செ.லி',
};

/** The only tokens that stay in the Latin alphabet on a Tamil page. */
const KEEP = /^(?:mrp|tasmac)$/i;

/** Letter names, for spelling an initialism out the way it is said aloud. */
const LETTER_NAME: Record<string, string> = {
  A: 'ஏ', B: 'பி', C: 'சி', D: 'டி', E: 'ஈ', F: 'எஃப்', G: 'ஜி', H: 'ஹெச்',
  I: 'ஐ', J: 'ஜே', K: 'கே', L: 'எல்', M: 'எம்', N: 'என்', O: 'ஓ', P: 'பி',
  Q: 'க்யூ', R: 'ஆர்', S: 'எஸ்', T: 'டி', U: 'யு', V: 'வி', W: 'டபிள்யூ',
  X: 'எக்ஸ்', Y: 'ஒய்', Z: 'இஸட்',
};

/** "650ml" → "650 மி.லி"; a bare number stays a number. */
function numberWithUnit(tok: string): string | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(ml|cl|l|ltr|%)?$/i.exec(tok);
  if (!m) return null;
  const [, n, unit] = m;
  if (!unit) return n;
  const u = unit.toLowerCase();
  if (u === '%') return `${n}%`;
  return `${n} ${u === 'ml' ? 'மி.லி' : u === 'cl' ? 'செ.லி' : 'லி'}`;
}

/** Respell one English name in Tamil script. */
export function toTamilScript(name: string): string {
  return name
    .split(/(\s+|[()[\]/,&.\-–'"])/)
    .map((tok) => {
      const numeric = numberWithUnit(tok);
      if (numeric !== null) return numeric;
      if (!/[A-Za-z]/.test(tok)) return tok;
      if (KEEP.test(tok)) return tok;
      const lower = tok.toLowerCase();
      if (ABBREV[lower] !== undefined) return ABBREV[lower];
      if (LEXICON[lower] !== undefined) return LEXICON[lower];
      /*
        A short all-caps token is an initialism. Sounding it out as a word gives
        nonsense, so it is spelt letter by letter in Tamil — "SNJ" becomes
        எஸ்.என்.ஜே, which is how it is read aloud anyway.
      */
      if (tok.length <= 4 && tok === tok.toUpperCase() && /^[A-Z]+$/.test(tok)) {
        return tok.split('').map((c) => LETTER_NAME[c] ?? c).join('.');
      }
      // Plurals and possessives of lexicon words, so "years" does not fall
      // through to the rules when "year" is already written out.
      if (lower.endsWith('s') && LEXICON[lower.slice(0, -1)]) return `${LEXICON[lower.slice(0, -1)]}ஸ்`;
      return render(phonemes(tok));
    })
    .join('');
}
