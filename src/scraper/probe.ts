/**
 * Ad-hoc probe: is the stock-by-district endpoint actually returning every
 * shop, or truncating? Every recent snapshot logs exactly 10 shops per
 * district (380 total against ~4,871 registered) regardless of the
 * district's real size (53 to 379 shops), which smells like a hard
 * server-side cap rather than a real drop in reporting.
 */
import { api } from '../lib/api';
import { db } from '../lib/db';

async function main() {
  const d = db();
  const districtIds = [1, 2, 3, 4, 5].map((id) => id);
  for (const id of districtIds) {
    const registered = (d.prepare('SELECT COUNT(*) n FROM shop WHERE district_id = ?').get(id) as { n: number }).n;
    const payload = await api.stockByDistrict(id);
    const shopNos = payload.map((s) => Number(s.shopNumber));
    const unique = new Set(shopNos);
    console.log(
      `district ${id}: registered=${registered} returned=${payload.length} unique=${unique.size} ` +
        `first=${shopNos.slice(0, 3).join(',')} last=${shopNos.slice(-3).join(',')}`,
    );
  }
}

main().then(() => process.exit(0));
