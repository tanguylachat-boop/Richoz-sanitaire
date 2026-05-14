import { bexioFetch, bexioList } from './client';
import type { BexioInvoice, BexioInvoiceCreate } from './types';

const BASE = '/2.0/kb_invoice';

export async function listInvoices(limit = 500): Promise<BexioInvoice[]> {
  return bexioList<BexioInvoice>(`${BASE}?order_by=is_valid_from_desc`, limit);
}

export async function getInvoice(id: number): Promise<BexioInvoice> {
  return bexioFetch<BexioInvoice>(`${BASE}/${id}`);
}

export async function createInvoice(payload: BexioInvoiceCreate): Promise<BexioInvoice> {
  return bexioFetch<BexioInvoice>(BASE, {
    method: 'POST',
    body: payload,
  });
}

// Issue = mark as sent (transition kb_item_status from Draft → Pending)
export async function issueInvoice(id: number): Promise<{ success: boolean }> {
  return bexioFetch<{ success: boolean }>(`${BASE}/${id}/issue`, {
    method: 'POST',
  });
}

// Send invoice email
export async function sendInvoice(
  id: number,
  payload: { recipient_email: string; subject?: string; message?: string }
): Promise<{ success: boolean }> {
  return bexioFetch<{ success: boolean }>(`${BASE}/${id}/send`, {
    method: 'POST',
    body: payload,
  });
}

// Download invoice PDF as Buffer
export async function downloadPdf(id: number): Promise<Buffer> {
  const res = await fetch(`https://api.bexio.com${BASE}/${id}/pdf`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.BEXIO_API_TOKEN || ''}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bexio PDF ${id} failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { content: string };
  return Buffer.from(json.content, 'base64');
}
