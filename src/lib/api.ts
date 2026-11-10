/**
 * Typed client for the public TASMAC consumer-portal API.
 * Base + endpoint list reverse-engineered from https://tasmac.tn.gov.in/main.js
 * (`environment.baseUrl`, and the FormService method bodies).
 *
 * Every endpoint is POST + JSON. Passing `''` (as the site does) or `{}` both work;
 * `null` throws a 500 upstream. Parameter names are inconsistent between endpoints
 * (i_ShopNumber, p_districtId, i_TalukaId, pBrandId) — mirrored faithfully below.
 */

const BASE = process.env.TASMAC_API ?? 'https://dashboard-api.tasmace2e.in/api/';

const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://tasmac.tn.gov.in',
  Referer: 'https://tasmac.tn.gov.in/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
};

export interface ApiEnvelope<T> {
  status: boolean;
  message: string;
  data?: T;
}

export class ApiError extends Error {
  constructor(readonly endpoint: string, readonly httpStatus: number, readonly body: string) {
    super(`${endpoint} → HTTP ${httpStatus}: ${body.slice(0, 200)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PostOpts {
  retries?: number;
  timeoutMs?: number;
  /** Treat `{status:false, message:"No data found"}` as an empty array rather than an error. */
  allowEmpty?: boolean;
}

export async function post<T>(endpoint: string, body: unknown = {}, opts: PostOpts = {}): Promise<T> {
  const { retries = 4, timeoutMs = 300_000, allowEmpty = true } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(30_000, 1500 * 2 ** (attempt - 1)));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(BASE + endpoint, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new ApiError(endpoint, res.status, text);

      let env: ApiEnvelope<T>;
      try {
        env = JSON.parse(text);
      } catch {
        throw new ApiError(endpoint, res.status, `non-JSON body: ${text.slice(0, 200)}`);
      }

      if (!env.status) {
        if (allowEmpty && /no data found/i.test(env.message)) return [] as unknown as T;
        throw new ApiError(endpoint, res.status, env.message);
      }
      return (env.data ?? ([] as unknown)) as T;
    } catch (err) {
      lastErr = err;
      // 409 = wrong parameter name; retrying will never help.
      if (err instanceof ApiError && err.httpStatus === 409) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ───────────────────────── response shapes ─────────────────────────

export interface RawLiquorType { brandId: number; brandName: string }
export interface RawDistrict { revenue_district_id: number; revenue_district_name: string }
export interface RawTaluk { taluk_code: number; taluk: string; district_code: number }
export interface RawShopRef { RVShopsNo: number; revenue_district_id: number; talukaId: number }

export interface RawShopLocation {
  RVShopsNo: number;
  isMallShop: number;
  Address: string | null;
  latitude: string | null;
  longitude: string | null;
  districtId: number;
  DMOffice: string | null;
  district_code: number;
  talukaId: number;
  talukaName: string | null;
}

export interface RawSupplier {
  supplierId: number;
  supplierName: string;
  supplierAddress: string | null;
  supplierAddressLine2: string | null;
  supplierAddressLine3: string | null;
  supplierCity: string | null;
  supplierCode: string | null;
}

/** MRP master: supplier → product line → one entry per pack size. */
export interface RawMrpSupplier {
  Supplier_Name: string;
  Product_Name: Array<{
    productName: string;
    productDetails: Array<{
      packSize: number;
      unitName: string;
      brandName: string;
      pkProductId: number;
      mrpPerBottle: number;
      supplierType: string | null;
    }>;
  }>;
}

export interface RawStockLine {
  brandId: number | string;
  packSize: number;
  unitName: string;
  brandName: string;
  productId: number;
  supplierId: number;
  productName: string;
  currentStock: number;
  supplierName: string;
  /** present only on the by-shopNumber endpoint */
  mrpPerBottle?: number;
  BuyBackamt?: number;
}

export interface RawShopStock {
  shopNumber: number | string;
  districtId: number;
  districtName: string;
  talukaId: number;
  talukaName?: string;
  last_updated_time: string | null;
  Stock_details: RawStockLine[];
}

// ───────────────────────── endpoints ─────────────────────────

export const api = {
  liquorTypes: () => post<RawLiquorType[]>('liquor/get-brandList'),
  districts: () => post<RawDistrict[]>('rv-shop/get-districtList'),
  taluks: () => post<RawTaluk[]>('rv-shop/get-talukList'),
  shops: () => post<RawShopRef[]>('rv-shop/get-shopList'),

  shopsByTaluk: (talukId: number) =>
    post<RawShopLocation[]>('rv-shop/get-shopListBy-TalukId', { i_TalukaId: talukId }),
  shopByNumber: (shopNo: number) =>
    post<RawShopLocation[]>('rv-shop/get-shopListBy-ShopNumber', { i_ShopNumber: shopNo }),

  /** production type must be exactly 'Distillery' | 'Brewery' | 'Winery'. */
  suppliersByType: (type: string) =>
    post<RawSupplier[]>('supplier/get-supplierListProductionType', { p_supplierProductionType: type }),

  mrpList: () => post<RawMrpSupplier[]>('liquor/get-productList'),
  mrpListByLiquorType: (brandId: number) =>
    post<RawMrpSupplier[]>('liquor/get-productListByBrand', { pBrandId: brandId }),

  /** Small calibration sample (~64 Chennai shops) — the only endpoint with 24-hour timestamps. */
  stockSample: () => post<RawShopStock[]>('liquor/get-stockDetails'),
  /**
   * Silently capped to 10 shops per call as of 2026-08 — was the workhorse
   * (every shop in a district, non-zero lines only) but is no longer usable
   * for a full sweep. Kept for the sample-size probe; harvest-stock.ts uses
   * `stockByDistrictAndTaluk` instead. See probe.ts.
   */
  stockByDistrict: (districtId: number) =>
    post<RawShopStock[]>('liquor/get-stockDetailsBy-DistrictId', { p_districtId: districtId }),
  /** The real workhorse now: every shop in one taluk, non-zero lines only. Not capped. */
  stockByDistrictAndTaluk: (districtId: number, talukId: number) =>
    post<RawShopStock[]>('liquor/get-stockDetailsBy-DistrictId-talukId', {
      p_districtId: districtId,
      p_talukId: talukId,
    }),
  /** Full catalogue for one shop, including zero-stock lines, MRP and buyback. */
  stockByShop: (shopNo: number) =>
    post<RawShopStock[]>('liquor/get-stockDetailsBy-shopNumber', { i_ShopNumber: shopNo }),
};

export const SUPPLIER_PRODUCTION_TYPES = ['Distillery', 'Brewery', 'Winery'] as const;
