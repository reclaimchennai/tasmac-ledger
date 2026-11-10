/**
 * Interface strings, English and Tamil.
 *
 * Hand-written in both languages rather than machine-translated. Most of this
 * page is terms of art — "value at MRP", "shops reporting", "product line" — and
 * a translation API renders those as something that reads like a different site.
 * Placeholders are `{name}` and are substituted by `translator()`.
 *
 * Tamil register here is deliberately plain rather than literary: this is a
 * government stock register, and the reader is looking up a shop, not reading an
 * essay.
 */

export interface Entry { en: string; ta: string }

export const STRINGS = {
  // ── navigation ────────────────────────────────────────────────
  'nav.ledger': { en: 'Ledger', ta: 'பேரேடு' },
  'nav.shops': { en: 'Shops', ta: 'கடைகள்' },
  'nav.catalogue': { en: 'Catalogue', ta: 'பட்டியல்' },
  'nav.brands': { en: 'Brands', ta: 'பிராண்டுகள்' },
  'nav.districts': { en: 'Districts', ta: 'மாவட்டங்கள்' },
  'nav.suppliers': { en: 'Suppliers', ta: 'வழங்குநர்கள்' },
  'nav.db': { en: 'Dashboard', ta: 'அறிக்கை' },
  'nav.short.catalogue': { en: 'Stock', ta: 'இருப்பு' },
  'nav.short.districts': { en: 'Areas', ta: 'பகுதிகள்' },
  'nav.short.db': { en: 'Data', ta: 'தரவு' },

  // ── masthead ──────────────────────────────────────────────────
  'masthead.mark': { en: 'Ledger', ta: 'பேரேடு' },
  /*
    Three lengths, chosen against the field's measured width rather than a
    breakpoint — the masthead has a wordmark, two buttons and the field sharing
    one row, so the space left over does not track the viewport in any simple
    way, and Tamil sets wider than English at the same point size.
  */
  'search.placeholder': { en: 'Search shops, brands, suppliers…', ta: 'கடைகள், பிராண்டுகள், வழங்குநர்களைத் தேடுக…' },
  'search.placeholderMedium': { en: 'Shop no., brand…', ta: 'கடை எண், பிராண்ட்…' },
  'search.placeholderShort': { en: 'Search…', ta: 'தேடுக…' },
  'search.aria': { en: 'Search shops, brands, SKUs and suppliers', ta: 'கடைகள், பிராண்டுகள், SKU-கள், வழங்குநர்களைத் தேடுக' },
  'theme.toDark': { en: 'Switch to dark theme', ta: 'இருள் தோற்றத்திற்கு மாற்று' },
  'theme.toLight': { en: 'Switch to light theme', ta: 'ஒளி தோற்றத்திற்கு மாற்று' },
  'lang.label': { en: 'Language', ta: 'மொழி' },
  'lang.aria': { en: 'Choose language', ta: 'மொழியைத் தேர்வுசெய்' },

  // ── shared controls ───────────────────────────────────────────
  'common.find': { en: 'Find', ta: 'தேடுக' },
  'common.all': { en: 'All', ta: 'அனைத்தும்' },
  'common.previous': { en: '← Previous', ta: '← முந்தையது' },
  'common.next': { en: 'Next →', ta: 'அடுத்தது →' },
  'common.range': { en: '{from}–{to} of {total}', ta: '{total} இல் {from}–{to}' },
  'common.more': { en: '{n} more — scroll to load', ta: 'மேலும் {n} — உருட்டவும்' },
  'list.registered': { en: 'Registered', ta: 'பதிவு' },
  'common.showMore': { en: 'Show {n} more of {total}', ta: '{total} இல் மேலும் {n} காட்டு' },
  'common.sortBy': { en: 'Sort by {col}', ta: '{col} வாரியாக வரிசைப்படுத்து' },
  'common.sortAsc': { en: 'ascending', ta: 'ஏறுவரிசை' },
  'common.sortDesc': { en: 'descending', ta: 'இறங்குவரிசை' },
  'common.loading': { en: 'Loading…', ta: 'ஏற்றுகிறது…' },

  // ── column headings ───────────────────────────────────────────
  'col.brand': { en: 'Brand', ta: 'பிராண்ட்' },
  'col.types': { en: 'Types', ta: 'வகைகள்' },
  'col.sizes': { en: 'Sizes', ta: 'அளவுகள்' },
  'col.madeBy': { en: 'Made by', ta: 'தயாரிப்பு' },
  'col.priceRange': { en: 'Price range', ta: 'விலை வரம்பு' },
  'col.shops': { en: 'Shops', ta: 'கடைகள்' },
  'col.value': { en: 'Value', ta: 'மதிப்பு' },
  'col.district': { en: 'District', ta: 'மாவட்டம்' },
  'col.shareOfState': { en: 'Share of state', ta: 'மாநிலப் பங்கு' },
  'col.shareOfValue': { en: 'Share of value', ta: 'மதிப்புப் பங்கு' },
  'col.share': { en: 'Share', ta: 'பங்கு' },
  'col.shopsReporting': { en: 'Shops reporting', ta: 'தகவல் அளித்த கடைகள்' },
  'col.notReporting': { en: 'Not reporting', ta: 'தகவல் அளிக்காதவை' },
  'col.bottles': { en: 'Bottles', ta: 'பாட்டில்கள்' },
  'col.valueAtMrp': { en: 'Value at MRP', ta: 'MRP மதிப்பு' },
  'col.perShop': { en: 'Per shop', ta: 'கடை ஒன்றுக்கு' },
  'col.counted': { en: 'Counted', ta: 'எண்ணப்பட்டவை' },
  'col.lastCount': { en: 'Last count', ta: 'கடைசி எண்ணிக்கை' },
  'col.supplier': { en: 'Supplier', ta: 'வழங்குநர்' },
  'col.type': { en: 'Type', ta: 'வகை' },
  'col.city': { en: 'City', ta: 'நகரம்' },
  'col.brands': { en: 'Brands', ta: 'பிராண்டுகள்' },
  'col.skus': { en: 'SKUs', ta: 'SKU-கள்' },
  'col.product': { en: 'Product', ta: 'பொருள்' },
  'col.size': { en: 'Size', ta: 'அளவு' },
  'col.category': { en: 'Category', ta: 'பிரிவு' },
  'col.mrp': { en: 'MRP', ta: 'MRP' },
  'col.shop': { en: 'Shop', ta: 'கடை' },
  'col.class': { en: 'Status', ta: 'நிலை' },
  'col.where': { en: 'Where', ta: 'இடம்' },
  'col.address': { en: 'Address', ta: 'முகவரி' },
  'col.sold': { en: 'Sold', ta: 'விற்றது' },
  'col.inStock': { en: 'In stock', ta: 'இருப்பு' },
  'col.stock': { en: 'Stock', ta: 'இருப்பு' },
  'col.estRevenue': { en: 'Est. revenue', ta: 'மதிப்பிட்ட வருவாய்' },
  'col.started': { en: 'Started', ta: 'தொடங்கியது' },
  'col.lines': { en: 'Lines', ta: 'வரிகள்' },
  'col.changes': { en: 'Changes', ta: 'மாற்றங்கள்' },
  'col.status': { en: 'Status', ta: 'நிலை' },

  // ── liquor categories ─────────────────────────────────────────
  'category.BEER': { en: 'Beer', ta: 'பீர்' },
  'category.BRANDY': { en: 'Brandy', ta: 'பிராந்தி' },
  'category.WHISKY': { en: 'Whisky', ta: 'விஸ்கி' },
  'category.RUM': { en: 'Rum', ta: 'ரம்' },
  'category.GIN': { en: 'Gin', ta: 'ஜின்' },
  'category.VODKA': { en: 'Vodka', ta: 'ஓட்கா' },
  'category.WINE': { en: 'Wine', ta: 'ஒயின்' },
  'category.OTHER': { en: 'Other', ta: 'மற்றவை' },

  // ── one liquor category ───────────────────────────────────────
  'type.kicker': { en: 'Liquor category', ta: 'மது வகை' },
  'type.lede': {
    en: '{lines} brands across {skus} bottlings, on the shelves of {shops} shops.',
    ta: '{shops} கடைகளின் அலமாரிகளில், {skus} பாட்டில் வகைகளில் {lines} பிராண்டுகள்.',
  },
  'type.statStock': { en: 'On shelves at MRP', ta: 'அலமாரிகளில் MRP மதிப்பு' },
  'type.statBottles': { en: '{n} bottles', ta: '{n} பாட்டில்கள்' },
  'type.statSold': { en: 'Sold to date', ta: 'இதுவரை விற்றவை' },
  'type.statSoldSub': { en: '{n} bottles, valued at MRP', ta: '{n} பாட்டில்கள், MRP மதிப்பில்' },
  'type.statBrands': { en: 'Brands', ta: 'பிராண்டுகள்' },
  'type.statBrandsSub': { en: 'across {n} bottlings', ta: '{n} பாட்டில் வகைகளில்' },
  'type.statShops': { en: 'Shops stocking', ta: 'இருப்பு வைத்த கடைகள்' },
  'type.statShopsSub': { en: 'of the ones reporting', ta: 'தகவல் அளித்தவற்றில்' },
  'type.s1': { en: 'Sales, day by day', ta: 'நாள்தோறும் விற்பனை' },
  'type.s1note': { en: '{n} days · bottles sold', ta: '{n} நாட்கள் · விற்ற பாட்டில்கள்' },
  'type.s2': { en: 'Market share', ta: 'சந்தைப் பங்கு' },
  'type.s2note': { en: 'by revenue at MRP', ta: 'MRP வருவாய் வாரியாக' },
  'type.s2centre': { en: 'brands', ta: 'பிராண்டுகள்' },
  'type.s3': { en: 'Top selling brands', ta: 'அதிகம் விற்ற பிராண்டுகள்' },
  'type.s4': { en: 'Daily movement', ta: 'தினசரி நகர்வு' },
  'type.s5': { en: 'Where it is', ta: 'எங்கு உள்ளது' },
  'type.s5note': { en: 'by district', ta: 'மாவட்ட வாரியாக' },
  'type.s6': { en: 'Deepest stock', ta: 'அதிக இருப்பு' },
  'type.s6note': { en: 'the shops carrying the most of it', ta: 'அதிகம் வைத்திருக்கும் கடைகள்' },
  'type.allBrands': { en: 'All {name} brands', ta: 'அனைத்து {name} பிராண்டுகளும்' },
  'type.noSales': { en: 'No sales recorded yet', ta: 'இதுவரை விற்பனை பதிவாகவில்லை' },
  /* The donut's last slice: everything outside the named few, counted. */
  'type.restOfBrands': { en: '{n} others', ta: 'மற்ற {n}' },
  'col.onShelves': { en: 'On shelves', ta: 'அலமாரிகளில்' },

  // ── brands ────────────────────────────────────────────────────
  'brands.title': { en: 'Brands', ta: 'பிராண்டுகள்' },
  'brands.note': {
    en: '{n} product lines · a brand is one name across every size it is bottled in',
    ta: '{n} தயாரிப்பு வரிசைகள் · ஒரு பிராண்ட் என்பது எல்லா அளவுகளிலும் ஒரே பெயர்',
  },
  'brands.search': { en: 'Brand name…', ta: 'பிராண்ட் பெயர்…' },
  'brands.empty': { en: 'No brands match that', ta: 'அதற்குப் பொருந்தும் பிராண்ட் இல்லை' },
  'brands.corrected': { en: 'Upstream spells this “{raw}”', ta: 'மூலத்தில் இது “{raw}” எனப் பதிவாகியுள்ளது' },

  // ── districts ─────────────────────────────────────────────────
  'districts.title': { en: 'Districts', ta: 'மாவட்டங்கள்' },
  'districts.note': { en: '{n} revenue districts · {value} on the shelves', ta: '{n} வருவாய் மாவட்டங்கள் · அடுக்குகளில் {value}' },

  // ── suppliers ─────────────────────────────────────────────────
  'suppliers.title': { en: 'Suppliers', ta: 'வழங்குநர்கள்' },
  'suppliers.note': {
    en: '{n} distilleries, breweries, wineries and importers',
    ta: '{n} சாராய ஆலைகள், பீர் ஆலைகள், ஒயின் ஆலைகள், இறக்குமதியாளர்கள்',
  },
  'suppliers.search': { en: 'Supplier or city…', ta: 'வழங்குநர் அல்லது நகரம்…' },
  'suppliers.empty': { en: 'No suppliers match that', ta: 'அதற்குப் பொருந்தும் வழங்குநர் இல்லை' },
  'suppliers.import': { en: 'Import / FL2', ta: 'இறக்குமதி / FL2' },
  'type.Distillery': { en: 'Distillery', ta: 'சாராய ஆலை' },
  'type.Brewery': { en: 'Brewery', ta: 'பீர் ஆலை' },
  'type.Winery': { en: 'Winery', ta: 'ஒயின் ஆலை' },

  // ── catalogue ─────────────────────────────────────────────────
  'catalogue.title': { en: 'Catalogue', ta: 'பட்டியல்' },
  'catalogue.note': { en: '{n} bottlings · price and availability', ta: '{n} பாட்டில் வகைகள் · விலையும் கிடைப்பும்' },
  'catalogue.search': { en: 'Brand or supplier…', ta: 'பிராண்ட் அல்லது வழங்குநர்…' },
  'catalogue.empty': { en: 'Nothing matches that', ta: 'அதற்குப் பொருந்துவது எதுவும் இல்லை' },
  'catalogue.inStockOnly': { en: 'In stock only', ta: 'இருப்பில் உள்ளவை மட்டும்' },

  // ── shops ─────────────────────────────────────────────────────
  'shops.title': { en: 'Shops', ta: 'கடைகள்' },
  'shops.note': { en: '{n} mapped · pan or zoom to narrow the ledger', ta: '{n} வரைபடத்தில் · நகர்த்தி அல்லது பெரிதாக்கிப் பட்டியலைக் குறுக்கு' },
  'shops.search': { en: 'Shop number, address or taluk…', ta: 'கடை எண், முகவரி அல்லது வட்டம்…' },
  'shops.emptyView': { en: 'Nothing in this view — pan out, or clear the filters', ta: 'இந்தக் காட்சியில் எதுவும் இல்லை — வெளியே நகர்த்து, அல்லது வடிகட்டிகளை நீக்கு' },
  'shops.clearFilter': { en: 'Clear map filter ✕', ta: 'வரைபட வடிகட்டியை நீக்கு ✕' },
  'shops.count': { en: '{n} shops · {scope}', ta: '{n} கடைகள் · {scope}' },
  'shops.onShelves': { en: '{v} on the shelves', ta: 'அடுக்குகளில் {v}' },
  'scope.statewide': { en: 'statewide', ta: 'மாநிலம் முழுவதும்' },
  'scope.inView': { en: 'in view', ta: 'காட்சியில்' },
  'scope.shop': { en: 'shop #{n}', ta: 'கடை #{n}' },
  'class.trading': { en: 'Trading', ta: 'விற்பனையில்' },
  'class.stopped': { en: 'Not trading', ta: 'செயல்பாட்டில் இல்லை' },
  'class.elite': { en: 'Elite', ta: 'உயர்தரம்' },
  'class.normal': { en: 'Normal', ta: 'சாதாரண கடை' },
  'class.closed': { en: 'Closed', ta: 'மூடப்பட்டவை' },
  'class.other': { en: 'Not trading', ta: 'செயல்பாட்டில் இல்லை' },

  // ── map ───────────────────────────────────────────────────────
  'map.locate': { en: 'Locate me', ta: 'என் இடம்' },
  'map.locating': { en: 'Locating…', ta: 'இடம் தேடுகிறது…' },
  'map.reset': { en: 'Reset', ta: 'மீட்டமை' },
  'map.zoomIn': { en: 'Zoom in', ta: 'பெரிதாக்கு' },
  'map.zoomOut': { en: 'Zoom out', ta: 'சிறிதாக்கு' },
  'map.denied': { en: 'Location permission denied', ta: 'இட அனுமதி மறுக்கப்பட்டது' },
  'map.noFix': { en: 'Could not get a location fix', ta: 'இடத்தைக் கண்டறிய முடியவில்லை' },
  'map.noGeo': { en: 'This browser cannot share a location', ta: 'இந்த உலாவி இடத்தைப் பகிர முடியாது' },
  'map.street': { en: 'Street', ta: 'தெரு' },
  'map.satellite': { en: 'Satellite', ta: 'செயற்கைக்கோள்' },
  'map.terrain': { en: 'Terrain', ta: 'நிலத்தோற்றம்' },
  'map.plain': { en: 'Plain', ta: 'வெறும்' },
  'map.streetView': { en: 'Street View', ta: 'தெரு காட்சி' },
  'map.openInMaps': { en: 'Open in Google Maps', ta: 'Google Maps இல் திற' },
  'map.label': { en: 'Map of {n} TASMAC shops', ta: '{n} TASMAC கடைகளின் வரைபடம்' },
  'map.basemapAria': { en: 'Basemap style', ta: 'அடிப்படை வரைபட பாணி' },
  'map.sizeKey': { en: 'size = bottles held', ta: 'அளவு = இருப்பிலுள்ள பாட்டில்கள்' },
  'map.closeShop': { en: 'Close', ta: 'மூடு' },
  'map.viewShop': { en: 'Shop page', ta: 'கடைப் பக்கம்' },

  // ── home ──────────────────────────────────────────────────────
  /*
    The kicker ends in the district picker, so it is split: everything up to
    the picker, and the picker's own "all districts" reading. Keeping the count
    inside the label means the closed state still says how many there are.
  */
  'home.kickerPrefix': { en: 'Stock register · Tamil Nadu', ta: 'சரக்குப் பதிவேடு · தமிழ்நாடு' },
  'home.kickerAll': { en: '{n} districts', ta: '{n} மாவட்டங்கள்' },
  'home.scopeAria': { en: 'Filter the ledger by district', ta: 'மாவட்ட வாரியாக பேரேட்டை வடிகட்டு' },
  /*
    The headline breaks across three lines in both languages, but not at the
    same points: English builds "Every bottle / on every shelf, / counted and
    priced.", Tamil carries the whole subject into the first two lines and puts
    the verb phrase — the part set in oxblood — on the third.
  */
  'home.h1a': { en: 'Every bottle', ta: 'கடையில் உள்ள' },
  'home.h1b': { en: 'on every shelf,', ta: 'ஒவ்வொரு பாட்டிலும்,' },
  'home.h1c': { en: 'counted and priced.', ta: 'எண்ணப்பட்டு விலை குறிக்கப்பட்டுள்ளது.' },
  'home.lede': {
    en: 'TASMAC publishes what each of its shops is holding right now. This is that feed, kept — every reading stored, so the numbers stop being a snapshot and start being a history. Stock that falls between two readings is stock that was sold.',
    ta: 'ஒவ்வொரு கடையிலும் தற்போது கையிருப்பில் உள்ள பொருட்கள் தரவை TASMAC வெளியிடுகிறது. அந்தத் தகவல்கள் இங்குப் பதிவு செய்யப்படுகின்றன. ஒவ்வொரு அளவீடும் பதியப்படுவதால், எண்கள் வெற்றுப்படமாக அல்லாமல் வரலாறாக மாறுகின்றன. இரண்டு இருப்பு அளவீடுகளுக்கு இடையே ஏற்படும் குறைவு, விற்பனையான அளவாகக் கணக்கிடப்படுகிறது.',
  },
  'home.statInventory': { en: 'Inventory at MRP', ta: 'MRP இருப்பு மதிப்பு' },
  'home.statBottles': { en: '{n} bottles', ta: '{n} பாட்டில்கள்' },
  'home.statReporting': { en: 'Shops reporting', ta: 'தகவல் அளித்த கடைகள்' },
  'home.statRegistered': { en: 'of {n} open', ta: 'திறந்துள்ள {n} இல்' },
  'home.statSkus': { en: 'SKUs in stock', ta: 'இருப்பில் SKU-கள்' },
  'home.statDistinct': { en: 'distinct bottlings', ta: 'தனித்த பாட்டில் வகைகள்' },
  'home.statClock': { en: 'Feed clock', ta: 'நேரலை நேரம்' },
  'home.statRead': { en: 'read {ago}', ta: '{ago} புதுப்பிக்கப்பட்டது' },
  'home.s1': { en: 'Statewide holding', ta: 'மாநில அளவிலான இருப்பு' },
  'home.s1in': { en: '{name} holding', ta: '{name} இருப்பு' },
  'home.s1note': { en: '{n} readings · value at MRP', ta: '{n} அளவீடுகள் · MRP மதிப்பு' },
  'home.s2': { en: 'What the state is holding', ta: 'மாநிலம் வைத்திருப்பது' },
  'home.s2in': { en: 'What {name} is holding', ta: '{name} வைத்திருப்பது' },
  'home.s2note': { en: 'by liquor category', ta: 'மது வகை வாரியாக' },
  'home.s3flow': { en: 'Moving fastest today', ta: 'இன்று வேகமாக நகர்பவை' },
  'home.s3presence': { en: 'Widest shelf presence', ta: 'மிக அதிக அலமாரி இருப்பு' },
  'home.s3flowNote': { en: 'depletion so far today, valued at MRP', ta: 'இன்றுவரை குறைந்த இருப்பு, MRP மதிப்பில்' },
  'home.s3presenceNote': { en: 'awaiting a second reading before sales can be inferred', ta: 'விற்பனையைக் கணிக்க இரண்டாவது அளவீடு தேவை' },
  'home.s4': { en: 'District ledger', ta: 'மாவட்டப் பேரேடு' },
  'home.s4in': { en: 'Taluk ledger', ta: 'வட்டப் பேரேடு' },
  'home.s4inNote': { en: 'within {name}', ta: '{name} உள்ளே' },
  'home.allDistricts': { en: 'All {n}', ta: 'அனைத்தும் {n}' },
  'home.s5': { en: 'Readings', ta: 'அளவீடுகள்' },
  'home.s5note': { en: 'every sweep of the feed, logged', ta: 'ஊட்டத்தின் ஒவ்வொரு சுற்றும், பதிவு செய்யப்பட்டது' },
  'home.noReadings': { en: 'No readings recorded yet', ta: 'இதுவரை அளவீடுகள் பதிவாகவில்லை' },

  // ── footer ────────────────────────────────────────────────────
  'footer.title': { en: 'TASMAC Ledger', ta: 'TASMAC பேரேடு' },
  'footer.blurb': {
    en: 'An independent mirror of the stock and price data that the Tamil Nadu State Marketing Corporation publishes through its public consumer portal. Not affiliated with TASMAC or the Government of Tamil Nadu.',
    ta: 'தமிழ்நாடு அரசு மதுபான நிறுவனம் தனது பொது நுகர்வோர் இணையதளத்தில் வெளியிடும் இருப்பு மற்றும் விலைத் தரவின் தனிப்பட்ட நகல். TASMAC உடனோ தமிழ்நாடு அரசுடனோ தொடர்பில்லை.',
  },
  'footer.method': { en: 'Method', ta: 'முறை' },
  'footer.m1': { en: 'Polled every 20 minutes, district by district.', ta: 'ஒவ்வொரு 20 நிமிடத்திற்கும், மாவட்ட வாரியாகப் படிக்கப்படுகிறது.' },
  'footer.m2': { en: 'Sales inferred from falling stock, valued at MRP.', ta: 'குறையும் இருப்பிலிருந்து விற்பனை கணிக்கப்பட்டு, MRP இல் மதிப்பிடப்படுகிறது.' },
  'footer.m3': { en: 'Figures are estimates, and read low rather than high.', ta: 'எண்கள் மதிப்பீடுகளே; அவை கூடுதலாக அல்ல, குறைவாகவே இருக்கும்.' },
  'footer.howBuilt': { en: 'How this is built →', ta: 'இது எப்படி உருவானது →' },
  'footer.alert': { en: 'Consumer alert', ta: 'நுகர்வோர் எச்சரிக்கை' },
  'footer.alertText': {
    en: 'Report overcharging to TASMAC on {phone}. Always verify the printed MRP before paying.',
    ta: 'அதிக விலை வசூலிப்பதை {phone} எண்ணில் TASMAC-கிடம் புகார் செய்யவும். பணம் செலுத்தும் முன் அச்சிடப்பட்ட MRP-ஐ எப்போதும் சரிபார்க்கவும்.',
  },

  // ── method page ───────────────────────────────────────────────
  'method.kicker': { en: 'Method', ta: 'முறை' },
  'method.h1a': { en: 'How this is', ta: 'இது எப்படி' },
  'method.h1b': { en: 'put together.', ta: 'உருவாக்கப்பட்டது.' },
  'method.lede': {
    en: 'Everything here comes from data the Tamil Nadu government already publishes. Nothing is scraped from behind a login, and nothing is inferred that is not stated below.',
    ta: 'இங்குள்ள அனைத்தும் தமிழ்நாடு அரசு ஏற்கெனவே வெளியிட்ட தரவிலிருந்து வந்தவை. உள்நுழைவுக்குப் பின்னால் இருந்து எதுவும் எடுக்கப்படவில்லை; கீழே சொல்லப்படாத எதுவும் கணிக்கப்படவில்லை.',
  },
  'method.statReadings': { en: 'Readings kept', ta: 'சேமித்த அளவீடுகள்' },
  'method.statSince': { en: 'since {date}', ta: '{date} முதல்' },
  'method.statMovements': { en: 'Stock movements', ta: 'இருப்பு மாற்றங்கள்' },
  'method.statOf': { en: 'of {n} observations', ta: '{n} கவனிப்புகளில்' },
  'method.statShops': { en: 'Shops tracked', ta: 'கண்காணிக்கும் கடைகள்' },
  'method.statStatewide': { en: 'statewide', ta: 'மாநிலம் முழுவதும்' },
  'method.statSkus': { en: 'SKUs priced', ta: 'விலையிட்ட SKU-கள்' },
  'method.statEvery': { en: 'every bottling', ta: 'ஒவ்வொரு பாட்டில் வகையும்' },

  'method.s1': { en: 'Where the data comes from', ta: 'தரவு எங்கிருந்து வருகிறது' },
  'method.s1aHead': { en: 'TASMAC consumer portal', ta: 'TASMAC நுகர்வோர் இணையதளம்' },
  'method.s1aBody': {
    en: 'The shop-locator and stock pages on {host} are a front end over a public JSON API. It publishes the shop register, the full MRP price list, supplier records, and — the part that matters — the current stock of every SKU in every shop, together with the time that shop was last counted.',
    ta: '{host} இல் உள்ள கடை தேடல் மற்றும் இருப்புப் பக்கங்கள் ஒரு பொது JSON API-யின் மேல் அமைந்தவை. அது கடைப் பதிவேடு, முழு MRP விலைப் பட்டியல், வழங்குநர் விவரங்கள், மற்றும் முக்கியமாக — ஒவ்வொரு கடையிலும் ஒவ்வொரு SKU-வின் தற்போதைய இருப்பையும், அந்தக் கடை கடைசியாக எண்ணப்பட்ட நேரத்தையும் வெளியிடுகிறது.',
  },
  'method.s1bHead': { en: 'TNGIS state GIS server', ta: 'TNGIS மாநில GIS சேவையகம்' },
  'method.s1bBody': {
    en: 'The consumer API organises shops by revenue district. TASMAC’s own management geography — five regions divided into thirty-eight TASMAC districts — is published only as map layers on {host}, along with geotagged coordinates for every shop, its depots, and the sensitive facilities within 500 m of each outlet. Those layers are joined here on shop number.',
    ta: 'நுகர்வோர் API கடைகளை வருவாய் மாவட்ட வாரியாகப் பிரிக்கிறது. TASMAC-இன் சொந்த நிர்வாகப் பிரிவு — ஐந்து மண்டலங்கள், முப்பத்தெட்டு TASMAC மாவட்டங்கள் — {host} இல் வரைபட அடுக்குகளாக மட்டுமே வெளியிடப்படுகிறது; அத்துடன் ஒவ்வொரு கடையின் புவி இருப்பிடம், கிடங்குகள், ஒவ்வொரு கடையிலிருந்தும் 500 மீட்டருக்குள் உள்ள முக்கிய இடங்களும் வெளியிடப்படுகின்றன. அந்த அடுக்குகள் கடை எண் மூலம் இங்கே இணைக்கப்படுகின்றன.',
  },

  'method.s2': { en: 'How a snapshot becomes a history', ta: 'ஒரு கணப் படம் எப்படி வரலாறாகிறது' },
  'method.s2a': {
    en: 'The feed only ever shows now. Every twenty minutes the whole state is swept, district by district, and each shop’s stock is compared against what it held at the previous reading. Only actual changes are written, so the history is an exact step function per shop and SKU rather than a pile of duplicated snapshots.',
    ta: 'ஊட்டம் எப்போதும் இப்போதைய நிலையை மட்டுமே காட்டுகிறது. ஒவ்வொரு இருபது நிமிடத்திற்கும் மாநிலம் முழுவதும் மாவட்ட வாரியாகப் படிக்கப்பட்டு, ஒவ்வொரு கடையின் இருப்பும் முந்தைய அளவீட்டோடு ஒப்பிடப்படுகிறது. உண்மையான மாற்றங்கள் மட்டுமே பதிவாகின்றன; அதனால் வரலாறு என்பது நகல் படங்களின் குவியலாக இல்லாமல், கடை மற்றும் SKU வாரியான துல்லியமான படிநிலைக் கோடாக அமைகிறது.',
  },
  'method.s2b': {
    en: 'A shop reports its own “last counted” clock, and stock can only genuinely have moved when that clock moves. The feed states that clock on a twelve-hour dial with no am/pm marker, so it is resolved against the time of the reading — exact for anything under twelve hours old, which a live feed always is.',
    ta: 'ஒவ்வொரு கடையும் தனது “கடைசியாக எண்ணிய” நேரத்தைத் தெரிவிக்கிறது; அந்த நேரம் மாறும்போது மட்டுமே இருப்பு உண்மையில் மாறியிருக்க முடியும். ஊட்டம் அந்த நேரத்தைப் பன்னிரண்டு மணி முறையில், முற்பகல்/பிற்பகல் குறியீடு இல்லாமல் தருகிறது; எனவே அது படிக்கப்பட்ட நேரத்தோடு ஒப்பிட்டுத் தீர்க்கப்படுகிறது — பன்னிரண்டு மணி நேரத்திற்குள் உள்ள எதற்கும் இது துல்லியமானது, நேரடி ஊட்டம் எப்போதும் அப்படித்தான்.',
  },

  'method.s3': { en: 'What the revenue figures mean', ta: 'வருவாய் எண்கள் எதைக் குறிக்கின்றன' },
  'method.s3a': {
    en: 'Sales are not published. They are inferred: where a shop’s stock of a line falls between two readings, those bottles left the shelf, and they are valued at that SKU’s MRP. A rise is a delivery.',
    ta: 'விற்பனை வெளியிடப்படுவதில்லை. அது கணிக்கப்படுகிறது: இரண்டு அளவீடுகளுக்கு இடையே ஒரு கடையின் ஒரு வரிசையின் இருப்பு குறைந்தால், அந்தப் பாட்டில்கள் அலமாரியை விட்டுச் சென்றுவிட்டன, அவை அந்த SKU-வின் MRP இல் மதிப்பிடப்படுகின்றன. இருப்பு கூடினால் அது புதிய வரத்து.',
  },
  'method.s3warn': { en: 'Read these as a floor, not a measurement', ta: 'இவற்றை அளவீடாக அல்ல, குறைந்தபட்சமாகவே கொள்ளவும்' },
  'method.s3l1': {
    en: 'Stock sold and replenished between two readings is invisible. If a shop sells 40 and receives 100, the reading shows +60 and no sale is recorded. This biases every figure downward.',
    ta: 'இரண்டு அளவீடுகளுக்கு இடையே விற்று மீண்டும் நிரப்பப்பட்ட இருப்பு தெரியாது. ஒரு கடை 40 விற்று 100 பெற்றால், அளவீடு +60 எனக் காட்டும், விற்பனை பதிவாகாது. இதனால் எல்லா எண்களும் குறைவாகவே இருக்கும்.',
  },
  'method.s3l2': { en: 'Counts are what each shop reports, not an audit.', ta: 'எண்ணிக்கை என்பது ஒவ்வொரு கடையும் தெரிவிப்பது; தணிக்கை அல்ல.' },
  'method.s3l3': {
    en: 'MRP is the shelf price, so revenue here is gross retail — not TASMAC’s margin, and not tax.',
    ta: 'MRP என்பது அலமாரி விலை; எனவே இங்குள்ள வருவாய் மொத்த சில்லறை விற்பனை — TASMAC-இன் லாபமோ வரியோ அல்ல.',
  },
  'method.s3l4': { en: 'A shop missing from a reading is treated as unknown, never as a sell-out.', ta: 'ஒரு அளவீட்டில் இல்லாத கடை தெரியாதது எனக் கொள்ளப்படுகிறது; விற்றுத் தீர்ந்தது எனக் கொள்ளப்படுவதில்லை.' },

  'method.s4': { en: 'Cross-checking the two sources', ta: 'இரு மூலங்களையும் ஒப்பிடுதல்' },
  'method.s4body': {
    en: 'Both governments’ datasets carry coordinates for the same shops, which makes them checkable against each other. Of {compared} shops with a fix in both, {agree} agree to within a kilometre, and the median disagreement is about 22 metres. The consumer feed returns 0°, 0° for a handful of shops — a genuine defect, corrected here from the GIS layer. Where the two disagree by more than ten kilometres, the shop has most likely moved and one source has not caught up.',
    ta: 'இரு அரசுத் தரவுத்தொகுப்புகளுமே ஒரே கடைகளுக்கான புவி இருப்பிடங்களைக் கொண்டுள்ளன; அதனால் அவை ஒன்றையொன்று சரிபார்க்கப் பயன்படுகின்றன. இரண்டிலும் இருப்பிடம் உள்ள {compared} கடைகளில், {agree} கடைகள் ஒரு கிலோமீட்டருக்குள் ஒத்துப்போகின்றன; இடைநிலை வேறுபாடு சுமார் 22 மீட்டர். சில கடைகளுக்கு நுகர்வோர் ஊட்டம் 0°, 0° எனத் தருகிறது — இது உண்மையான குறை, GIS அடுக்கிலிருந்து இங்கே சரிசெய்யப்பட்டுள்ளது. இரண்டும் பத்து கிலோமீட்டருக்கு மேல் வேறுபட்டால், கடை இடம் மாறியிருக்கக்கூடும், ஒரு மூலம் அதைப் பதிவு செய்யவில்லை.',
  },

  'method.s5': { en: 'How shops are classified', ta: 'கடைகள் எப்படி வகைப்படுத்தப்படுகின்றன' },
  'method.s5lede': { en: 'Classification uses stated attributes, not guesswork:', ta: 'வகைப்பாடு ஊகத்தை அல்ல, தெரிவிக்கப்பட்ட தகவலையே பயன்படுத்துகிறது:' },
  'method.s5elite': {
    en: 'flagged as a mall or premium outlet in TASMAC’s own shop register. These carry roughly three times the stock of an ordinary shop.',
    ta: 'TASMAC-இன் சொந்தக் கடைப் பதிவேட்டில் மால் அல்லது உயர்தரக் கடையாகக் குறிக்கப்பட்டவை. இவை சாதாரணக் கடையை விட ஏறக்குறைய மூன்று மடங்கு இருப்பு வைத்திருக்கின்றன.',
  },
  'method.s5normal': { en: 'an ordinary retail shop that is reporting stock.', ta: 'இருப்பைத் தெரிவிக்கும் சாதாரண சில்லறைக் கடை.' },
  'method.s5other': {
    en: 'a shop number in the register that reported no stock in the latest reading: closed, relocated, or an office rather than a shop.',
    ta: 'சமீபத்திய அளவீட்டில் இருப்பு எதுவும் தெரிவிக்காத, பதிவேட்டில் உள்ள கடை எண்: மூடப்பட்டது, இடம் மாறியது, அல்லது கடை அல்லாத அலுவலகம்.',
  },

  'method.s6': { en: 'Also on Telegram', ta: 'Telegram-இலும்' },
  'method.s6body': {
    en: 'The same data answers a simpler question — is the bottle I want in stock near me, and what does it cost. Share a location with the bot and it lists the nearest shops, then narrows by category and size down to price and availability. Saving a shop and a bottle turns that into a single tap.',
    ta: 'இதே தரவு எளிய கேள்விக்கும் பதில் தருகிறது — எனக்கு வேண்டிய பாட்டில் அருகில் இருக்கிறதா, விலை என்ன. போட்-டுடன் இருப்பிடத்தைப் பகிர்ந்தால் அது அருகிலுள்ள கடைகளைப் பட்டியலிடும், பின்பு பிரிவு மற்றும் அளவு வாரியாகக் குறுக்கி விலையையும் கிடைப்பையும் காட்டும். ஒரு கடையையும் ஒரு பாட்டிலையும் சேமித்தால் இது ஒரே தட்டலாகச் சுருங்கும்.',
  },
  'method.browseMap': { en: 'Browse the shop map →', ta: 'கடை வரைபடத்தைப் பார் →' },

  'method.s7': { en: 'Standing on', ta: 'நிற்கும் நிலை' },
  'method.s7body': {
    en: 'This is an independent mirror, not affiliated with TASMAC or the Government of Tamil Nadu. The figures are estimates derived from public data and should not be treated as official. Report overcharging to TASMAC on {phone}.',
    ta: 'இது ஒரு தனிப்பட்ட நகல்; TASMAC உடனோ தமிழ்நாடு அரசுடனோ தொடர்பில்லை. இங்குள்ள எண்கள் பொதுத் தரவிலிருந்து பெறப்பட்ட மதிப்பீடுகள், அவற்றை அதிகாரப்பூர்வமாகக் கொள்ளக் கூடாது. அதிக விலை வசூலிப்பதை {phone} எண்ணில் TASMAC-கிடம் புகார் செய்யவும்.',
  },

  // ── brand detail ──────────────────────────────────────────────
  'brand.madeByPrefix': { en: 'Made by ', ta: 'தயாரிப்பு: ' },
  'brand.lede': {
    en: 'A brand here is one commercial name across every size it is bottled in. Each size is a separate SKU with its own price and its own stock position.',
    ta: 'இங்கே ஒரு பிராண்ட் என்பது எல்லா அளவுகளிலும் பயன்படும் ஒரே வணிகப் பெயர். ஒவ்வொரு அளவும் தனித்தனி SKU — அதற்கே உரிய விலையும் இருப்பும் கொண்டது.',
  },
  'brand.statSizes': { en: 'Sizes', ta: 'அளவுகள்' },
  'brand.statSizesSub': { en: 'distinct bottlings', ta: 'தனித்த பாட்டில் வகைகள்' },
  'brand.statPriceSub': { en: 'per bottle', ta: 'பாட்டில் ஒன்றுக்கு' },
  'brand.statStock': { en: 'Bottles in stock', ta: 'இருப்பில் பாட்டில்கள்' },
  'brand.statAtMrp': { en: '{v} at MRP', ta: 'MRP இல் {v}' },
  'brand.statReach': { en: 'Widest reach', ta: 'அதிகபட்ச பரவல்' },
  'brand.statReachSub': { en: 'shops, best-stocked size', ta: 'கடைகள், அதிக இருப்புள்ள அளவு' },
  'brand.s1': { en: 'Every bottling', ta: 'எல்லா பாட்டில் வகைகளும்' },
  'brand.s1note': { en: 'price and availability by size', ta: 'அளவு வாரியாக விலையும் கிடைப்பும்' },
  'brand.empty': { en: 'No bottlings recorded', ta: 'பாட்டில் வகைகள் எதுவும் பதிவாகவில்லை' },
  'brand.perLitreNote': {
    en: 'Per-litre price is the honest comparison across sizes — the smallest bottle is rarely the cheapest drink.',
    ta: 'அளவுகளை ஒப்பிட லிட்டர் விலையே நேர்மையான அளவுகோல் — சிறிய பாட்டில் அரிதாகவே மலிவானது.',
  },
  'col.case': { en: 'Case', ta: 'பெட்டி' },
  'col.perLitre': { en: 'Per litre', ta: 'லிட்டருக்கு' },
  'col.perL': { en: 'Per L', ta: 'லிட்டர்' },

  // ── district detail ───────────────────────────────────────────
  'district.kicker': { en: 'Revenue district', ta: 'வருவாய் மாவட்டம்' },
  'district.lede': {
    en: '{reporting} of {registered} shops reported stock in the latest reading, counted at {at}.',
    ta: 'சமீபத்திய அளவீட்டில் {registered} கடைகளில் {reporting} கடைகள் இருப்பைத் தெரிவித்தன, {at} அன்று எண்ணப்பட்டது.',
  },
  'district.statStock': { en: 'Stock at MRP', ta: 'MRP இருப்பு மதிப்பு' },
  'district.statBottles': { en: '{n} bottles', ta: '{n} பாட்டில்கள்' },
  'district.statOf': { en: 'of {n}', ta: '{n} இல்' },
  'district.statAverage': { en: 'Average shop', ta: 'சராசரிக் கடை' },
  'district.statAverageSub': { en: 'stock at MRP', ta: 'MRP இருப்பு மதிப்பு' },
  'district.statCounted': { en: 'Counted at', ta: 'எண்ணிய நேரம்' },
  'district.statCountedSub': { en: 'district-wide clock', ta: 'மாவட்ட அளவிலான நேரம்' },
  'district.s1note': { en: '{n} in this district', ta: 'இந்த மாவட்டத்தில் {n}' },
  'district.empty': { en: 'No shops recorded', ta: 'கடைகள் எதுவும் பதிவாகவில்லை' },
  'col.taluk': { en: 'Taluk', ta: 'வட்டம்' },

  // ── supplier detail ───────────────────────────────────────────
  'supplier.importer': { en: 'Importer / FL2 supplier', ta: 'இறக்குமதியாளர் / FL2 வழங்குநர்' },
  'supplier.code': { en: 'Code {c}', ta: 'குறியீடு {c}' },
  'supplier.statBrandsSub': { en: 'product lines', ta: 'தயாரிப்பு வரிசைகள்' },
  'supplier.statSkusSub': { en: 'bottlings', ta: 'பாட்டில் வகைகள்' },
  'supplier.statBottles': { en: 'Bottles on shelves', ta: 'அடுக்குகளில் பாட்டில்கள்' },
  'supplier.statValueSub': { en: 'retail value in TASMAC shops', ta: 'TASMAC கடைகளில் சில்லறை மதிப்பு' },
  'supplier.s2': { en: 'Sales by type', ta: 'வகை வாரியாக விற்பனை' },
  'supplier.s2note': { en: 'estimated sales value, split by liquor type', ta: 'மது வகை வாரியாக மதிப்பிடப்பட்ட விற்பனை மதிப்பு' },
  'supplier.s2cap': { en: 'sold to date · units × MRP', ta: 'இதுவரை விற்பனை · அலகுகள் × MRP' },
  'supplier.s3d': { en: 'Daily sales', ta: 'தினசரி விற்பனை' },
  'supplier.s3dnote': { en: 'total rupees sold per day, inferred from falling stock', ta: 'குறையும் இருப்பிலிருந்து கணக்கிடப்பட்ட தினசரி விற்பனை' },
  'supplier.s3peak': { en: 'peak {d} · {v}', ta: 'உச்சம் {d} · {v}' },
  'supplier.s1': { en: 'Portfolio', ta: 'தயாரிப்புத் தொகுப்பு' },
  'supplier.s1note': { en: '{n} brands in TASMAC shops', ta: 'TASMAC கடைகளில் {n} பிராண்டுகள்' },
  'supplier.empty': { en: 'Nothing from this supplier is currently stocked', ta: 'இந்த வழங்குநரிடமிருந்து தற்போது எதுவும் இருப்பில் இல்லை' },

  // ── SKU detail ────────────────────────────────────────────────
  'sku.elite': { en: 'Elite / FL2 range', ta: 'உயர்தரம் / FL2 வரிசை' },
  'sku.perCase': { en: '{n} bottles per case', ta: 'பெட்டிக்கு {n} பாட்டில்கள்' },
  'sku.otherSizes': { en: 'Other sizes', ta: 'பிற அளவுகள்' },
  'sku.statMrp': { en: 'MRP per bottle', ta: 'பாட்டில் MRP' },
  'sku.statCase': { en: '₹{v} a case', ta: 'பெட்டிக்கு ₹{v}' },
  'sku.statShops': { en: 'Shops stocking', ta: 'இருப்பு வைத்துள்ள கடைகள்' },
  'sku.statDistricts': { en: '{n} districts', ta: '{n} மாவட்டங்கள்' },
  'sku.statSold': { en: 'Sold today', ta: 'இன்று விற்றது' },
  'sku.statSoldSub': { en: '{v} est.', ta: 'மதிப்பீடு {v}' },
  'sku.statAwaiting': { en: 'awaiting readings', ta: 'அளவீடுகள் எதிர்பார்க்கப்படுகின்றன' },
  'sku.s1': { en: 'Statewide stock trace', ta: 'மாநில அளவிலான இருப்புக் கோடு' },
  'sku.s1note': { en: '{n} readings', ta: '{n} அளவீடுகள்' },
  'sku.s2': { en: 'Daily movement', ta: 'நாளாந்த நகர்வு' },
  'sku.s2note': { en: 'statewide, inferred from falling stock', ta: 'மாநிலம் முழுவதும், குறையும் இருப்பிலிருந்து கணிக்கப்பட்டது' },
  'sku.s3': { en: 'Where it is', ta: 'எங்கே இருக்கிறது' },
  'sku.s3note': { en: 'bottles on hand by district', ta: 'மாவட்ட வாரியாக இருப்புப் பாட்டில்கள்' },
  'sku.s3empty': { en: 'Not in stock anywhere in the latest reading', ta: 'சமீபத்திய அளவீட்டில் எங்கும் இருப்பில் இல்லை' },
  'sku.s4': { en: 'Deepest stock', ta: 'மிக அதிக இருப்பு' },
  'sku.s4note': { en: 'shops holding the most of it', ta: 'அதிக அளவு வைத்திருக்கும் கடைகள்' },
  'sku.s5': { en: 'Price history', ta: 'விலை வரலாறு' },
  'sku.s5note': { en: 'MRP changes we have observed, and older published lists', ta: 'நாங்கள் கண்ட MRP மாற்றங்களும், பழைய வெளியிடப்பட்ட பட்டியல்களும்' },
  'sku.onePrice': {
    en: 'One price recorded so far — changes will appear here as they happen.',
    ta: 'இதுவரை ஒரே விலை பதிவாகியுள்ளது — மாற்றங்கள் நிகழும்போது இங்கே தோன்றும்.',
  },
  'sku.priceListed': {
    en: 'from a published TASMAC price list',
    ta: 'வெளியிடப்பட்ட TASMAC விலைப் பட்டியலிலிருந்து',
  },
  'sku.s6': { en: 'Where your money goes', ta: 'உங்கள் பணம் எங்கே செல்கிறது' },
  'sku.s6note': { en: 'this MRP, broken into tax and cost', ta: 'இந்த விலை — வரியும் விலையும் பிரித்து' },
  'cost.vat': { en: 'VAT + additional tax', ta: 'VAT + கூடுதல் வரி' },
  'cost.excise': { en: 'Excise duty', ta: 'கலால் வரி' },
  'cost.importFee': { en: 'Import special fee', ta: 'இறக்குமதி சிறப்புக் கட்டணம்' },
  'cost.base': { en: 'Base cost + TASMAC margin', ta: 'அடிப்படை விலை + TASMAC இலாபம்' },
  'cost.taxShare': { en: '{p}% of this bottle is state tax', ta: 'இந்த பாட்டிலில் {p}% மாநில வரி' },
  'cost.stateTitle': { en: 'The price of a drink', ta: 'ஒரு பானத்தின் விலை' },
  'cost.stateNote': { en: 'everything on shelves now, by where the money goes', ta: 'இப்போது அலமாரியில் உள்ள அனைத்தும் — பணம் எங்கே செல்கிறது' },
  'cost.stateHead': { en: '{p}% of the ₹ on shelves is state tax — {v} of it', ta: 'அலமாரியில் உள்ள தொகையில் {p}% மாநில வரி — {v}' },
  'cost.spiritNote': {
    en: 'VAT at the second point of sale is exact from the schedule; excise assumes the standard 42.8% v/v for spirits. Base + margin is the remainder — the published GOs do not separate them.',
    ta: 'இரண்டாம் விற்பனைப் புள்ளியில் VAT அட்டவணையிலிருந்து துல்லியம்; கலால் வரி 42.8% v/v என்ற நிலையான வலிமையை அடிப்படையாகக் கொண்டது. மீதி அடிப்படை + இலாபம்.',
  },
  'cost.foreignNote': {
    en: 'Imported / FL2 liquor is taxed at 14.5% VAT (not the 220% on domestic spirits), so most of an import’s price is landed cost, not state tax.',
    ta: 'இறக்குமதி / FL2 மதுவிற்கு 14.5% VAT (உள்நாட்டு 220% அல்ல), எனவே விலையில் பெரும்பகுதி இறக்குமதிச் செலவு.',
  },
  'sku.delisted': { en: 'Discontinued', ta: 'நிறுத்தப்பட்டது' },
  'sku.registered': { en: 'Registered · not yet in stock', ta: 'பதிவு · இருப்பில் இல்லை' },
  'sku.registeredNote': {
    en: 'This brand is on a current TASMAC price list but has not yet been reported in any shop’s stock by the live feed. Details will fill in when it appears.',
    ta: 'இந்த பிராண்ட் தற்போதைய TASMAC விலைப் பட்டியலில் உள்ளது, ஆனால் நேரடி ஊட்டத்தில் எந்த கடையின் இருப்பிலும் இதுவரை பதிவாகவில்லை.',
  },
  'sku.lastListed': { en: 'last listed', ta: 'கடைசி பட்டியல்' },
  'sku.priceGap': {
    en: 'Rows marked ‡ are dated price lists; changes between two such readings are not shown.',
    ta: '‡ குறியிட்ட வரிசைகள் தேதியிட்ட விலைப் பட்டியல்கள்; இரு பதிவுகளுக்கு இடையிலான மாற்றங்கள் காட்டப்படவில்லை.',
  },
  'col.day': { en: 'Day', ta: 'நாள்' },
  'col.received': { en: 'Received', ta: 'வரத்து' },
  'col.shopsOut': { en: 'Shops out', ta: 'தீர்ந்த கடைகள்' },
  'col.from': { en: 'From', ta: 'முதல்' },
  'col.until': { en: 'Until', ta: 'வரை' },
  'col.buyback': { en: 'Buyback', ta: 'திரும்பப் பெறல்' },
  'col.atMrp': { en: 'At MRP', ta: 'MRP இல்' },
  'common.current': { en: 'current', ta: 'தற்போது' },

  // ── shop detail ───────────────────────────────────────────────
  'shop.kicker': { en: 'Shop', ta: 'கடை' },
  'shop.statValue': { en: 'Stock at MRP', ta: 'MRP இருப்பு மதிப்பு' },
  'shop.statSkus': { en: 'SKUs in stock', ta: 'இருப்பில் SKU-கள்' },
  'shop.statBottles': { en: 'Bottles', ta: 'பாட்டில்கள்' },
  'shop.statCounted': { en: 'Counted at', ta: 'எண்ணிய நேரம்' },
  'shop.mall': { en: 'Mall outlet', ta: 'மால் கடை' },
  'shop.dm': { en: '{office} DM', ta: '{office} மாவட்ட மேலாளர்' },
  'shop.openInMaps': { en: 'Open in Maps ↗', ta: 'வரைபடத்தில் திற ↗' },
  'shop.statLines': { en: 'Lines in stock', ta: 'இருப்பில் வரிசைகள்' },
  'shop.statLinesSub': { en: 'distinct SKUs', ta: 'தனித்த SKU-கள்' },
  'shop.s1': { en: 'Stock trace', ta: 'இருப்புக் கோடு' },
  'shop.s2': { en: 'Daily trade', ta: 'நாளாந்த வணிகம்' },
  'shop.s2note': {
    en: 'opening and closing stock, and what left the shelf between',
    ta: 'தொடக்க மற்றும் இறுதி இருப்பு, இடையில் அலமாரியை விட்டுச் சென்றது',
  },
  'shop.s2foot': {
    en: 'Revenue is depletion × MRP. Stock that is sold and replenished between two readings is invisible to it, so this is a floor.',
    ta: 'வருவாய் = குறைந்த இருப்பு × MRP. இரண்டு அளவீடுகளுக்கு இடையே விற்று மீண்டும் நிரப்பப்பட்டது இதில் தெரியாது; எனவே இது குறைந்தபட்ச மதிப்பு.',
  },
  'shop.s3': { en: 'Recent movement', ta: 'சமீபத்திய நகர்வு' },
  'shop.s3note': { en: 'every level change we have seen', ta: 'நாங்கள் கண்ட ஒவ்வொரு இருப்பு மாற்றமும்' },
  'shop.s4': { en: 'On the shelf', ta: 'அடுக்கில்' },
  'shop.s4note': { en: '{n} lines in stock', ta: 'இருப்பில் {n} வரிசைகள்' },
  'shop.s4empty': { en: 'This shop reported no stock in the latest reading', ta: 'சமீபத்திய அளவீட்டில் இந்தக் கடை இருப்பு எதுவும் தெரிவிக்கவில்லை' },
  'col.when': { en: 'When', ta: 'எப்போது' },
  'col.was': { en: 'Was', ta: 'இருந்தது' },
  'col.now': { en: 'Now', ta: 'இப்போது' },
  'col.change': { en: 'Change', ta: 'மாற்றம்' },
  'col.at': { en: 'At', ta: 'நேரம்' },
  'col.opening': { en: 'Opening', ta: 'தொடக்கம்' },
  'col.closing': { en: 'Closing', ta: 'இறுதி' },
  'col.stockouts': { en: 'Stockouts', ta: 'தீர்ந்தவை' },
  'col.weight': { en: 'Weight', ta: 'பங்கு' },
  'shop.mix': { en: 'What it sells', ta: 'என்ன விற்கிறது' },
  'shop.mixNote': { en: 'share of inferred sales over {n} days, valued at MRP', ta: '{n} நாட்களில் கணிக்கப்பட்ட விற்பனையின் பங்கு, MRP மதிப்பில்' },
  'shop.mixEmpty': {
    en: 'No stock has fallen here yet — a sale can only be inferred once a second reading shows less on the shelf.',
    ta: 'இங்கே இதுவரை இருப்பு குறையவில்லை — இரண்டாவது அளவீட்டில் அலமாரியில் குறைவாக இருந்தால் மட்டுமே விற்பனையைக் கணிக்க முடியும்.',
  },
  'shop.mixBottles': { en: '{n} bottles', ta: '{n} பாட்டில்கள்' },

  // ── document metadata ─────────────────────────────────────────
  'meta.title': {
    en: 'TASMAC Ledger — Tamil Nadu liquor retail, mirrored',
    ta: 'TASMAC பேரேடு — தமிழ்நாட்டு மதுபான விற்பனை, நகலெடுக்கப்பட்டது',
  },
  'meta.description': {
    en: 'An independent mirror of the TASMAC public stock feed: every shop, every SKU, priced and tracked over time.',
    ta: 'TASMAC பொது இருப்புத் தரவின் தனிப்பட்ட நகல்: ஒவ்வொரு கடையும், ஒவ்வொரு பொருள் வகையும், விலையிடப்பட்டு காலப்போக்கில் கண்காணிக்கப்படுகிறது.',
  },

  // ── translation provenance ────────────────────────────────────
  'i18n.machineNote': {
    en: 'Place and product names are transliterated automatically — the source publishes English only.',
    ta: 'இட மற்றும் பொருள் பெயர்கள் தானாக ஒலிபெயர்க்கப்பட்டவை — மூலம் ஆங்கிலத்தில் மட்டுமே வெளியிடுகிறது.',
  },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;
