import { bexioFetch } from './client';

export interface BexioTax {
  id: number;
  uuid: string;
  name: string;
  code: string;
  digit: string;
  type: string;
  account_id: number;
  tax_settlement_type: string;
  value: number; // percentage
  net_tax_value: number | null;
  start_year: number;
  end_year: number | null;
  is_active: boolean;
  display_name: string;
  start_month: number | null;
  end_month: number | null;
}

let cache: { ts: number; taxes: BexioTax[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

export async function listTaxes(): Promise<BexioTax[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.taxes;
  const taxes = await bexioFetch<BexioTax[]>('/3.0/taxes?limit=2000');
  cache = { ts: Date.now(), taxes };
  return taxes;
}

// Find the active tax line matching a percentage (e.g. 8.1 for standard CH VAT).
export async function findTaxByRate(rate: number): Promise<BexioTax | null> {
  const taxes = await listTaxes();
  return (
    taxes.find(
      (t) => t.is_active && t.type === 'sales_tax' && Math.abs(t.value - rate) < 0.05
    ) || null
  );
}
