/**
 * Row DTOs for the infinite-scroll ledgers.
 *
 * The catalogue and brands lists paint two layouts (a wide table and narrow
 * cards) and localise every name and figure server-side. To append more rows as
 * the reader scrolls, the client needs those rows already localised and
 * formatted — so the server maps each row to a flat DTO of ready-to-print
 * strings (plus the raw category code, which keys the colour swatch). The same
 * mapper feeds the first server render and the /api/list batches, so the markup
 * has one source of truth.
 */
import type { SkuRow, BrandRow } from '@/lib/queries';
import { compactCount, count, inr, size, sizeList } from '@/lib/format';
import type { Lang } from '@/lib/i18n-shared';

export interface ListCtx {
  lang: Lang;
  // Loosely typed on purpose: these lists build category keys dynamically.
  t: (key: string, vars?: Record<string, string | number>) => string;
  L: (entity: string, id: number | null | undefined, fallback: string | null) => string;
}

export interface CatDto {
  id: number;
  name: string;
  sizeLabel: string;
  category: string | null;
  categoryLabel: string | null;
  supplierId: number | null;
  supplierName: string;
  mrpLabel: string;
  shopsLabel: string;
  bottlesLabel: string;
  valueLabel: string;
  flag: 'delisted' | 'registered' | null;
}

export function toCatDto(r: SkuRow, ctx: ListCtx): CatDto {
  return {
    id: r.sku_id,
    name: ctx.L('sku', r.sku_id, r.product_name),
    sizeLabel: size(r.unit_name, ctx.lang),
    category: r.category,
    categoryLabel: r.category ? ctx.t(`category.${r.category}`) : null,
    supplierId: r.supplier_id,
    supplierName: ctx.L('supplier', r.supplier_id, r.supplier_name) ?? '',
    mrpLabel: r.mrp ? `₹${r.mrp}` : '—',
    shopsLabel: count(r.shops_stocking),
    bottlesLabel: compactCount(r.units, ctx.lang),
    valueLabel: inr(r.value_paise, { compact: true, lang: ctx.lang }),
    flag: r.delisted ? 'delisted' : r.registered ? 'registered' : null,
  };
}

export interface BrandDto {
  id: number;
  name: string;
  typesLabel: string;
  sizesLabel: string;
  variants: number;
  supplierId: number | null;
  supplierName: string;
  priceLabel: string;
  shopsLabel: string;
  bottlesLabel: string;
  valueLabel: string;
}

export function toBrandDto(b: BrandRow, ctx: ListCtx): BrandDto {
  const types = b.categories
    ? b.categories.split(',').map((c) => ctx.t(`category.${c.trim()}`)).join(', ')
    : '—';
  return {
    id: b.product_line_id,
    name: ctx.L('product_line', b.product_line_id, b.name),
    typesLabel: types,
    sizesLabel: b.sizes ? sizeList(b.sizes, ctx.lang) : String(b.variants),
    variants: b.variants,
    supplierId: b.supplier_id,
    supplierName: ctx.L('supplier', b.supplier_id, b.supplier_name) ?? '—',
    priceLabel: b.min_mrp === b.max_mrp ? `₹${b.min_mrp}` : `₹${b.min_mrp}–${b.max_mrp}`,
    shopsLabel: count(b.shops_stocking),
    bottlesLabel: compactCount(b.units, ctx.lang),
    valueLabel: inr(b.value_paise, { compact: true, lang: ctx.lang }),
  };
}
