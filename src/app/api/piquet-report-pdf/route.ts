import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GOTENBERG_URL =
  process.env.GOTENBERG_URL ||
  'https://gotenberggotenberg8-production-7f2f.up.railway.app/forms/chromium/convert/html';

const LOGO_URL =
  'https://yuumzhlvmqcbogqzuonp.supabase.co/storage/v1/object/public/photos/logo%20richoz/Logo%20Richoz%20Sanitaire%20(1).png';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('piquet_reports')
    .select(
      '*, technician:users!piquet_reports_technician_id_fkey(first_name, last_name, email, phone)'
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // If an edited PDF was uploaded back from a Word document, serve that instead
  if (data.pdf_url) {
    return NextResponse.redirect(data.pdf_url, 302);
  }

  const r = data as {
    id: string;
    call_received_at: string;
    intervention_started_at: string | null;
    intervention_ended_at: string | null;
    address: string;
    client_name: string | null;
    client_phone: string | null;
    problem_description: string | null;
    actions_taken: string | null;
    supplies_used: string | null;
    photos: string[];
    client_signature: string | null;
    status: string;
    created_at: string;
    technician?: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      phone: string | null;
    } | null;
  };

  const techName = r.technician
    ? [r.technician.first_name, r.technician.last_name].filter(Boolean).join(' ')
    : '—';

  const photosHtml = (r.photos || [])
    .map(
      (url) =>
        `<div class="photo"><img src="${escapeHtml(url)}" alt="" /></div>`
    )
    .join('');

  const signatureHtml = r.client_signature
    ? `<div class="signature-block">
         <div class="signature-label">Signature du client</div>
         <img src="${escapeHtml(r.client_signature)}" class="signature-img" alt="Signature" />
       </div>`
    : `<div class="signature-block empty">
         <div class="signature-label">Signature du client</div>
         <div class="signature-empty">Non signé</div>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Rapport de piquet — ${escapeHtml(r.address)}</title>
<style>
  @page { size: A4; margin: 2cm 1.8cm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.4; margin: 0; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
  .header img { height: 60px; }
  .header .title { text-align: right; }
  .header h1 { color: #dc2626; font-size: 22pt; margin: 0 0 4px 0; letter-spacing: -0.5px; }
  .header .subtitle { color: #6b7280; font-size: 10pt; }
  .banner { background: #1e40af; color: white; padding: 10px 16px; border-radius: 6px; margin: 16px 0 20px; font-weight: 600; font-size: 12pt; display: flex; justify-content: space-between; }
  .banner .right { font-size: 10pt; font-weight: 400; opacity: 0.9; }
  .section { margin-bottom: 20px; }
  .section h2 { color: #1e40af; font-size: 12pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 0 0 10px 0; }
  .row { display: flex; gap: 24px; margin-bottom: 6px; }
  .row .label { color: #6b7280; width: 140px; font-weight: 500; }
  .row .val { flex: 1; }
  .block { background: #f9fafb; border-left: 3px solid #1e40af; padding: 10px 14px; margin-bottom: 10px; border-radius: 0 6px 6px 0; }
  .block h3 { color: #dc2626; font-size: 11pt; margin: 0 0 6px 0; font-weight: 700; }
  .block p { margin: 0; white-space: pre-wrap; }
  .photos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .photo img { width: 100%; height: auto; border-radius: 6px; border: 1px solid #e5e7eb; }
  .signature-block { margin-top: 24px; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; background: white; text-align: center; }
  .signature-block.empty { background: #fef3c7; border-color: #fde68a; }
  .signature-label { font-size: 9pt; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .signature-img { max-width: 300px; max-height: 100px; }
  .signature-empty { color: #92400e; font-style: italic; padding: 30px 0; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 9pt; }
  .urgent { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 9pt; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="header">
    <img src="${LOGO_URL}" alt="Richoz Sanitaire" />
    <div class="title">
      <h1>Rapport de piquet</h1>
      <div class="subtitle"><span class="urgent">Urgence nocturne</span></div>
    </div>
  </div>

  <div class="banner">
    <span>N° ${r.id.slice(0, 8).toUpperCase()}</span>
    <span class="right">Émis le ${formatDate(r.created_at)}</span>
  </div>

  <div class="section">
    <h2>Intervention</h2>
    <div class="row"><div class="label">Technicien</div><div class="val">${escapeHtml(techName)}</div></div>
    <div class="row"><div class="label">Adresse</div><div class="val">${escapeHtml(r.address)}</div></div>
    <div class="row"><div class="label">Client</div><div class="val">${escapeHtml(r.client_name || '—')}${r.client_phone ? ' · ' + escapeHtml(r.client_phone) : ''}</div></div>
  </div>

  <div class="section">
    <h2>Horaires</h2>
    <div class="row"><div class="label">Appel reçu</div><div class="val">${formatDate(r.call_received_at)}</div></div>
    <div class="row"><div class="label">Début intervention</div><div class="val">${formatDate(r.intervention_started_at)}</div></div>
    <div class="row"><div class="label">Fin intervention</div><div class="val">${formatDate(r.intervention_ended_at)}</div></div>
  </div>

  ${r.problem_description ? `
  <div class="section">
    <h2>Constat à l&#039;arrivée</h2>
    <div class="block"><p>${escapeHtml(r.problem_description)}</p></div>
  </div>` : ''}

  ${r.actions_taken ? `
  <div class="section">
    <h2>Actions réalisées</h2>
    <div class="block"><p>${escapeHtml(r.actions_taken)}</p></div>
  </div>` : ''}

  ${r.supplies_used ? `
  <div class="section">
    <h2>Matériel utilisé</h2>
    <div class="block"><p>${escapeHtml(r.supplies_used)}</p></div>
  </div>` : ''}

  ${photosHtml ? `
  <div class="section">
    <h2>Photos</h2>
    <div class="photos-grid">${photosHtml}</div>
  </div>` : ''}

  ${signatureHtml}

  <div class="footer">
    RICHOZ SANITAIRE · 50 Route de Chancy · 1213 Petit-Lancy · +41 22 313 00 27 · info@rz-sanitaire.ch
  </div>
</body>
</html>`;

  // Forward to Gotenberg
  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  form.append('paperWidth', '8.27');
  form.append('paperHeight', '11.7');
  form.append('marginTop', '0.4');
  form.append('marginBottom', '0.4');
  form.append('marginLeft', '0.4');
  form.append('marginRight', '0.4');

  const pdfRes = await fetch(GOTENBERG_URL, {
    method: 'POST',
    body: form,
  });

  if (!pdfRes.ok) {
    const text = await pdfRes.text();
    console.error('Gotenberg error:', pdfRes.status, text);
    return NextResponse.json(
      { error: 'PDF generation failed', detail: text },
      { status: 502 }
    );
  }

  const pdfBuffer = await pdfRes.arrayBuffer();
  const filename = `piquet-${r.id.slice(0, 8)}-${new Date(r.call_received_at).toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
