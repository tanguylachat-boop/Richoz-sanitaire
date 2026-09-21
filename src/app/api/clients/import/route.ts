// LOT 4 — import de contacts Bexio (fichier Excel/CSV exporté, PAS l'API
// Bexio). Réservé admin/secrétaire. Aucune coordonnée n'est journalisée.
import { requireAdminOrSecretary } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { readCsv, readFirstSheet } from '@/lib/xlsx-lite';
import {
  IMPORT_TARGET_FIELDS,
  buildCandidates,
  exactTriple,
  planImport,
  suggestMapping,
  type ImportMapping,
} from '@/lib/client-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10001; // en-tête + 10 000 contacts
const NO_STORE = { 'cache-control': 'private, no-store' };

function parseFile(name: string, buffer: Buffer): string[][] {
  if (/\.xlsx$/i.test(name)) return readFirstSheet(buffer);
  if (/\.csv$/i.test(name)) return readCsv(buffer);
  throw new Error('FORMAT');
}

function sanitizeMapping(raw: unknown): ImportMapping {
  const allowed = new Set(IMPORT_TARGET_FIELDS.map((f) => f.key));
  const mapping: ImportMapping = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (allowed.has(key as (typeof IMPORT_TARGET_FIELDS)[number]['key']) && typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        mapping[key as keyof ImportMapping] = value;
      }
    }
  }
  return mapping;
}

export async function POST(request: Request) {
  const access = await requireAdminOrSecretary();
  if (!access.authorized) {
    return Response.json({ error: access.error }, { status: 403, headers: NO_STORE });
  }
  try {
    const form = await request.formData();
    const file = form.get('file');
    const phase = form.get('phase');
    if (!(file instanceof File) || (phase !== 'preview' && phase !== 'import')) {
      return Response.json({ error: 'Requête invalide.' }, { status: 400, headers: NO_STORE });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: 'Fichier trop volumineux (5 Mo maximum).' }, { status: 413, headers: NO_STORE });
    }
    let rows: string[][];
    try {
      rows = parseFile(file.name, Buffer.from(await file.arrayBuffer()));
    } catch {
      return Response.json({ error: 'Fichier illisible. Formats acceptés : .xlsx ou .csv exporté depuis Bexio.' }, { status: 422, headers: NO_STORE });
    }
    if (rows.length < 2) {
      return Response.json({ error: 'Le fichier ne contient aucune ligne de données.' }, { status: 422, headers: NO_STORE });
    }
    if (rows.length > MAX_ROWS) {
      return Response.json({ error: 'Trop de lignes (10 000 contacts maximum par import).' }, { status: 413, headers: NO_STORE });
    }

    if (phase === 'preview') {
      return Response.json({
        headers: rows[0],
        totalRows: rows.length - 1,
        sample: rows.slice(1, 11),
        suggestedMapping: suggestMapping(rows[0]),
        fields: IMPORT_TARGET_FIELDS,
      }, { headers: NO_STORE });
    }

    // phase === 'import'
    let mapping: ImportMapping;
    try {
      mapping = sanitizeMapping(JSON.parse(String(form.get('mapping') || '{}')));
    } catch {
      return Response.json({ error: 'Correspondance des colonnes invalide.' }, { status: 400, headers: NO_STORE });
    }
    if (mapping.last_name === undefined && mapping.company_name === undefined) {
      return Response.json({ error: 'Mapper au moins la colonne Nom ou Entreprise.' }, { status: 400, headers: NO_STORE });
    }

    const { candidates, rejected } = buildCandidates(rows, mapping);
    const supabase = createClient();
    const { data: existingRows, error: existingError } = await supabase
      .from('clients')
      .select('bexio_nr, email, company_name, last_name, first_name, phone, address')
      .range(0, 49999);
    if (existingError) {
      return Response.json({ error: 'Lecture des contacts existants impossible.' }, { status: 503, headers: NO_STORE });
    }
    const existing = {
      bexioNrs: new Set((existingRows || []).flatMap((r) => (r.bexio_nr ? [r.bexio_nr] : []))),
      emails: new Set((existingRows || []).flatMap((r) => (r.email ? [r.email.toLowerCase()] : []))),
      exactTriples: new Set((existingRows || []).map((r) => exactTriple(r))),
    };
    const { toInsert, skipped } = planImport(candidates, existing);

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500).map(({ row: _row, ...fields }) => fields);
      const { error } = await supabase.from('clients').insert(chunk);
      if (error) {
        // Aucune donnée de contact dans les journaux serveur.
        console.error('Client import chunk failed:', error.code);
        return Response.json({
          error: `Import interrompu après ${inserted} contact(s). Aucune ligne partielle : réimportez le même fichier, les contacts déjà insérés seront ignorés.`,
          inserted,
        }, { status: 503, headers: NO_STORE });
      }
      inserted += chunk.length;
    }

    return Response.json({
      totalRows: rows.length - 1,
      inserted,
      skipped,
      rejected,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400, headers: NO_STORE });
  }
}
