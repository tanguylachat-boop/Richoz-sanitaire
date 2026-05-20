import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { Contacts, Invoices, Taxes } from '@/lib/bexio';
import { BEXIO_STATUS_TO_PAYMENT } from '@/lib/bexio/types';
import {
  HOURLY_RATE_CHF,
  VAT_RATE,
  PAYMENT_DAYS,
  toBexioPositions,
  type MaterialInput,
} from '@/lib/invoice-positions';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  materials_used: MaterialInput[] | null;
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

interface CreateBody {
  intervention_id?: string;
  // Optional overrides from the preview UI
  work_duration_minutes?: number;
  hourly_rate_chf?: number;
  materials?: MaterialInput[];
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

  const found = await Contacts.searchContacts(regie.name);
  const exact = found.find(
    (c) => c.name_1.trim().toLowerCase() === regie.name.trim().toLowerCase()
  );
  if (exact) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('regies')
      .update({ bexio_contact_id: exact.id })
      .eq('id', regie.id);
    return exact.id;
  }

  const created = await Contacts.createContact({
    contact_type_id: 1,
    name_1: regie.name,
    address: regie.address || undefined,
    country_id: 1,
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

export async function POST(req: Request) {
  let body: CreateBody;
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

  // Resolve final draft: prefer body overrides, fall back to report data
  const workMinutes =
    typeof body.work_duration_minutes === 'number'
      ? body.work_duration_minutes
      : report.work_duration_minutes || 0;
  const hourlyRate =
    typeof body.hourly_rate_chf === 'number' && body.hourly_rate_chf > 0
      ? body.hourly_rate_chf
      : HOURLY_RATE_CHF;
  const materials: MaterialInput[] = Array.isArray(body.materials)
    ? body.materials.filter((m) => m && m.name?.trim())
    : Array.isArray(report.materials_used)
      ? report.materials_used.filter((m) => m && m.name?.trim())
      : [];

  try {
    const bexioContactId = await resolveBexioContact(iv.regie, supabase, bexioUserId);

    const tax = await Taxes.findTaxByRate(VAT_RATE);
    if (!tax) {
      console.warn('No active Bexio tax matching rate', VAT_RATE);
    }

    const discountPct = Number(iv.regie.discount_percentage) || 0;
    const positions = toBexioPositions(
      { work_duration_minutes: workMinutes, hourly_rate_chf: hourlyRate, materials },
      discountPct,
      tax?.id
    );

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
      mwst_type: 1,
      mwst_is_net: true,
      show_position_taxes: false,
      is_valid_from: today,
      is_valid_to: dueDate,
      reference: iv.work_order_number || undefined,
      api_reference: `intervention:${iv.id}`,
      positions,
    });

    // Back-sync edited values into the report so the PDF/audit trail stays consistent
    if (
      body.work_duration_minutes !== undefined ||
      body.materials !== undefined
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('reports')
        .update({
          work_duration_minutes: workMinutes,
          materials_used: materials,
        })
        .eq('id', report.id);
    }

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

    // Fetch the Bexio-generated PDF and upload to Supabase Storage so the
    // admin can preview it directly in the dashboard. Failure here is
    // non-blocking — the invoice is already created.
    let pdfUrl: string | null = null;
    try {
      const pdfBuffer = await Invoices.downloadPdf(created.id);
      const path = `invoices/${invoiceRow.id}.pdf`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uploadError } = await (supabase as any).storage
        .from('documents')
        .upload(path, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('Bexio PDF upload to Supabase failed', uploadError);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: pub } = (supabase as any).storage
          .from('documents')
          .getPublicUrl(path);
        pdfUrl = pub?.publicUrl ?? null;
        if (pdfUrl) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('invoices')
            .update({ pdf_url: pdfUrl })
            .eq('id', invoiceRow.id);
        }
      }
    } catch (pdfErr) {
      console.error('Bexio PDF fetch failed', pdfErr);
    }

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceRow?.id,
      bexio_id: created.id,
      bexio_number: created.document_nr,
      total,
      pdf_url: pdfUrl,
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
