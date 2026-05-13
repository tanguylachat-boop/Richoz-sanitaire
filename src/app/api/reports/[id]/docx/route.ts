import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { generateReportDocxBuffer, type ReportData } from '@/lib/generate-report-docx';
import { generateChantierDocxBuffer, type ChantierReportData } from '@/lib/docx/chantier';
import { convertDocxToPdf } from '@/lib/docx/convert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STORAGE_BUCKET = 'photos';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), "d MMMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return iso || '—';
  }
}

function getPhotoUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
}

type PhotoEntry = string | { url: string; caption?: string; category?: string };

async function fetchReport(id: string) {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('reports')
    .select(
      `*, technician:users!reports_technician_id_fkey(id, first_name, last_name, phone),
       intervention:interventions(id, title, description, address, date_planned, work_order_number, intervention_type, client_info, regie:regies(id, name, phone, email))`
    )
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDepannageDocx(r: any): Promise<{ buffer: Buffer; filename: string }> {
  const intervention = r.intervention || {};
  const technician = r.technician || {};
  const clientInfo = intervention.client_info || {};
  const regie = intervention.regie || {};

  const rawPhotos: PhotoEntry[] = r.photos || [];
  const before: { url: string; caption?: string }[] = [];
  const after: { url: string; caption?: string }[] = [];
  const uncategorized: { url: string; caption?: string }[] = [];
  for (const p of rawPhotos) {
    if (typeof p === 'string') uncategorized.push({ url: getPhotoUrl(p) });
    else if (p.category === 'before') before.push({ url: getPhotoUrl(p.url), caption: p.caption });
    else if (p.category === 'after') after.push({ url: getPhotoUrl(p.url), caption: p.caption });
    else uncategorized.push({ url: getPhotoUrl(p.url), caption: p.caption });
  }
  const hasCats = before.length > 0 || after.length > 0;

  const data: ReportData = {
    title: intervention.title || "Rapport d'intervention",
    workOrderNumber: intervention.work_order_number || undefined,
    regieName: regie.name || undefined,
    regiePhone: regie.phone || undefined,
    regieEmail: regie.email || undefined,
    ownerName: undefined,
    address: intervention.address || undefined,
    clientName: clientInfo.name || undefined,
    clientPhone: clientInfo.phone || undefined,
    technicianName: [technician.first_name, technician.last_name].filter(Boolean).join(' ') || '—',
    technicianPhone: technician.phone || undefined,
    datePlanned: intervention.date_planned ? fmtDate(intervention.date_planned) : undefined,
    createdAt: fmtDate(r.created_at),
    isCompleted: r.is_completed !== false,
    isBillable: r.is_billable !== false,
    billableReason: r.billable_reason || undefined,
    workDurationMinutes: r.work_duration_minutes || undefined,
    textContent: r.text_content || r.vocal_transcription || undefined,
    suppliesText: r.supplies_text || undefined,
    photosBefore: hasCats ? before : uncategorized,
    photosAfter: hasCats ? after : [],
  };

  const buffer = await generateReportDocxBuffer(data);
  const safeTitle = (intervention.title || 'rapport').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const filename = `rapport-${safeTitle}-${r.id.slice(0, 8)}.docx`;
  return { buffer, filename };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildChantierDocx(r: any): Promise<{ buffer: Buffer; filename: string }> {
  const supabase = createAdminClient();
  const intervention = r.intervention || {};
  const technician = r.technician || {};
  const clientInfo = intervention.client_info || {};
  const regie = intervention.regie || {};

  const interventionId = intervention.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detailsRes, photosRes, messagesRes, cutoffsRes] = await Promise.all([
    (supabase as any).from('chantier_details').select('progress_percent, date_start').eq('intervention_id', interventionId).maybeSingle(),
    (supabase as any).from('chantier_photos').select('photo_url, caption').eq('intervention_id', interventionId).order('created_at', { ascending: true }),
    (supabase as any).from('chantier_messages').select('message, created_at, author:users!chantier_messages_author_id_fkey(first_name, last_name)').eq('intervention_id', interventionId).order('created_at', { ascending: true }),
    (supabase as any).from('chantier_cutoff_notices').select('cutoff_type, start_date, end_date_estimated, floors_affected, message').eq('intervention_id', interventionId).order('start_date', { ascending: true }),
  ]);

  const photos: { url: string; caption?: string }[] = [
    ...((r.photos as PhotoEntry[]) || []).map((p) =>
      typeof p === 'string' ? { url: getPhotoUrl(p) } : { url: getPhotoUrl(p.url), caption: p.caption }
    ),
    ...((photosRes.data || []) as { photo_url: string; caption: string | null }[]).map((p) => ({
      url: getPhotoUrl(p.photo_url),
      caption: p.caption || undefined,
    })),
  ];

  const journal = ((messagesRes.data || []) as Array<{
    message: string;
    created_at: string;
    author: { first_name: string; last_name: string } | null;
  }>).map((m) => ({
    author: m.author ? `${m.author.first_name} ${m.author.last_name}` : '—',
    created_at: fmtDate(m.created_at),
    message: m.message || '',
  }));

  const cutoffs = ((cutoffsRes.data || []) as Array<{
    cutoff_type: string;
    start_date: string;
    end_date_estimated: string | null;
    floors_affected: string | null;
    message: string | null;
  }>).map((c) => ({
    type: c.cutoff_type,
    start_date: fmtDate(c.start_date),
    end_date: c.end_date_estimated ? fmtDate(c.end_date_estimated) : null,
    floors: c.floors_affected,
    message: c.message,
  }));

  const data: ChantierReportData = {
    title: intervention.title || 'Chantier',
    workOrderNumber: intervention.work_order_number || undefined,
    regieName: regie.name || undefined,
    address: intervention.address || undefined,
    clientName: clientInfo.name || undefined,
    clientPhone: clientInfo.phone || undefined,
    technicianName: [technician.first_name, technician.last_name].filter(Boolean).join(' ') || '—',
    technicianPhone: technician.phone || undefined,
    dateStart: detailsRes.data?.date_start ? fmtDate(detailsRes.data.date_start) : undefined,
    datePlanned: intervention.date_planned ? fmtDate(intervention.date_planned) : undefined,
    createdAt: fmtDate(r.created_at),
    progressPercent: detailsRes.data?.progress_percent ?? undefined,
    textContent: r.text_content || r.vocal_transcription || undefined,
    suppliesText: r.supplies_text || undefined,
    photos,
    journal,
    cutoffs,
  };

  const buffer = await generateChantierDocxBuffer(data);
  const safeTitle = (intervention.title || 'chantier').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const filename = `chantier-${safeTitle}-${r.id.slice(0, 8)}.docx`;
  return { buffer, filename };
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const r = await fetchReport(id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  try {
    const isChantier = r.intervention?.intervention_type === 'chantier';
    const { buffer, filename } = isChantier
      ? await buildChantierDocx(r)
      : await buildDepannageDocx(r);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('DOCX generation failed', e);
    return NextResponse.json({ error: 'Generation failed', detail: String(e) }, { status: 500 });
  }
}

// Upload edited Word → convert to PDF → store → update report.pdf_url
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const supabase = createAdminClient();

  let docxBuffer: Buffer;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    docxBuffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  try {
    const pdfBuffer = await convertDocxToPdf(docxBuffer, `report-${id}.docx`);

    const timestamp = Date.now();
    const pdfPath = `reports/${id}/rapport-${timestamp}.pdf`;
    const docxPath = `reports/${id}/rapport-${timestamp}.docx`;

    const [pdfUp, docxUp] = await Promise.all([
      supabase.storage.from(STORAGE_BUCKET).upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      }),
      supabase.storage.from(STORAGE_BUCKET).upload(docxPath, docxBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      }),
    ]);

    if (pdfUp.error) {
      console.error('PDF upload error', pdfUp.error);
      return NextResponse.json({ error: 'PDF upload failed', detail: pdfUp.error.message }, { status: 500 });
    }
    if (docxUp.error) {
      console.error('DOCX upload error', docxUp.error);
    }

    const { data: pdfPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(pdfPath);
    const { data: docxPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(docxPath);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase as any)
      .from('reports')
      .update({
        pdf_url: pdfPublic.publicUrl,
        docx_url: docxPublic.publicUrl,
      })
      .eq('id', id);
    if (updErr) {
      // Fallback if docx_url column doesn't exist yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fallback } = await (supabase as any)
        .from('reports')
        .update({ pdf_url: pdfPublic.publicUrl })
        .eq('id', id);
      if (fallback) {
        console.error('Report update error', fallback);
        return NextResponse.json({ error: 'Update failed', detail: fallback.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      pdf_url: pdfPublic.publicUrl,
      docx_url: docxPublic.publicUrl,
    });
  } catch (e) {
    console.error('Conversion / upload failed', e);
    return NextResponse.json({ error: 'Conversion failed', detail: String(e) }, { status: 502 });
  }
}
