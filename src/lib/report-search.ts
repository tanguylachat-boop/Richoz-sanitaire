import { compactIdentifier } from '@/lib/utils';

/**
 * Minimal shape a report row needs for the search bar on the report lists
 * (« À valider » and « Historique »). Both pages embed these relations.
 */
export interface SearchableReport {
  technician?: { first_name: string | null; last_name: string | null } | null;
  intervention?: {
    title?: string | null;
    work_order_number?: string | null;
    client_info?: { name?: string | null } | null;
    client?: {
      first_name: string | null;
      last_name: string | null;
      company_name: string | null;
    } | null;
    regie?: { name: string | null } | null;
  } | null;
}

/**
 * Case-insensitive match of a free-text query against a report: work order
 * number, client (legacy client_info.name, linked client, régie), technician
 * and intervention title. The work order number is also compared without
 * separators so "2026 287 038" (as printed on the régie PDFs) finds "2026287038".
 * An empty query matches everything.
 */
export function matchesReportSearch(report: SearchableReport, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const intervention = report.intervention;
  const technician = report.technician;
  const client = intervention?.client;

  // first_name then last_name stay adjacent so "jean dupont" matches as typed.
  const haystack = [
    intervention?.title,
    intervention?.work_order_number,
    intervention?.client_info?.name,
    client?.company_name,
    client?.first_name,
    client?.last_name,
    intervention?.regie?.name,
    technician?.first_name,
    technician?.last_name,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase();

  if (haystack.includes(query)) return true;

  const compactQuery = compactIdentifier(query);
  const workOrder = intervention?.work_order_number;
  return compactQuery.length > 0 && !!workOrder && compactIdentifier(workOrder).includes(compactQuery);
}
