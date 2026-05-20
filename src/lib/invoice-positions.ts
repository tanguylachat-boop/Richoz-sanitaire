// Shared invoice line-item computation used by both the preview UI and the
// Bexio create endpoint. Keeps client and server in lockstep on totals.

export const HOURLY_RATE_CHF = 110;
export const VAT_RATE = 8.1;
export const PAYMENT_DAYS = 30;
export const HOUR_UNIT_ID = 2; // Bexio /2.0/unit → "h"

export interface MaterialInput {
  name: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceDraft {
  work_duration_minutes: number;
  hourly_rate_chf: number;
  materials: MaterialInput[];
}

export interface ComputedLine {
  label: string;
  amount: number;
  unit_label: string;
  unit_price: number;
  subtotal: number;
  is_labor?: boolean;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  net: number;
  vat: number;
  total: number;
  discount_pct: number;
}

export function computeTotals(draft: InvoiceDraft, discountPct = 0): ComputedTotals {
  const lines: ComputedLine[] = [];

  if (draft.work_duration_minutes > 0) {
    const hours = +(draft.work_duration_minutes / 60).toFixed(2);
    const subtotal = +(hours * draft.hourly_rate_chf).toFixed(2);
    lines.push({
      label: `Main d'œuvre — ${draft.work_duration_minutes} min`,
      amount: hours,
      unit_label: 'h',
      unit_price: draft.hourly_rate_chf,
      subtotal,
      is_labor: true,
    });
  }

  for (const m of draft.materials) {
    if (!m.name?.trim()) continue;
    const qty = Number(m.quantity) || 0;
    const price = Number(m.unit_price) || 0;
    const subtotal = +(qty * price).toFixed(2);
    lines.push({
      label: m.name.trim(),
      amount: qty,
      unit_label: '',
      unit_price: price,
      subtotal,
    });
  }

  const grossNet = lines.reduce((s, l) => s + l.subtotal, 0);
  const discount = +(grossNet * (discountPct / 100)).toFixed(2);
  const net = +(grossNet - discount).toFixed(2);
  const vat = +(net * (VAT_RATE / 100)).toFixed(2);
  const total = +(net + vat).toFixed(2);

  return { lines, net, vat, total, discount_pct: discountPct };
}

// Bexio kb_invoice position shape
export interface BexioPosition {
  type: 'KbPositionCustom';
  amount: number;
  unit_id?: number;
  tax_id?: number;
  text: string;
  unit_price: string;
  discount_in_percent: number;
}

export function toBexioPositions(
  draft: InvoiceDraft,
  discountPct: number,
  taxId: number | undefined
): BexioPosition[] {
  const positions: BexioPosition[] = [];

  if (draft.work_duration_minutes > 0) {
    const hours = +(draft.work_duration_minutes / 60).toFixed(2);
    positions.push({
      type: 'KbPositionCustom',
      amount: hours,
      unit_id: HOUR_UNIT_ID,
      tax_id: taxId,
      text: `Main d'œuvre — ${draft.work_duration_minutes} min`,
      unit_price: draft.hourly_rate_chf.toFixed(2),
      discount_in_percent: discountPct || 0,
    });
  }

  for (const m of draft.materials) {
    if (!m.name?.trim()) continue;
    const qty = Number(m.quantity) || 0;
    const price = Number(m.unit_price) || 0;
    if (qty <= 0) continue;
    positions.push({
      type: 'KbPositionCustom',
      amount: qty,
      tax_id: taxId,
      text: m.name.trim(),
      unit_price: price.toFixed(2),
      discount_in_percent: discountPct || 0,
    });
  }

  return positions;
}
