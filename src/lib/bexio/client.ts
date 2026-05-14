// Thin Bexio REST client. Authenticates with a Personal Access Token (PAT),
// stored in BEXIO_API_TOKEN. All endpoints live under https://api.bexio.com.

const BASE_URL = 'https://api.bexio.com';

export class BexioError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function token(): string {
  const t = process.env.BEXIO_API_TOKEN;
  if (!t) throw new Error('BEXIO_API_TOKEN is not set');
  return t;
}

type BexioRequestInit = Omit<RequestInit, 'body'> & { body?: unknown };

export async function bexioFetch<T>(path: string, init: BexioRequestInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new BexioError(
      `Bexio ${rest.method || 'GET'} ${path} failed (${res.status})`,
      res.status,
      parsed
    );
  }

  return parsed as T;
}

// Pagination helper — Bexio uses offset/limit on most list endpoints (max 2000).
export async function bexioList<T>(
  path: string,
  pageSize = 500
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await bexioFetch<T[]>(
      `${path}${sep}limit=${pageSize}&offset=${offset}`
    );
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break; // safety
  }
  return out;
}
