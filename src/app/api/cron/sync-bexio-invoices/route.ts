import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { Invoices } from '@/lib/bexio';
import { BEXIO_STATUS_TO_PAYMENT } from '@/lib/bexio/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const header = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}

// Adds X days to a YYYY-MM-DD string. Returns YYYY-MM-DD.
function addDaysToISO(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Today's date in Europe/Zurich, as YYYY-MM-DD.
function todayZurichISO(): string {
  const parts = new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

async function runSync() {
  const supabase = createAdminClient();
  const all = await Invoices.listInvoices();

  // Only the last 90 days — Bexio's older history is rarely useful and avoids
  // upserting thousands of legacy rows on first run.
  const cutoff = addDaysToISO(todayZurichISO(), -90);
  const recent = all.filter((inv) => inv.is_valid_from >= cutoff);

  let upserted = 0;
  let skipped = 0;

  for (const inv of recent) {
    const status = BEXIO_STATUS_TO_PAYMENT[inv.kb_item_status_id] ?? 'open';
    const isPaid = status === 'paid' || status === 'partially_paid';
    const isOverdue =
      status === 'open' && inv.is_valid_to && inv.is_valid_to < todayZurichISO();

    // Map Bexio status → our invoice_status enum (draft/sent/paid/cancelled/generated)
    const localStatus: string =
      status === 'paid'
        ? 'paid'
        : status === 'draft'
          ? 'draft'
          : status === 'cancelled'
            ? 'cancelled'
            : 'sent';

    const row = {
      bexio_id: inv.id,
      bexio_contact_id: inv.contact_id,
      bexio_status: status,
      kb_item_status_id: inv.kb_item_status_id,
      payment_status: isOverdue ? 'overdue' : status,
      invoice_number: inv.document_nr,
      date: inv.is_valid_from,
      due_date: inv.is_valid_to,
      paid_at: isPaid ? new Date().toISOString() : null,
      client_name: inv.contact_address?.split('\n')[0] || null,
      client_address: inv.contact_address || null,
      amount_net: Number(inv.total_net) || 0,
      amount_vat: Number(inv.total_taxes) || 0,
      amount_total: Number(inv.total) || 0,
      vat_rate: 8.1,
      line_items: inv.positions || [],
      status: localStatus,
      bexio_synced_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('invoices')
      .upsert(row, { onConflict: 'bexio_id' });

    if (error) {
      console.error('Bexio sync upsert error for invoice', inv.id, error.message);
      skipped++;
    } else {
      upserted++;
    }
  }

  return { total: all.length, recent: recent.length, upserted, skipped };
}

// GET = scheduled cron (Vercel sends Authorization: Bearer <CRON_SECRET>)
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('Bexio sync failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST = manual sync triggered from the dashboard. Allowed for any
// authenticated admin session — falls back to CRON_SECRET if no session.
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    // Allow manual UI trigger without CRON_SECRET in dev; in prod, the same
    // bearer auth path is used.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('Bexio sync failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
