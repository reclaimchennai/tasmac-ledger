/**
 * Strings for the per-head cards on /db, English and Tamil.
 *
 * Separate from strings-db.ts for the same reason that file is separate from
 * strings.ts: one flat object per language, handed to one client component.
 */

const en = {
  kicker: 'Per person',
  title: 'How much that is, each',
  sub:
    'The same sales, divided by the people there are to drink them: the 2026 district population projection, and the share of adults who say they drink.',

  by: 'Divided by',
  by_head: 'Everyone',
  by_adult: 'Adults 15+',
  by_man: 'Men 15+',
  by_drinker: 'Drinkers',
  per_head: 'per person',
  per_adult: 'per adult 15+',
  per_man: 'per man 15+',
  per_drinker: 'per drinker',
  def_head: 'Divided by everyone — every man, woman and child.',
  def_adult: 'Divided by everyone aged 15 and over.',
  def_man: 'Divided by men aged 15 and over.',
  def_drinker: 'Divided by the adults who told NFHS-6 that they drink.',
  lit: 'litres',

  map_k: 'Per person',
  map_t: 'Spending on drink, a year, {per}',
  map_s:
    '{days} days of sales scaled to a full year. Shaded by rank, not by value. Tap a district for its figures.',
  map_lo: 'Less',
  map_hi: 'More',

  rank_k: 'Pure alcohol',
  rank_t: 'Litres of pure alcohol a year, per drinker',
  rank_s:
    'Bottles sold, converted at an assumed strength — spirits 42.8%, strong beer 8%, lager 5%, wine 12% — and divided by the district’s drinkers. The World Health Organization puts India at about 5 litres per adult.',

  scat_k: 'Survey against shelves',
  scat_t: 'Where people say they drink, and where the bottles actually go',
  scat_s:
    'Across the bottom, the share of men 15+ who told NFHS-6 they drink. Up the side, rupees a year per adult. If the survey explained sales, the dots would run bottom-left to top-right.',
  scat_x: 'Men 15+ who drink (%)',
  scat_y: 'Rupees a year per adult',

  st_pop: 'People',
  st_popSub: 'projected for 2026',
  st_drinkers: 'Drinkers',
  st_drinkersSub: '{pct} of adults 15+',
  st_perHead: 'A year, per head',
  st_perHeadSub: '{adult} per adult',
  st_perDrinker: 'A year, per drinker',
  st_perDrinkerSub: '{alc} litres of pure alcohol',

  col_district: 'District',
  col_pop: 'People',
  col_drinkPct: 'Men who drink',
  col_drinkers: 'Drinkers',
  col_perHead: '₹/head/yr',
  col_perAdult: '₹/adult/yr',
  col_perMan: '₹/man/yr',
  col_perDrinker: '₹/drinker/yr',
  col_alc: 'Pure alcohol, litres a year',

  caveat_h: 'Read these with two things in mind',
  caveat_1:
    'A bottle is counted where it was bought, not where the buyer lives. Districts ringing Chennai and those on the highways and the state border sell to people who live elsewhere, so they read high and their neighbours read low.',
  caveat_2:
    'NFHS asks people whether they drink, and fewer say yes than the shelves imply. Every per-drinker figure is therefore too high by the same unknown factor — useful for ranking districts against each other, not as a measure of what one person drinks.',
  caveat_3:
    'Population is a projection made in 2020 for the 32 districts of the 2011 census, split across today’s 38. Sales are {days} days scaled to a year, so a festival-heavy window reads high.',
  src_pop: 'Population',
  src_nfhs: 'Drinking',
};

const ta: typeof en = {
  kicker: 'தனி நபருக்கு',
  title: 'ஒருவருக்கு எவ்வளவு',
  sub:
    'அதே விற்பனை, குடிக்க இருக்கும் மக்கள் எண்ணிக்கையால் வகுக்கப்பட்டது: 2026 மாவட்ட மக்கள்தொகை மதிப்பீடு, மற்றும் குடிப்பதாகச் சொல்பவர்களின் பங்கு.',

  by: 'வகுக்கும் அளவு',
  by_head: 'அனைவரும்',
  by_adult: '15+ வயதினர்',
  by_man: '15+ ஆண்கள்',
  by_drinker: 'குடிப்பவர்கள்',
  per_head: 'ஒருவருக்கு',
  per_adult: '15+ பெரியவர் ஒருவருக்கு',
  per_man: '15+ ஆண் ஒருவருக்கு',
  per_drinker: 'குடிப்பவர் ஒருவருக்கு',
  def_head: 'ஆண், பெண், குழந்தை என அனைவராலும் வகுக்கப்பட்டது.',
  def_adult: '15 வயதுக்கு மேற்பட்ட அனைவராலும் வகுக்கப்பட்டது.',
  def_man: '15 வயதுக்கு மேற்பட்ட ஆண்களால் வகுக்கப்பட்டது.',
  def_drinker: 'NFHS-6-இல் குடிப்பதாகச் சொன்ன பெரியவர்களால் வகுக்கப்பட்டது.',
  lit: 'லிட்டர்',

  map_k: 'தனி நபருக்கு',
  map_t: 'ஆண்டுக்கு மதுவுக்குச் செலவு, {per}',
  map_s:
    '{days} நாள் விற்பனை முழு ஆண்டுக்கு விரிவாக்கப்பட்டது. மதிப்பின்படி அல்ல, தரவரிசைப்படி நிறம். மாவட்டத்தைத் தொட்டால் விவரம்.',
  map_lo: 'குறைவு',
  map_hi: 'அதிகம்',

  rank_k: 'தூய ஆல்கஹால்',
  rank_t: 'குடிப்பவர் ஒருவருக்கு ஆண்டுக்கு தூய ஆல்கஹால் லிட்டர்',
  rank_s:
    'விற்ற பாட்டில்கள், கருதப்பட்ட வீரியத்தில் — சாராயம் 42.8%, ஸ்ட்ராங் பியர் 8%, பியர் 5%, ஒயின் 12% — மாவட்டத்தின் குடிப்பவர்களால் வகுக்கப்பட்டது. உலக சுகாதார நிறுவனம் இந்தியாவுக்கு ஒரு பெரியவருக்கு சுமார் 5 லிட்டர் எனக் கணக்கிடுகிறது.',

  scat_k: 'கணக்கெடுப்பும் கடையும்',
  scat_t: 'குடிப்பதாகச் சொல்லும் இடமும், பாட்டில்கள் செல்லும் இடமும்',
  scat_s:
    'கீழே, NFHS-6-இல் குடிப்பதாகச் சொன்ன 15+ ஆண்களின் பங்கு. பக்கவாட்டில், ஒரு பெரியவருக்கு ஆண்டுக்கு ரூபாய். கணக்கெடுப்பு விற்பனையை விளக்கினால், புள்ளிகள் இடது-கீழிருந்து வலது-மேலாகச் செல்லும்.',
  scat_x: 'குடிக்கும் 15+ ஆண்கள் (%)',
  scat_y: 'பெரியவர் ஒருவருக்கு ஆண்டுக்கு ரூபாய்',

  st_pop: 'மக்கள்',
  st_popSub: '2026 மதிப்பீடு',
  st_drinkers: 'குடிப்பவர்கள்',
  st_drinkersSub: '15+ வயதினரில் {pct}',
  st_perHead: 'ஆண்டுக்கு, ஒருவருக்கு',
  st_perHeadSub: 'பெரியவர் ஒருவருக்கு {adult}',
  st_perDrinker: 'ஆண்டுக்கு, குடிப்பவருக்கு',
  st_perDrinkerSub: 'தூய ஆல்கஹால் {alc} லிட்டர்',

  col_district: 'மாவட்டம்',
  col_pop: 'மக்கள்',
  col_drinkPct: 'குடிக்கும் ஆண்கள்',
  col_drinkers: 'குடிப்பவர்கள்',
  col_perHead: '₹/நபர்/ஆண்டு',
  col_perAdult: '₹/பெரியவர்/ஆண்டு',
  col_perMan: '₹/ஆண்/ஆண்டு',
  col_perDrinker: '₹/குடிப்பவர்/ஆண்டு',
  col_alc: 'தூய ஆல்கஹால், ஆண்டுக்கு லிட்டர்',

  caveat_h: 'இரண்டை மனதில் கொண்டு படியுங்கள்',
  caveat_1:
    'பாட்டில் வாங்கிய இடத்தில் கணக்கிடப்படுகிறது, வாங்கியவர் வசிக்கும் இடத்தில் அல்ல. சென்னையைச் சுற்றிய, நெடுஞ்சாலை மற்றும் எல்லை மாவட்டங்கள் வெளியூர்க்காரர்களுக்கு விற்கின்றன; எனவே அவை அதிகமாகவும், அண்டை மாவட்டங்கள் குறைவாகவும் தெரியும்.',
  caveat_2:
    'NFHS மக்களிடம் குடிக்கிறீர்களா எனக் கேட்கிறது; கடை இருப்பு காட்டுவதைவிடக் குறைவானவர்களே ஆம் என்கிறார்கள். எனவே குடிப்பவர் ஒருவருக்கான ஒவ்வொரு எண்ணும் அதே அளவு மிகைப்படுத்தப்பட்டது — மாவட்டங்களை ஒப்பிட உதவும், ஒருவர் குடிப்பதன் அளவாக அல்ல.',
  caveat_3:
    'மக்கள்தொகை 2020-இல் 2011 மக்கள்தொகைக் கணக்கெடுப்பின் 32 மாவட்டங்களுக்குச் செய்யப்பட்ட மதிப்பீடு, இன்றைய 38 மாவட்டங்களுக்குப் பிரிக்கப்பட்டது. விற்பனை {days} நாட்கள் ஆண்டாக விரிவாக்கப்பட்டது; பண்டிகைக் காலம் அதிகமாகத் தெரியும்.',
  src_pop: 'மக்கள்தொகை',
  src_nfhs: 'குடிப்பழக்கம்',
};

export type PerCapitaStrings = typeof en;
export const PC_STRINGS = { en, ta };
