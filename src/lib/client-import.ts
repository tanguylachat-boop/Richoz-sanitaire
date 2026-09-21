// LOT 4 — logique pure de l'import de contacts Bexio (Excel/CSV) dans le
// module clients existant. Aucune connexion à l'API Bexio. Fonctions sans
// effet de bord, testables hors base.

export const IMPORT_TARGET_FIELDS = [
  { key: 'bexio_nr', label: 'Nr. Bexio (identifiant stable)' },
  { key: 'company_name', label: 'Entreprise / Raison sociale' },
  { key: 'last_name', label: 'Nom' },
  { key: 'first_name', label: 'Prénom' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Téléphone fixe' },
  { key: 'mobile', label: 'Téléphone mobile' },
  { key: 'address', label: 'Adresse' },
  { key: 'postal_code', label: 'NPA' },
  { key: 'city', label: 'Localité' },
  { key: 'notes', label: 'Remarques' },
] as const;

export type ImportFieldKey = (typeof IMPORT_TARGET_FIELDS)[number]['key'];

/** field → index de colonne dans le fichier (-1 = non mappé) */
export type ImportMapping = Partial<Record<ImportFieldKey, number>>;

// En-têtes usuels des exports Bexio (FR/DE/EN) pour pré-remplir le mapping.
const HEADER_HINTS: Record<ImportFieldKey, RegExp> = {
  bexio_nr: /^(nr|no|num[ée]ro|id|kontakt-?nr|contact ?(no|nr|id))\.?$/i,
  company_name: /(firma|entreprise|soci[ée]t[ée]|company|raison)/i,
  last_name: /^(name|nom|nachname|last ?name)$/i,
  first_name: /(vorname|pr[ée]nom|first ?name)/i,
  email: /(mail)/i,
  phone: /(fixe|festnetz|phone|t[ée]l[ée]phone|tel\.?$)/i,
  mobile: /(mobile|natel|portable|handy)/i,
  address: /(adresse|address|strasse|rue)/i,
  postal_code: /(npa|plz|postal|zip|code ?postal)/i,
  city: /(localit[ée]|ville|ort|city)/i,
  notes: /(remarque|bemerkung|note)/i,
};

export function suggestMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const { key } of IMPORT_TARGET_FIELDS) {
    const index = headers.findIndex((h) => HEADER_HINTS[key].test((h || '').trim()));
    if (index >= 0 && !Object.values(mapping).includes(index)) mapping[key] = index;
  }
  return mapping;
}

export interface ClientCandidate {
  row: number; // numéro de ligne dans le fichier (1-based, en-tête = 1)
  bexio_nr: string | null;
  company_name: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
  client_type: 'entreprise' | 'particulier';
}

export interface RejectedRow { row: number; reason: string }

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * Transforme les lignes du fichier en candidats validés. Aucun rôle n'est
 * inféré au-delà des données réellement présentes : entreprise si seule la
 * raison sociale existe, particulier sinon. Régies et destinataires de
 * facturation ne sont PAS déduits (pas de correspondance fiable dans un
 * export contacts) — rattachement manuel dans l'app comme aujourd'hui.
 */
export function buildCandidates(
  rows: string[][],
  mapping: ImportMapping
): { candidates: ClientCandidate[]; rejected: RejectedRow[] } {
  const candidates: ClientCandidate[] = [];
  const rejected: RejectedRow[] = [];
  const pick = (row: string[], key: ImportFieldKey): string | null => {
    const index = mapping[key];
    return index === undefined || index < 0 ? null : clean(row[index]);
  };
  rows.forEach((row, i) => {
    if (i === 0) return; // en-tête
    if (row.every((c) => !c || !c.trim())) return; // ligne vide
    const rowNumber = i + 1;
    const candidate: ClientCandidate = {
      row: rowNumber,
      bexio_nr: pick(row, 'bexio_nr'),
      company_name: pick(row, 'company_name'),
      last_name: pick(row, 'last_name'),
      first_name: pick(row, 'first_name'),
      email: pick(row, 'email'),
      phone: pick(row, 'phone'),
      mobile: pick(row, 'mobile'),
      address: pick(row, 'address'),
      postal_code: pick(row, 'postal_code'),
      city: pick(row, 'city'),
      notes: pick(row, 'notes'),
      client_type: 'particulier',
    };
    if (!candidate.last_name && !candidate.company_name) {
      rejected.push({ row: rowNumber, reason: 'Ni nom ni raison sociale' });
      return;
    }
    if (candidate.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
      rejected.push({ row: rowNumber, reason: 'E-mail invalide' });
      return;
    }
    candidate.client_type = candidate.company_name && !candidate.last_name ? 'entreprise' : 'particulier';
    candidates.push(candidate);
  });
  return { candidates, rejected };
}

export interface ExistingKeys {
  bexioNrs: Set<string>;
  emails: Set<string>; // en minuscules
  exactTriples: Set<string>; // composite nom|prénom|société|téléphone|adresse normalisé
}

export const exactTriple = (c: {
  company_name: string | null; last_name: string | null; first_name: string | null;
  phone: string | null; address: string | null;
}): string =>
  [c.company_name, c.last_name, c.first_name, c.phone, c.address]
    .map((v) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|');

export interface SkippedRow { row: number; reason: string }

/**
 * Plan d'insertion sans doublon ni écrasement silencieux :
 * - identifiant Bexio déjà présent (fichier ou base) → ignoré, signalé ;
 * - e-mail déjà présent (fichier ou base) → ignoré, signalé ;
 * - ligne strictement identique à un contact existant (tous champs d'identité
 *   égaux) → ignorée ; deux personnes ne sont JAMAIS fusionnées sur un simple
 *   nom partagé : un homonyme avec des coordonnées différentes est inséré.
 */
export function planImport(
  candidates: ClientCandidate[],
  existing: ExistingKeys
): { toInsert: ClientCandidate[]; skipped: SkippedRow[] } {
  const toInsert: ClientCandidate[] = [];
  const skipped: SkippedRow[] = [];
  const seenNrs = new Set(existing.bexioNrs);
  const seenEmails = new Set(existing.emails);
  const seenTriples = new Set(existing.exactTriples);
  for (const candidate of candidates) {
    if (candidate.bexio_nr) {
      if (seenNrs.has(candidate.bexio_nr)) {
        skipped.push({ row: candidate.row, reason: 'Nr. Bexio déjà présent (réimport sans doublon)' });
        continue;
      }
    } else if (candidate.email) {
      if (seenEmails.has(candidate.email.toLowerCase())) {
        skipped.push({ row: candidate.row, reason: 'E-mail déjà présent' });
        continue;
      }
    } else {
      const triple = exactTriple(candidate);
      if (seenTriples.has(triple)) {
        skipped.push({ row: candidate.row, reason: 'Contact identique déjà présent' });
        continue;
      }
      seenTriples.add(triple);
    }
    if (candidate.bexio_nr) seenNrs.add(candidate.bexio_nr);
    if (candidate.email) seenEmails.add(candidate.email.toLowerCase());
    toInsert.push(candidate);
  }
  return { toInsert, skipped };
}
