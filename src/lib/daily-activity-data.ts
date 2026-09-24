import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ReportFollowupRow } from '@/lib/report-followup';
import { calculateDailyActivity, dailyPeriod, type DailyIntervention, type DailyReport } from '@/lib/daily-activity';

const interventionFields = 'id,title,work_order_number,technician_id,intervention_type,status,date_planned,date_end,date_completed' as const;
const reportFields = 'id,intervention_id,technician_id,created_at,status,revision_requested' as const;
const PAGE_SIZE = 500;
// Explicit pagination avoids a silently truncated total at the PostgREST row limit.
export async function readDailyPages<T>(page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await page(offset, offset + PAGE_SIZE - 1);
    if (result.error || !result.data) throw new Error('Lecture du bilan impossible.');
    rows.push(...result.data);
    if (result.data.length < PAGE_SIZE) return rows;
  }
}
function chunks<T>(items: T[]) { return Array.from({ length: Math.ceil(items.length / 200) }, (_, n) => items.slice(n * 200, (n + 1) * 200)); }

// Called only after the route's active staff/session check; this uses that session's RLS.
export async function loadDailyActivity(db: SupabaseClient<Database>, date: string, technician: string) {
  const { start, end } = dailyPeriod(date);
  const [starts, spans, completions, createdReports, technicians, followupResult] = await Promise.all([
    readDailyPages((a, b) => db.from('interventions').select(interventionFields).gte('date_planned', start).lt('date_planned', end).order('id').range(a, b)),
    readDailyPages((a, b) => db.from('interventions').select(interventionFields).lt('date_planned', start).gt('date_end', start).order('id').range(a, b)),
    readDailyPages((a, b) => db.from('interventions').select(interventionFields).gte('date_completed', start).lt('date_completed', end).order('id').range(a, b)),
    readDailyPages((a, b) => db.from('reports').select(reportFields).gte('created_at', start).lt('created_at', end).order('id').range(a, b)),
    readDailyPages((a, b) => db.from('users').select('id,first_name,last_name').eq('role', 'technician').order('id').range(a, b)),
    db.rpc('get_report_followup'),
  ]);
  if (followupResult.error || !Array.isArray(followupResult.data)) throw new Error('Suivi des obligations indisponible.');
  const followup = followupResult.data as unknown as ReportFollowupRow[];
  const interventions = new Map<string, DailyIntervention>([...starts, ...spans, ...completions].map(i => [i.id, i]));
  const extraIds = Array.from(new Set(createdReports.map(r => r.intervention_id))).filter(id => !interventions.has(id));
  for (const ids of chunks(extraIds)) {
    const rows = await readDailyPages((a, b) => db.from('interventions').select(interventionFields).in('id', ids).order('id').range(a, b));
    rows.forEach(i => interventions.set(i.id, i));
  }
  const reports = new Map<string, DailyReport>(createdReports.map(r => [r.id, r]));
  for (const ids of chunks(Array.from(interventions.keys()))) {
    const rows = await readDailyPages((a, b) => db.from('reports').select(reportFields).in('intervention_id', ids).order('id').range(a, b));
    rows.forEach(r => reports.set(r.id, r));
  }
  return calculateDailyActivity({ date, technician, interventions: Array.from(interventions.values()), reports: Array.from(reports.values()), followup, technicians, refreshedAt: new Date().toISOString() });
}
