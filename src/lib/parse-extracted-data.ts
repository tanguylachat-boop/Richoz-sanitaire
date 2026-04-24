/**
 * Robust parser for extracted_data coming from n8n.
 *
 * Current state (april 2026): the n8n IA agent stores structured infos inside
 * the `description` field under format like "1. LE PROBLÈME : ... 2. LIMITES
 * FINANCIÈRES : ... 3. ACCÈS / CLÉS : ... 4. FACTURATION : ...".
 *
 * This parser extracts those sections into dedicated fields (keys_info,
 * owner_name, billing_address, problem) so the PlanificationSplitView can
 * pre-fill everything correctly — without having to change the workflow.
 *
 * Once the n8n prompt is fixed to emit structured fields directly, this
 * parser becomes a no-op fallback.
 */

export interface ExtractedData {
  title?: string;
  address?: string;
  tenant_name?: string;
  tenant_phone?: string;
  tenant_email?: string;
  description?: string;
  priority?: string;
  email_type?: string;
  keys_info?: string;
  owner_name?: string;
  regie_name?: string;
  // Derived fields (not always present — populated by parser)
  billing_address?: string;
  financial_limit?: string;
  problem?: string;
}

// Accept optional leading numbering + emojis + any unicode spacing before the label
function sectionRegex(labelAlternatives: string[]): RegExp {
  const labels = labelAlternatives.join('|');
  // Matches "3. ACCÈS / CLÉS : value..." until next "N." section or end of text
  return new RegExp(
    String.raw`(?:^|\n|\.\s|\s)[0-9]*\.?\s*(?:${labels})\s*[:\-–]\s*([\s\S]*?)(?=(?:\s*[0-9]+\.\s+[A-ZÉÈÀÂÎÔÛÇ])|$)`,
    'i'
  );
}

function extractSection(text: string, labelAlternatives: string[]): string | null {
  const match = text.match(sectionRegex(labelAlternatives));
  if (!match) return null;
  const value = (match[1] || '').trim();
  // Filter out useless "Non mentionné", "Non spécifié", empty
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (
    lowered === 'non mentionné' ||
    lowered === 'non mentionne' ||
    lowered === 'non spécifié' ||
    lowered === 'non specifie' ||
    lowered === 'non spécifiée' ||
    lowered === 'non specifiee' ||
    lowered === 'n/a' ||
    lowered === '—' ||
    lowered === 'pas d\'information sur l\'accès fournie' ||
    lowered.startsWith('non ')
  ) {
    return null;
  }
  return value;
}

/**
 * Enrich an extracted_data object with fields parsed from its description.
 * Existing top-level fields win over parsed ones (never overwrite a good value).
 */
export function parseExtractedData(raw: ExtractedData | null | undefined): ExtractedData {
  if (!raw) return {};

  const out: ExtractedData = { ...raw };
  const description = (raw.description || '').replace(/\r/g, '');

  if (!description) return out;

  // Parse subsections
  const problem = extractSection(description, ['LE PROBLÈME', 'LE PROBLEME', 'PROBLÈME', 'PROBLEME', 'DEMANDE']);
  const keys = extractSection(description, ['ACCÈS / CLÉS', 'ACCES / CLES', 'ACCÈS', 'CLÉS', 'CLES', 'ACCES']);
  const billing = extractSection(description, ['FACTURATION', 'ADRESSE DE FACTURATION']);
  const financial = extractSection(description, ['LIMITES FINANCIÈRES', 'LIMITES FINANCIERES', 'BUDGET']);

  if (problem && !out.problem) out.problem = problem;
  if (keys && !out.keys_info) out.keys_info = keys;
  if (billing && !out.owner_name) out.owner_name = billing;
  if (billing && !out.billing_address) out.billing_address = billing;
  if (financial && !out.financial_limit) out.financial_limit = financial;

  // If problem was extracted and it's more useful than the full raw description,
  // replace description with the problem for form pre-fill clarity.
  if (problem && problem.length > 10) {
    out.description = problem;
  }

  return out;
}

// Also expose a phone normalizer since IA sometimes writes "078 656 17 30"
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Already in +41 format, just normalize spaces
  if (trimmed.startsWith('+')) return trimmed.replace(/\s+/g, ' ');
  // Swiss number starting with 0 → +41
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 9)) {
    return `+41 ${digits.slice(1, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`.trim();
  }
  return trimmed;
}
