import { NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { fr } from 'date-fns/locale';

const TZ = 'Europe/Zurich';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { generatePiquetDocxBuffer, type PiquetReportData } from '@/lib/docx/piquet';
import { convertDocxToPdf } from '@/lib/docx/convert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STORAGE_BUCKET = 'documents';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatInTimeZone(new Date(iso), TZ, "d MMMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return iso || '—';
  }
}

async function fetchPiquet(id: string) {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('piquet_reports')
    .select('*, technician:users!piquet_reports_technician_id_fkey(first_name, last_name, phone, email)')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const r = await fetchPiquet(id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const technician = r.technician || {};
  const data: PiquetReportData = {
    id: r.id,
    technicianName: [technician.first_name, technician.last_name].filter(Boolean).join(' ') || '—',
    technicianPhone: technician.phone,
    address: r.address || '',
    clientName: r.client_name,
    clientPhone: r.client_phone,
    callReceivedAt: fmtDate(r.call_received_at),
    interventionStartedAt: r.intervention_started_at ? fmtDate(r.intervention_started_at) : null,
    interventionEndedAt: r.intervention_ended_at ? fmtDate(r.intervention_ended_at) : null,
    problemDescription: r.problem_description,
    actionsTaken: r.actions_taken,
    suppliesUsed: r.supplies_used,
    photos: r.photos || [],
    clientSignature: r.client_signature,
    createdAt: fmtDate(r.created_at),
  };

  try {
    const buffer = await generatePiquetDocxBuffer(data);
    const filename = `piquet-${r.id.slice(0, 8)}-${new Date(r.call_received_at).toISOString().slice(0, 10)}.docx`;
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
    console.error('Piquet DOCX generation failed', e);
    return NextResponse.json({ error: 'Generation failed', detail: String(e) }, { status: 500 });
  }
}

// Upload edited Word → convert to PDF → store → update piquet.pdf_url
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  let docxBuffer: Buffer;
  let fileName = 'piquet.docx';
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (file instanceof File && file.name) fileName = file.name;
    docxBuffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  // Reject anything that isn't a real .docx
  const isZip =
    docxBuffer.length > 4 &&
    docxBuffer[0] === 0x50 &&
    docxBuffer[1] === 0x4b &&
    docxBuffer[2] === 0x03 &&
    docxBuffer[3] === 0x04;
  if (!isZip) {
    const looksLikePdf = docxBuffer.slice(0, 4).toString('utf8') === '%PDF';
    return NextResponse.json(
      {
        error: looksLikePdf
          ? 'Le fichier envoyé est un PDF. Merci d’uploader le fichier Word (.docx) édité, pas le PDF.'
          : `Format de fichier non supporté (${fileName}). Seul un fichier Word .docx est accepté.`,
      },
      { status: 400 }
    );
  }

  try {
    const pdfBuffer = await convertDocxToPdf(docxBuffer, `piquet-${id}.docx`);
    const timestamp = Date.now();
    const pdfPath = `piquet/${id}/rapport-${timestamp}.pdf`;
    const docxPath = `piquet/${id}/rapport-${timestamp}.docx`;

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
      console.error('Piquet PDF upload error', pdfUp.error);
      return NextResponse.json({ error: 'PDF upload failed', detail: pdfUp.error.message }, { status: 500 });
    }
    if (docxUp.error) {
      console.error('Piquet DOCX upload error', docxUp.error);
    }

    const { data: pdfPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(pdfPath);
    const { data: docxPublic } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(docxPath);

    // Try update with both columns, fallback if missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase as any)
      .from('piquet_reports')
      .update({
        pdf_url: pdfPublic.publicUrl,
        docx_url: docxPublic.publicUrl,
      })
      .eq('id', id);
    if (updErr) {
      console.error('Piquet update error', updErr);
      // Soft fail: the file is uploaded even if DB columns are missing
      return NextResponse.json({
        ok: true,
        warning: 'DB update failed (columns may be missing). Files uploaded.',
        pdf_url: pdfPublic.publicUrl,
        docx_url: docxPublic.publicUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      pdf_url: pdfPublic.publicUrl,
      docx_url: docxPublic.publicUrl,
    });
  } catch (e) {
    console.error('Piquet conversion failed', e);
    return NextResponse.json({ error: 'Conversion failed', detail: String(e) }, { status: 502 });
  }
}
