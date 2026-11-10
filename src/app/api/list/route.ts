import { NextResponse } from 'next/server';
import { skuList, brandList, type Dir } from '@/lib/queries';
import { page as i18n } from '@/lib/i18n';
import { toCatDto, toBrandDto } from '@/lib/list-dto';

export const dynamic = 'force-dynamic';

/** Page sizes match the first (server-rendered) batch on each page. */
const CAT_PAGE = 120;
const BRAND_PAGE = 100;

/**
 * Next batch for the infinite-scroll ledgers. Same filters as the page, keyed by
 * `p` (page index; the page itself is p=0). Rows come back already localised and
 * formatted so the client only prints them.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const kind = sp.get('kind');
  const search = sp.get('q')?.trim() || undefined;
  const category = sp.get('c') || undefined;
  const sort = sp.get('s') || undefined;
  const d = sp.get('d');
  const dir = (d === 'asc' ? 'asc' : d === 'desc' ? 'desc' : undefined) as Dir | undefined;
  const pageNo = Math.max(0, Number(sp.get('p') ?? 0) || 0);

  const { lang, t, L } = await i18n();
  const ctx = { lang, t: t as unknown as (k: string, v?: Record<string, string | number>) => string, L: L as unknown as (e: string, id: number | null | undefined, f: string | null) => string };

  if (kind === 'brands') {
    const { rows, total } = brandList({ search, category, sort, dir, limit: BRAND_PAGE, offset: pageNo * BRAND_PAGE });
    return NextResponse.json({
      rows: rows.map((b) => toBrandDto(b, ctx)),
      hasMore: (pageNo + 1) * BRAND_PAGE < total,
    });
  }

  // default: catalogue
  const inStockOnly = sp.get('stocked') !== '0';
  const { rows, total } = skuList({ search, category, sort, dir, inStockOnly, limit: CAT_PAGE, offset: pageNo * CAT_PAGE });
  return NextResponse.json({
    rows: rows.map((r) => toCatDto(r, ctx)),
    hasMore: (pageNo + 1) * CAT_PAGE < total,
  });
}
