/**
 * TASMAC Ledger Telegram bot.
 *
 * Flow the bot is built around:
 *   share location → nearest shops → pick one → broad category → size → bottle
 *   ★ saves a shop or a bottle, and /saved answers "is it in stock, and what does
 *   it cost" in one message without any navigation.
 *   Any plain text is a product search that always reports BOTH price and where
 *   it is actually available.
 *
 * Long polling rather than a webhook, so it runs from a laptop with no public
 * URL. The update cursor lives in SQLite, so a restart resumes rather than
 * replaying.
 *
 * Callback data is capped at 64 bytes by Telegram, hence the terse `c:` codes.
 */
// .env.local first (that is the gitignored one Next.js also reads), then .env.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { readFileSync } from 'node:fs';
import { assertToken, esc, tg, type Keyboard, type TgCallback, type TgMessage, type TgUpdate } from './telegram';
import * as q from './queries';
import { stamp } from '../lib/format';
import { log } from '../scraper/util';

/**
 * Public base URL for deep links.
 *
 * A Cloudflare quick tunnel is handed a fresh hostname every time it reconnects,
 * so this is re-read from disk (cheaply, cached for a minute) rather than
 * captured at startup — otherwise every link the bot sends would 404 after the
 * first tunnel reconnect.
 */
const URL_FILE = 'data/tunnel-url.txt';
let siteCache = { url: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000', at: 0 };

function site(): string {
  const now = Date.now();
  if (now - siteCache.at < 60_000) return siteCache.url;
  let url = siteCache.url;
  try {
    url = readFileSync(URL_FILE, 'utf8').trim() || url;
  } catch {
    // No tunnel running — fall back to whatever we already had.
  }
  siteCache = { url, at: now };
  return url;
}

const money = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const km = (m: number) => (m < 950 ? `${m} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`);
const CLASS_MARK: Record<string, string> = {
  elite: ' ✦',
  normal: '',
  closed: ' — CLOSED',
  other: ' (not trading)',
};

/** Stock phrased the way someone standing outside a shop would want it. */
function availability(qty: number | null | undefined): string {
  if (qty == null) return '❔ not listed';
  if (qty <= 0) return '❌ out of stock';
  if (qty < 12) return `⚠️ only ${qty} left`;
  return `✅ ${qty.toLocaleString('en-IN')} in stock`;
}

// ─────────────────────────── screens ───────────────────────────

const HOME_KEYBOARD: Keyboard = [
  [{ text: '📍 Find shops near me', callback_data: 'help:loc' }],
  [{ text: '⭐ My saved list', callback_data: 'saved' }, { text: '🔎 Search a brand', callback_data: 'help:search' }],
];

function welcome(name?: string | null): string {
  return [
    `<b>TASMAC Ledger</b>${name ? `, hello ${esc(name)}` : ''}`,
    '',
    'I mirror the stock TASMAC publishes for every one of its shops, and I keep the readings, so I can tell you what is on the shelf and what it costs.',
    '',
    '• <b>Share your location</b> and I will list the nearest shops.',
    '• <b>Type a brand name</b> and I will give you the price and where it is in stock.',
    '• <b>Tap ★</b> on a shop or a bottle to save it — /saved then answers in one tap.',
    '',
    '<i>Stock is what the shop last reported, not a live till. Always check the printed MRP before paying.</i>',
  ].join('\n');
}

const LOCATION_PROMPT = {
  keyboard: [[{ text: '📍 Share my location', request_location: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function sendNearby(chatId: number, lat: number, lon: number) {
  const shops = q.nearby(lat, lon, 8);
  if (!shops.length) {
    await tg.sendMessage(chatId, 'No TASMAC shop found within about 50 km of that point.');
    return;
  }
  const lines = shops.map(
    (s, i) =>
      `${i + 1}. <b>#${s.shop_no}</b>${CLASS_MARK[s.shop_class ?? ''] ?? ''} — ${km(s.distance_m)}\n` +
      `    ${esc(s.taluk ?? '')}${s.district ? `, ${esc(s.district)}` : ''}` +
      `${s.sku_count ? `\n    ${s.sku_count} lines in stock · counted ${stamp(s.reported_at, { withDate: false })}` : ''}`,
  );
  const keyboard: Keyboard = [];
  for (let i = 0; i < shops.length; i += 2) {
    keyboard.push(
      shops.slice(i, i + 2).map((s) => ({ text: `#${s.shop_no} · ${km(s.distance_m)}`, callback_data: `s:${s.shop_no}` })),
    );
  }
  await tg.sendMessage(chatId, `<b>Nearest shops</b>\n\n${lines.join('\n\n')}\n\n✦ = elite outlet`, { keyboard });
}

function shopScreen(chatId: number, shopNo: number): { text: string; keyboard: Keyboard } {
  const s = q.shopHeader(shopNo);
  if (!s) return { text: 'That shop is not in the register.', keyboard: [] };

  const cats = q.shopCategories(shopNo);
  const text = [
    `<b>Shop #${shopNo}</b>${CLASS_MARK[s.shop_class ?? ''] ?? ''}`,
    `${esc(s.taluk ?? '')}${s.district ? `, ${esc(s.district)}` : ''}`,
    s.address ? `<i>${esc(s.address)}</i>` : '',
    '',
    s.shop_class === 'closed'
      ? '⛔ <b>This shop has been closed by government order.</b>'
      : s.sku_count
        ? `${s.sku_count} lines · ${(s.units ?? 0).toLocaleString('en-IN')} bottles · counted ${stamp(s.reported_at)}`
        : 'This shop has not reported stock in the latest reading.',
    cats.length ? '\nWhat would you like?' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const keyboard: Keyboard = [];
  for (let i = 0; i < cats.length; i += 2) {
    keyboard.push(
      cats.slice(i, i + 2).map((c) => ({
        text: `${c.category} · ${c.lines}`,
        callback_data: `c:${shopNo}:${c.category}`,
      })),
    );
  }
  keyboard.push([
    { text: q.isFavShop(chatId, shopNo) ? '★ Saved' : '☆ Save this shop', callback_data: `fs:${shopNo}` },
    { text: 'Open ↗', url: `${site()}/shops/${shopNo}` },
  ]);
  return { text, keyboard };
}

function sizeScreen(shopNo: number, category: string): { text: string; keyboard: Keyboard } {
  const sizes = q.shopSizes(shopNo, category);
  const keyboard: Keyboard = [];
  for (let i = 0; i < sizes.length; i += 3) {
    keyboard.push(
      sizes.slice(i, i + 3).map((s) => ({
        text: `${s.unit_name} · ${s.lines}`,
        callback_data: `i:${shopNo}:${category}:${s.unit_name}:0`,
      })),
    );
  }
  keyboard.push([
    { text: 'All sizes', callback_data: `i:${shopNo}:${category}:*:0` },
    { text: '‹ Back', callback_data: `s:${shopNo}` },
  ]);
  return {
    text: `<b>${esc(category)}</b> at shop #${shopNo}\n\nPick a size, or see everything.`,
    keyboard,
  };
}

function itemScreen(
  chatId: number, shopNo: number, category: string, unit: string, offset: number,
): { text: string; keyboard: Keyboard } {
  const unitName = unit === '*' ? null : unit;
  const page = q.shopItems(shopNo, category, unitName, offset, 8);
  const hasMore = page.length > 8;
  const items = page.slice(0, 8);
  const total = q.countShopItems(shopNo, category, unitName);

  if (!items.length) return { text: 'Nothing in stock here in that line.', keyboard: [[{ text: '‹ Back', callback_data: `s:${shopNo}` }]] };

  const lines = items.map(
    (it) =>
      `<b>${money(it.mrp)}</b> · ${esc(it.product_name)} <code>${esc(it.unit_name ?? '')}</code>\n` +
      `    ${availability(it.qty)}`,
  );

  const keyboard: Keyboard = items.map((it) => [
    {
      text: `${q.isFavSku(chatId, it.sku_id) ? '★' : '☆'} ${money(it.mrp)} · ${it.product_name.slice(0, 28)}`,
      callback_data: `k:${it.sku_id}:${shopNo}`,
    },
  ]);

  const nav: Keyboard[number] = [];
  if (offset > 0) nav.push({ text: '‹ Prev', callback_data: `i:${shopNo}:${category}:${unit}:${Math.max(0, offset - 8)}` });
  if (hasMore) nav.push({ text: 'Next ›', callback_data: `i:${shopNo}:${category}:${unit}:${offset + 8}` });
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '‹ Sizes', callback_data: `c:${shopNo}:${category}` }, { text: '‹ Shop', callback_data: `s:${shopNo}` }]);

  return {
    text:
      `<b>${esc(category)}${unitName ? ` · ${esc(unitName)}` : ''}</b> at shop #${shopNo}\n` +
      `<i>${offset + 1}–${offset + items.length} of ${total}, cheapest first</i>\n\n${lines.join('\n')}`,
    keyboard,
  };
}

function skuScreen(chatId: number, skuId: number, shopNo: number | null): { text: string; keyboard: Keyboard } {
  const info = q.skuInfo(skuId);
  if (!info) return { text: 'Unknown product.', keyboard: [] };

  const parts = [
    `<b>${esc(info.product_name)}</b>`,
    `${esc(info.unit_name ?? '')} · <b>${money(info.mrp)}</b>${info.category ? ` · ${esc(info.category)}` : ''}`,
    info.supplier_name ? `<i>${esc(info.supplier_name)}</i>` : '',
  ];

  if (shopNo) {
    const here = q.stockAt(shopNo, skuId);
    parts.push('', `<b>At shop #${shopNo}:</b> ${availability(here?.qty)}`);
    if (here?.reported_at) parts.push(`<i>counted ${stamp(here.reported_at)}</i>`);
  }

  const user = q.getUser(chatId);
  if (user?.last_lat != null && user.last_lon != null) {
    const near = q.nearestWithSku(user.last_lat, user.last_lon, skuId, 5).filter((n) => n.shop_no !== shopNo);
    if (near.length) {
      parts.push('', '<b>Also in stock near you:</b>');
      for (const n of near) parts.push(`• #${n.shop_no} — ${km(n.distance_m)} · ${availability(n.qty)}`);
    }
  }

  const keyboard: Keyboard = [
    [
      { text: q.isFavSku(chatId, skuId) ? '★ Saved' : '☆ Save this bottle', callback_data: `fk:${skuId}:${shopNo ?? 0}` },
      { text: 'Open ↗', url: `${site()}/catalogue/${skuId}` },
    ],
  ];
  if (shopNo) keyboard.push([{ text: '‹ Back to shop', callback_data: `s:${shopNo}` }]);
  return { text: parts.join('\n'), keyboard };
}

/**
 * The payoff screen: for every saved bottle, its price and whether each saved
 * shop has it right now — the question the bot exists to answer in one tap.
 */
function savedScreen(chatId: number): { text: string; keyboard: Keyboard } {
  const shops = q.favShops(chatId);
  const skus = q.favSkus(chatId);

  if (!shops.length && !skus.length) {
    return {
      text:
        '<b>Nothing saved yet</b>\n\nShare your location to find shops, then tap ☆ on a shop or a bottle. ' +
        'After that, /saved tells you instantly what is in stock and what it costs.',
      keyboard: HOME_KEYBOARD,
    };
  }

  const parts: string[] = [];

  if (skus.length && shops.length) {
    parts.push('<b>Your bottles, at your shops</b>');
    for (const k of skus) {
      parts.push('', `<b>${money(k.mrp)}</b> · ${esc(k.product_name)} <code>${esc(k.unit_name ?? '')}</code>`);
      for (const s of shops) {
        const st = q.stockAt(s.shop_no, k.sku_id);
        parts.push(`    #${s.shop_no} ${esc(s.taluk ?? '')} — ${availability(st?.qty)}`);
      }
    }
  } else if (skus.length) {
    parts.push('<b>Your bottles</b>', '<i>Save a shop too and I will check stock automatically.</i>');
    for (const k of skus) parts.push('', `<b>${money(k.mrp)}</b> · ${esc(k.product_name)} <code>${esc(k.unit_name ?? '')}</code>`);
  } else {
    parts.push('<b>Your shops</b>', '<i>Save a bottle and I will track it at these shops.</i>');
    for (const s of shops) {
      parts.push('', `<b>#${s.shop_no}</b> ${esc(s.taluk ?? '')} — ${s.sku_count ?? 0} lines, counted ${stamp(s.reported_at, { withDate: false })}`);
    }
  }

  const keyboard: Keyboard = [];
  for (let i = 0; i < shops.length; i += 2) {
    keyboard.push(shops.slice(i, i + 2).map((s) => ({ text: `#${s.shop_no} ${s.taluk ?? ''}`.slice(0, 30), callback_data: `s:${s.shop_no}` })));
  }
  for (const k of skus.slice(0, 6)) {
    keyboard.push([{ text: `${k.product_name} ${k.unit_name ?? ''}`.slice(0, 34), callback_data: `k:${k.sku_id}:${shops[0]?.shop_no ?? 0}` }]);
  }
  return { text: parts.join('\n'), keyboard };
}

function searchScreen(chatId: number, term: string): { text: string; keyboard: Keyboard } {
  const hits = q.searchSkus(term, 8);
  if (!hits.length) {
    return {
      text: `Nothing matching <b>${esc(term)}</b>.\n\nTry part of the brand name — “Old Monk”, “Kingfisher”, “8 PM”.`,
      keyboard: HOME_KEYBOARD,
    };
  }

  const user = q.getUser(chatId);
  const favShop = q.favShops(chatId)[0];
  const parts = [`<b>“${esc(term)}”</b> — price and availability`, ''];

  for (const h of hits) {
    parts.push(
      `<b>${money(h.mrp)}</b> · ${esc(h.product_name)} <code>${esc(h.unit_name ?? '')}</code>\n` +
        `    in ${h.shops_stocking.toLocaleString('en-IN')} shops · ${h.total_units.toLocaleString('en-IN')} bottles statewide`,
    );
    if (favShop) {
      const at = q.stockAt(favShop.shop_no, h.sku_id);
      parts.push(`    at your shop #${favShop.shop_no}: ${availability(at?.qty)}`);
    } else if (user?.last_lat != null && user.last_lon != null) {
      const near = q.nearestWithSku(user.last_lat, user.last_lon, h.sku_id, 1)[0];
      parts.push(near ? `    nearest: #${near.shop_no}, ${km(near.distance_m)} · ${availability(near.qty)}` : '    none in stock near you');
    }
  }

  if (!favShop && user?.last_lat == null) {
    parts.push('', '<i>Share your location and I will also tell you where to buy it.</i>');
  }

  const keyboard: Keyboard = hits.map((h) => [
    { text: `${money(h.mrp)} · ${h.product_name.slice(0, 30)}`, callback_data: `k:${h.sku_id}:${favShop?.shop_no ?? 0}` },
  ]);
  return { text: parts.join('\n'), keyboard };
}

// ─────────────────────────── dispatch ───────────────────────────

async function onMessage(m: TgMessage) {
  const chatId = m.chat.id;
  q.touchUser(chatId, m.from?.first_name, m.from?.username);

  if (m.location) {
    q.saveLocation(chatId, m.location.latitude, m.location.longitude);
    await sendNearby(chatId, m.location.latitude, m.location.longitude);
    return;
  }

  const text = (m.text ?? '').trim();
  if (!text) return;

  if (text.startsWith('/')) {
    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    switch (cmd) {
      case '/start':
      case '/help':
        await tg.sendMessage(chatId, welcome(m.from?.first_name), { keyboard: HOME_KEYBOARD });
        await tg.sendMessage(chatId, 'Tap below to share your location whenever you want nearby shops.', { replyMarkup: LOCATION_PROMPT });
        return;
      case '/near':
        await tg.sendMessage(chatId, 'Share your location and I will list the nearest shops.', { replyMarkup: LOCATION_PROMPT });
        return;
      case '/saved': {
        const s = savedScreen(chatId);
        await tg.sendMessage(chatId, s.text, { keyboard: s.keyboard });
        return;
      }
      case '/shop': {
        const n = Number(text.split(/\s+/)[1]);
        if (!Number.isFinite(n)) { await tg.sendMessage(chatId, 'Give me a shop number, like <code>/shop 4188</code>.'); return; }
        const s = shopScreen(chatId, n);
        await tg.sendMessage(chatId, s.text, { keyboard: s.keyboard });
        return;
      }
      default:
        await tg.sendMessage(chatId, 'Unknown command. Try /start, /near, /saved, or just type a brand name.');
        return;
    }
  }

  // A bare number is almost always a shop number; anything else is a search.
  if (/^\d{1,5}$/.test(text) && q.shopHeader(Number(text))) {
    const s = shopScreen(chatId, Number(text));
    await tg.sendMessage(chatId, s.text, { keyboard: s.keyboard });
    return;
  }

  const s = searchScreen(chatId, text);
  await tg.sendMessage(chatId, s.text, { keyboard: s.keyboard });
}

async function onCallback(cb: TgCallback) {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) return;
  q.touchUser(chatId, cb.from.first_name, cb.from.username);

  // `c:` and `i:` embed a category name, which may itself contain no colon —
  // safe because categories are single words (WHISKY, BEER, …).
  const [kind, ...rest] = (cb.data ?? '').split(':');
  let screen: { text: string; keyboard: Keyboard } | null = null;
  let toast: string | undefined;

  switch (kind) {
    case 'help':
      if (rest[0] === 'loc') {
        await tg.answerCallback(cb.id);
        await tg.sendMessage(chatId, 'Tap the button to share your location.', { replyMarkup: LOCATION_PROMPT });
        return;
      }
      await tg.answerCallback(cb.id);
      await tg.sendMessage(chatId, 'Just type a brand name — “Old Monk”, “Kingfisher”, “8 PM” — and I will give you price and availability.');
      return;

    case 's': screen = shopScreen(chatId, Number(rest[0])); break;
    case 'c': screen = sizeScreen(Number(rest[0]), rest[1]); break;
    case 'i': screen = itemScreen(chatId, Number(rest[0]), rest[1], rest[2], Number(rest[3]) || 0); break;
    case 'k': screen = skuScreen(chatId, Number(rest[0]), Number(rest[1]) || null); break;
    case 'saved': screen = savedScreen(chatId); break;

    case 'fs': {
      const on = q.toggleFavShop(chatId, Number(rest[0]));
      toast = on ? 'Shop saved' : 'Shop removed';
      screen = shopScreen(chatId, Number(rest[0]));
      break;
    }
    case 'fk': {
      const on = q.toggleFavSku(chatId, Number(rest[0]));
      toast = on ? 'Bottle saved — see /saved' : 'Bottle removed';
      screen = skuScreen(chatId, Number(rest[0]), Number(rest[1]) || null);
      break;
    }
  }

  await tg.answerCallback(cb.id, toast);
  if (!screen) return;
  // Editing in place keeps the chat from filling with dead menus. Telegram
  // rejects an edit that changes nothing, which is harmless here.
  await tg.editMessage(chatId, messageId, screen.text, screen.keyboard).catch((e) => {
    if (!/message is not modified/i.test(String(e))) throw e;
  });
}

async function handle(u: TgUpdate) {
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (err) {
    log(`update ${u.update_id} failed: ${err instanceof Error ? err.message : String(err)}`);
    const chatId = u.message?.chat.id ?? u.callback_query?.message?.chat.id;
    if (chatId) await tg.sendMessage(chatId, 'Something went wrong handling that. Try /start.').catch(() => {});
  }
}

export async function run() {
  assertToken();
  const me = await tg.getMe();
  log(`bot @${me.username} online`);

  await tg.setMyCommands([
    { command: 'start', description: 'What this bot does' },
    { command: 'near', description: 'Find TASMAC shops near you' },
    { command: 'saved', description: 'Your saved shops and bottles' },
    { command: 'shop', description: 'Open a shop by number' },
  ]);

  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; log(`${sig} — stopping`); });

  while (!stopping) {
    try {
      const updates = await tg.getUpdates(q.getOffset());
      for (const u of updates) {
        await handle(u);
        q.setOffset(u.update_id + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/timeout|aborted/i.test(msg)) {
        log(`poll error: ${msg}`);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
  log('bot stopped');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error(e); process.exit(1); });
}
