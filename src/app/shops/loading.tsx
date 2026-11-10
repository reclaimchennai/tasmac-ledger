import { LedgerSkeleton } from '@/components/skeleton';

/**
 * The shops page carries a map above its ledger, so its placeholder does too —
 * otherwise the whole ledger jumps 560px down the page the moment the map lands.
 */
export default function Loading() {
  return (
    <>
      <div className="map-placeholder rule-t rule-b mt-6" />
      <LedgerSkeleton rows={12} title={false} />
    </>
  );
}
