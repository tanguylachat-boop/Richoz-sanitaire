import { buildInterventionDates, interventionDateFields } from '@/lib/intervention-dates';

export interface ReportFollowupRow {
  intervention_id: string; title: string; intervention_type: string;
  technician_id: string | null; technician_name: string;
  report_id: string | null; report_count: number; confirmed: boolean;
  state: string; reference_at: string | null; due_at: string | null;
  last_reminder_at: string | null; last_reminder_id: string | null;
  next_allowed_at: string | null; exclusion: string | null;
}
export const followupLabels: Record<string, string> = {
  absent: 'Rapport attendu — absent', draft: 'Brouillon — non envoyé',
  correction: 'À corriger', submitted: 'Envoyé — à valider', validated: 'Validé',
  incomplete: 'Données à vérifier', ambiguous: 'Plusieurs rapports — à vérifier', unconfirmed: 'Obligation à confirmer',
};
export function followupDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value)) : 'Non définie';
}
export function filterFollowup(rows: ReportFollowupRow[], technician: string, state: string, newest: boolean) {
  return rows.filter(r => (!technician || r.technician_id === technician) && (!state || r.state === state))
    .sort((a, b) => {
      if (!a.reference_at) return b.reference_at ? 1 : a.intervention_id.localeCompare(b.intervention_id);
      if (!b.reference_at) return -1;
      return (Date.parse(a.reference_at) - Date.parse(b.reference_at)) * (newest ? -1 : 1) || a.intervention_id.localeCompare(b.intervention_id);
    });
}

// Reuse the existing Zurich conversion; do not accept an ambiguous autumn wall time.
export function followupInputInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Indiquez une date et une heure complètes.');
  const [date, time] = value.split('T');
  const result = buildInterventionDates({ date_planned: date, time_planned: time, date_end: '', intervention_type: 'depannage' }).date_planned!;
  const later = interventionDateFields(new Date(Date.parse(result) + 3600000).toISOString());
  if (later.date === date && later.time === time) throw new Error('Cette heure apparaît deux fois lors du changement d’heure. Choisissez une heure hors de cette période.');
  return result;
}
