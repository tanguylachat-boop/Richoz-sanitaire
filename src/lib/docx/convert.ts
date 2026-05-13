const GOTENBERG_BASE =
  process.env.GOTENBERG_URL?.replace(/\/forms\/.*$/, '') ||
  'https://gotenberggotenberg8-production-7f2f.up.railway.app';

const LIBREOFFICE_URL = `${GOTENBERG_BASE}/forms/libreoffice/convert`;

export async function convertDocxToPdf(
  docxBuffer: ArrayBuffer | Buffer,
  filename = 'document.docx'
): Promise<Buffer> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(docxBuffer as ArrayBuffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  form.append('files', blob, filename);

  const res = await fetch(LIBREOFFICE_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gotenberg conversion failed (${res.status}): ${text}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
