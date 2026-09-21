import { buildInterventionDates, interventionDateFields, isCalendarDate } from '@/lib/intervention-dates';
import type { ReportFollowupRow } from '@/lib/report-followup';

export type DailyFollowup = Pick<ReportFollowupRow, 'intervention_id' | 'title' | 'intervention_type' | 'technician_id' | 'technician_name' | 'report_id' | 'report_count' | 'confirmed' | 'state' | 'exclusion'>;

export interface DailyIntervention {
  id: string; title: string; work_order_number: string | null; technician_id: string | null;
  intervention_type: string; status: string | null;
  date_planned: string | null; date_end: string | null; date_completed: string | null;
}
export interface DailyReport {
  id: string; intervention_id: string; technician_id: string; created_at: string | null;
  status: string | null; revision_requested: boolean | null;
}
export interface DailyTechnician { id: string; first_name: string | null; last_name: string | null }
export function zurichToday(now = new Date()) { return interventionDateFields(now.toISOString()).date; }
export function shiftDailyDate(date: string, days: number) {
  if (!isCalendarDate(date) || Number(date.slice(0, 4)) < 1 || Number(date.slice(0, 4)) >= 9999) throw new Error('Date invalide.');
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dailyPeriod(date: string) {
  const next = shiftDailyDate(date, 1);
  const midnight = (day: string) => buildInterventionDates({ date_planned: day, time_planned: '00:00', date_end: '', intervention_type: 'depannage' }).date_planned!;
  return { date, start: midnight(date), end: midnight(next) };
}
export function inDailyPeriod(value: string | null, period: ReturnType<typeof dailyPeriod>) {
  const time = value ? Date.parse(value) : NaN;
  return time >= Date.parse(period.start) && time < Date.parse(period.end);
}
export function plannedOnDay(i: DailyIntervention, period: ReturnType<typeof dailyPeriod>) {
  if (!i.date_planned) return false;
  if (inDailyPeriod(i.date_planned, period)) return true;
  // Only an explicit end establishes a multiday span. Missing end: start day only.
  return !!i.date_end && Date.parse(i.date_planned) < Date.parse(period.start) && Date.parse(i.date_end) > Date.parse(period.start);
}
const cancelled = (status: string | null) => status === 'annule' || status === 'cancelled';
const finished = (status: string | null) => !!status && ['termine', 'facture', 'ready_to_bill', 'billed'].includes(status);
export const dailyStatusLabels: Record<string, string> = {
  nouveau: 'Nouveau', planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé',
  facture: 'Facturé', ready_to_bill: 'Prêt à facturer', billed: 'Facturé', annule: 'Annulé', cancelled: 'Annulé',
};
export function dailyInterventionLink(i: Pick<DailyIntervention, 'id' | 'intervention_type'>) {
  return i.intervention_type === 'chantier' ? `/chantiers/${encodeURIComponent(i.id)}` : `/calendar?intervention=${encodeURIComponent(i.id)}`;
}

export function calculateDailyActivity(input: {
  date: string; technician: string; interventions: DailyIntervention[]; reports: DailyReport[];
  followup: DailyFollowup[]; technicians: DailyTechnician[]; refreshedAt: string;
}) {
  const period = dailyPeriod(input.date);
  const reports = Array.from(new Map(input.reports.map(r => [r.id, r])).values());
  const reportsByIntervention = new Map<string, DailyReport[]>();
  reports.forEach(r => reportsByIntervention.set(r.intervention_id, [...(reportsByIntervention.get(r.intervention_id) || []), r]));
  const followup = new Map(input.followup.map(r => [r.intervention_id, {
    intervention_id: r.intervention_id, title: r.title, intervention_type: r.intervention_type,
    technician_id: r.technician_id, technician_name: r.technician_name, report_id: r.report_id,
    report_count: r.report_count, confirmed: r.confirmed, state: r.state, exclusion: r.exclusion,
  }]));
  const technicianName = (id: string | null) => {
    const t = input.technicians.find(t => t.id === id);
    return t ? [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Nom non renseigné' : id ? 'Responsable non disponible' : 'Sans responsable';
  };
  const allEntries = Array.from(new Map(input.interventions.map(i => [i.id, i])).values()).map(i => {
    const linkedReports = reportsByIntervention.get(i.id) || [];
    const created = linkedReports.filter(r => inDailyPeriod(r.created_at, period));
    return {
      ...i, technician_name: technicianName(i.technician_id), cancelled: cancelled(i.status),
      planned: plannedOnDay(i, period), completionDated: inDailyPeriod(i.date_completed, period),
      completed: !cancelled(i.status) && finished(i.status) && inDailyPeriod(i.date_completed, period),
      missingCompletionDate: !cancelled(i.status) && finished(i.status) && !Number.isFinite(Date.parse(i.date_completed || '')),
      reportsCreated: created.length,
      reports: linkedReports.map(r => ({ ...r, author_name: technicianName(r.technician_id), createdOnDay: inDailyPeriod(r.created_at, period) })),
      // Presentation and action eligibility come from the unchanged 3A RPC.
      followup: followup.get(i.id) || null,
    };
  }).filter(i => i.planned || i.completionDated || i.reportsCreated > 0);
  const entries = allEntries.filter(i => !input.technician || i.technician_id === input.technician)
    .sort((a, b) => (a.date_planned || a.date_completed || '').localeCompare(b.date_planned || b.date_completed || '') || a.id.localeCompare(b.id));
  const dayIds = new Set(entries.map(i => i.id));
  // 3A alone decides whether an obligation is active. No reconstructed past backlog.
  const open = Array.from(followup.values()).filter(r => !r.exclusion && (!input.technician || r.technician_id === input.technician));
  const dayActions = open.filter(r => dayIds.has(r.intervention_id));
  const backlog = open.filter(r => !dayIds.has(r.intervention_id));
  const count = (items: typeof entries) => ({
    interventions: items.length,
    planned: items.filter(i => i.planned && !i.cancelled).length,
    completed: items.filter(i => i.completed).length,
    reportsCreated: items.reduce((sum, i) => sum + i.reportsCreated, 0),
    cancelled: items.filter(i => i.cancelled).length,
    missingCompletionDates: items.filter(i => i.missingCompletionDate).length,
  });
  const technicianSummary = Array.from(new Set(entries.map(i => i.technician_id))).map(id => ({
    id, name: technicianName(id), ...count(entries.filter(i => i.technician_id === id)),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    date: input.date, period, technician: input.technician, refreshedAt: input.refreshedAt,
    counts: { ...count(entries), reportsSentOnDate: null }, entries, dayActions, backlog, technicianSummary,
    technicians: input.technicians.map(t => ({ id: t.id, name: technicianName(t.id) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export type DailyActivity = ReturnType<typeof calculateDailyActivity>;
