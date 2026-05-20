import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { Contacts, Invoices, Taxes } from '@/lib/bexio';
import { BEXIO_STATUS_TO_PAYMENT, type BexioInvoicePosition } from '@/lib/bexio/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HOURLY_RATE_CHF = 110;
const VAT_RATE = 8.1;
const PAYMENT_DAYS = 30;
const HOUR_UNIT_ID = 2; // Bexio /2.0/unit → "h" (id 2 is the default Stunde/heure unit)

interface Material {
  name?: string;
  quantity?: number;
  unit_price?: number;
}

interface Regie {
  id: string;
  name: string;
  address: string | null;
  email_contact: string | null;
  billing_email: string | null;
  discount_percentage: number | null;
  bexio_contact_id: number | null;
}

interface Report {
  id: string;
  work_duration_minutes: number | null;
  supplies_text: string | null;
  materials_used: Material[] | null;
  text_content: string | null;
}

interface Intervention {
  id: string;
  title: string;
  address: string | null;
  date_planned: string | null;
  work_order_number: string | null;
  status: string;
  client_info: { name?: string; phone?: string } | null;
  regie: Regie | null;
  reports: Report[];
  invoices: { id: string }[];
}

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

function addDaysToISO(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function resolveBexioContact(
  regie: Regie,
  supabase: ReturnType<typeof createAdminClient>,
  bexioUserId: number
): Promise<number> {
  if (regie.bexio_contact_id) return regie.bexio_contact_id;

  // Try to find an existing contact by exact name match first.
  const found = await Contacts.searchContacts(regie.name);
  const exact = found.find((c) => c.name_1.trim().toLowerCase() === regie.name.trim().toLowerCase());
  if (exact) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('regies')
      .update({ bexio_contact_id: exact.id })
      .eq('id', regie.id);
    return exact.id;
  }

  // Otherwise create one. Bexio expects address fields split, but we only
  // have a free-text address; pass the whole string as `address`.
  const created = await Contacts.createContact({
    contact_type_id: 1, // company
    name_1: regie.name,
    address: regie.address || undefined,
    country_id: 1, // Switzerland
    mail: regie.billing_email || regie.email_contact || undefined,
    user_id: bexioUserId,
    owner_id: bexioUserId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('regies')
    .update({ bexio_contact_id: created.id })
    .eq('id', regie.id);

  return created.id;
}

function buildPositions(
  report: Report,
  discountPct: number,
  taxId: number | undefined
): BexioInvoicePosition[] {
  const positions: BexioInvoicePosition[] = [];

  const minutes = report.work_duration_minutes || 0;
  if (minutes > 0) {
    const hours = +(minutes / 60).toFixed(2);
    positions.push({
      type: 'KbPositionCustom',
      amount: hours,
      unit_id: HOUR_UNIT_ID,
      tax_id: taxId,
      text: `Main d'œuvre — ${minutes} min`,
      unit_price: HOURLY_RATE_CHF.toFixed(2),
      discount_in_percent: discountPct || 0,
    });
  }

  const materials = Array.isArray(report.materials_used) ? report.materials_used : [];
  for (const m of materials) {
    if (!m?.name) continue;
    const qty = Number(m.quantity) || 1;
    const price = Number(m.unit_price) || 0;
    positions.push({
      type: 'KbPositionCustom',
      amount: qty,
      tax_id: taxId,
      text: m.name,
      unit_price: price.toFixed(2),
      discount_in_percent: discountPct || 0,
    });
  }

  // Fallback: free-text supplies without prices → one position priced at 0
  // so the admin can edit it directly in Bexio before sending.
  if (materials.length === 0 && report.supplies_text?.trim()) {
    positions.push({
      type: 'KbPositionCustom',
      amount: 1,
      tax_id: taxId,
      text: `Fournitures : ${report.supplies_text.trim()}`,
      unit_price: '0.00',
      discount_in_percent: discountPct || 0,
    });
  }

  return positions;
}

export async function POST(req: Request) {
  let body: { intervention_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const interventionId = body.intervention_id;
  if (!interventionId) {
    return NextResponse.json({ error: 'intervention_id required' }, { status: 400 });
  }

  const bexioUserIdRaw = process.env.BEXIO_USER_ID;
  if (!bexioUserIdRaw) {
    return NextResponse.json(
      { error: 'BEXIO_USER_ID not configured on server' },
      { status: 500 }
    );
  }
  const bexioUserId = Number(bexioUserIdRaw);

  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: intervention, error } = await (supabase as any)
    .from('interventions')
    .select(
      `id, title, address, date_planned, work_order_number, status, client_info,
       regie:regies(id, name, address, email_contact, billing_email, discount_percentage, bexio_contact_id),
       reports(id, work_duration_minutes, supplies_text, materials_used, text_content),
       invoices(id)`
    )
    .eq('id', interventionId)
    .single();

  if (error || !intervention) {
    return NextResponse.json(
      { error: 'Intervention not found', detail: error?.message },
      { status: 404 }
    );
  }

  const iv = intervention as Intervention;

  if (iv.invoices && iv.invoices.length > 0) {
    return NextResponse.json(
      { error: 'Une facture existe déjà pour cette intervention' },
      { status: 409 }
    );
  }

  if (!iv.regie) {
    return NextResponse.json(
      { error: 'Aucune régie liée à cette intervention' },
      { status: 400 }
    );
  }

  const report = iv.reports?.[0];
  if (!report) {
    return NextResponse.json(
      { error: 'Aucun rapport validé pour cette intervention' },
      { status: 400 }
    );
  }

  try {
    const bexioContactId = await resolveBexioContact(iv.regie, supabase, bexioUserId);

    const tax = await Taxes.findTaxByRate(VAT_RATE);
    if (!tax) {
      console.warn('No active Bexio tax matching rate', VAT_RATE);
    }

    const discountPct = Number(iv.regie.discount_percentage) || 0;
    const positions = buildPositions(report, discountPct, tax?.id);

    if (positions.length === 0) {
      return NextResponse.json(
        { error: 'Aucune ligne de facturation (durée + matériel vides)' },
        { status: 400 }
      );
    }

    const today = todayZurichISO();
    const dueDate = addDaysToISO(today, PAYMENT_DAYS);

    const titleParts = [iv.title];
    if (iv.work_order_number) titleParts.push(`Bon N° ${iv.work_order_number}`);
    if (iv.address) titleParts.push(iv.address);

    const created = await Invoices.createInvoice({
      title: titleParts.join(' — '),
      contact_id: bexioContactId,
      user_id: bexioUserId,
      mwst_type: 1, // tax excluded: unit_price is net, VAT added on top
      mwst_is_net: true,
      show_position_taxes: false,
      is_valid_from: today,
      is_valid_to: dueDate,
      reference: iv.work_order_number || undefined,
      api_reference: `intervention:${iv.id}`,
      positions,
    });

    const status = BEXIO_STATUS_TO_PAYMENT[created.kb_item_status_id] ?? 'draft';
    const subtotal = Number(created.total_net) || 0;
    const vatAmount = Number(created.total_taxes) || 0;
    const total = Number(created.total) || 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoiceRow, error: insertError } = await (supabase as any)
      .from('invoices')
      .insert({
        intervention_id: iv.id,
        regie_id: iv.regie.id,
        bexio_id: created.id,
        bexio_contact_id: bexioContactId,
        kb_item_status_id: created.kb_item_status_id,
        payment_status: status,
        invoice_number: created.document_nr,
        date: created.is_valid_from,
        due_date: created.is_valid_to,
        client_name: iv.regie.name,
        client_address: created.contact_address || iv.regie.address,
        vat_rate: VAT_RATE,
        amount_net: subtotal,
        amount_vat: vatAmount,
        amount_total: total,
        line_items: created.positions || positions,
        status: 'draft',
        bexio_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Local invoice insert failed after Bexio create', insertError);
      // Bexio invoice already exists — return its id so the user can recover.
      return NextResponse.json(
        {
          error: 'Facture créée dans Bexio mais échec d\'enregistrement local',
          bexio_id: created.id,
          detail: insertError.message,
        },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('interventions')
      .update({ status: 'billed' })
      .eq('id', iv.id);

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceRow?.id,
      bexio_id: created.id,
      bexio_number: created.document_nr,
      total,
    });
  } catch (e) {
    const err = e as Error & { status?: number; body?: unknown };
    console.error(
      `[BEXIO-ERR] status=${err.status} message=${err.message} body=${JSON.stringify(err.body)}`
    );
    return NextResponse.json(
      {
        error: 'Échec création facture Bexio',
        detail: err.message,
        status: err.status,
        bexio: err.body,
      },
      { status: 500 }
    );
  }
}
