import { bexioFetch, bexioList } from './client';
import type { BexioContact, BexioContactCreate } from './types';

export async function listContacts(limit = 500): Promise<BexioContact[]> {
  return bexioList<BexioContact>(`/2.0/contact?order_by=updated_at_desc`, limit);
}

export async function searchContacts(query: string): Promise<BexioContact[]> {
  if (!query.trim()) return [];
  const body = [
    { field: 'name_1', value: query, criteria: 'like' },
  ];
  return bexioFetch<BexioContact[]>(`/2.0/contact/search?limit=20`, {
    method: 'POST',
    body,
  });
}

export async function getContact(id: number): Promise<BexioContact> {
  return bexioFetch<BexioContact>(`/2.0/contact/${id}`);
}

export async function createContact(payload: BexioContactCreate): Promise<BexioContact> {
  return bexioFetch<BexioContact>(`/2.0/contact`, {
    method: 'POST',
    body: payload,
  });
}
