'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { sendPush } from '@/lib/send-push';
import { format, startOfWeek, endOfWeek, addWeeks, eachWeekOfInterval, addDays, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Clock,
  CalendarDays,
  Phone,
  MapPin,
  CheckCircle2,
  Loader2,
  UserCog,
  FileText,
  Trash2,
  AlertCircle,
  Receipt,
} from 'lucide-react';

interface Technician {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Schedule {
  id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  technician?: Technician | null;
}

interface PiquetReport {
  id: string;
  technician_id: string;
  call_received_at: string;
  intervention_started_at: string | null;
  intervention_ended_at: string | null;
  client_name: string | null;
  client_phone: string | null;
  address: string;
  problem_description: string | null;
  actions_taken: string | null;
  supplies_used: string | null;
  photos: string[];
  travel_distance_km: number | null;
  is_billable: boolean;
  status: 'draft' | 'submitted' | 'validated' | 'billed';
  intervention_id: string | null;
  technician?: Technician | null;
  created_at: string;
}

type Tab = 'planning' | 'reports';

function getTechName(t?: Technician | null): string {
  if (!t) return '—';
  if (t.first_name && t.last_name) return `${t.first_name} ${t.last_name}`;
  return t.first_name || t.last_name || t.email;
}

export default function PiquetAdminPage() {
  const [tab, setTab] = useState<Tab>('planning');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reports, setReports] = useState<PiquetReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const today = new Date();
    const horizonEnd = addWeeks(today, 26);
    const [{ data: techData }, { data: schedData }, { data: reportsData }] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name, email').eq('role', 'technician').eq('is_active', true).order('last_name'),
      supabase
        .from('piquet_schedule')
        .select('*, technician:users!piquet_schedule_technician_id_fkey(id, first_name, last_name, email)')
        .gte('end_date', format(today, 'yyyy-MM-dd'))
        .lte('start_date', format(horizonEnd, 'yyyy-MM-dd'))
        .order('start_date'),
      supabase
        .from('piquet_reports')
        .select('*, technician:users!piquet_reports_technician_id_fkey(id, first_name, last_name, email)')
        .in('status', ['submitted', 'draft'])
        .order('call_received_at', { ascending: false })
        .limit(50),
    ]);

    if (techData) setTechnicians(techData as Technician[]);
    if (schedData) setSchedules(schedData as Schedule[]);
    if (reportsData) setReports(reportsData as PiquetReport[]);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const weeks = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = addWeeks(start, 11); // 12 weeks ahead
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  }, []);

  const getScheduleForWeek = (weekStart: Date): Schedule | null => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return schedules.find((s) => {
      const s1 = new Date(s.start_date + 'T00:00:00');
      return isWithinInterval(s1, { start: weekStart, end: weekEnd });
    }) || null;
  };

  const handleAssignWeek = async (weekStart: Date, techId: string) => {
    const start = format(weekStart, 'yyyy-MM-dd');
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const existing = getScheduleForWeek(weekStart);
    setProcessingId(`week-${start}`);
    try {
      if (!techId) {
        // Remove assignment
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from('piquet_schedule').delete().eq('id', existing.id);
          if (error) throw new Error(error.message);
          toast.success('Semaine libérée');
        }
      } else if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('piquet_schedule')
          .update({ technician_id: techId })
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
        toast.success('Piquet mis à jour');
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('piquet_schedule').insert({
          technician_id: techId,
          start_date: start,
          end_date: end,
        });
        if (error) throw new Error(error.message);
        toast.success('Piquet assigné');
      }

      // Notify the assigned tech (if any)
      if (techId) {
        const startLabel = format(weekStart, 'd MMM', { locale: fr });
        const endLabel = format(addDays(weekStart, 6), 'd MMM', { locale: fr });
        const message = `Tu es de garde du ${startLabel} au ${endLabel}`;
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('notifications').insert({
            recipient_id: techId,
            sender_id: currentUser?.id || null,
            title: 'Piquet / urgence — tu es de garde',
            message,
            type: 'piquet_assigned',
          });
        } catch {}
        sendPush({
          recipient_id: techId,
          title: 'Piquet / urgence — tu es de garde',
          message,
          url: '/technician/piquet',
        });
      }

      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setProcessingId(null);
    }
  };

  const handleValidateReport = async (reportId: string) => {
    setProcessingId(reportId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('piquet_reports')
        .update({ status: 'validated' })
        .eq('id', reportId);
      if (error) throw new Error(error.message);
      toast.success('Rapport validé — prêt pour facturation');
      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la validation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBillReport = async (report: PiquetReport) => {
    setProcessingId(report.id);
    try {
      // Create intervention with is_piquet=true if none exists yet
      let interventionId = report.intervention_id;
      if (!interventionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: iv, error: ivErr } = await (supabase as any).from('interventions').insert({
          title: `Urgence nocturne — ${report.address}`,
          description: report.problem_description || null,
          address: report.address,
          date_planned: report.call_received_at,
          date_completed: report.intervention_ended_at,
          status: 'ready_to_bill',
          priority: 2,
          technician_id: report.technician_id,
          is_piquet: true,
          night_rate_multiplier: 1.5,
          source_type: 'piquet',
          client_info: report.client_name || report.client_phone ? {
            name: report.client_name || '',
            phone: report.client_phone || '',
          } : null,
        }).select('id').single();
        if (ivErr) throw new Error(ivErr.message);
        interventionId = (iv as { id: string }).id;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('piquet_reports').update({
          status: 'billed',
          intervention_id: interventionId,
        }).eq('id', report.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('piquet_reports').update({ status: 'billed' }).eq('id', report.id);
      }
      toast.success('Intervention créée — prête à facturer');
      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la création de la facture');
    } finally {
      setProcessingId(null);
    }
  };

  const currentSchedule = useMemo(() => {
    const today = new Date();
    return schedules.find((s) => {
      const a = new Date(s.start_date + 'T00:00:00');
      const b = new Date(s.end_date + 'T23:59:59');
      return today >= a && today <= b;
    }) || null;
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Clock className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service de piquet</h1>
          <p className="text-sm text-gray-500">Planning de garde + rapports d&apos;urgence nocturne</p>
        </div>
      </div>

      {currentSchedule && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-900">
              Technicien de garde actuellement : {getTechName(currentSchedule.technician)}
            </p>
            <p className="text-xs text-orange-800 mt-1">
              Du {format(new Date(currentSchedule.start_date + 'T00:00:00'), 'd MMM', { locale: fr })}
              {' '}au {format(new Date(currentSchedule.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
            </p>
            <p className="text-xs text-orange-700 mt-2">
              📞 <strong>Ne pas oublier :</strong> configurer la déviation de la ligne Richoz vers son mobile.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 flex gap-1 p-1 bg-gray-50">
          <button
            onClick={() => setTab('planning')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'planning' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarDays className="w-4 h-4 inline-block mr-1.5" />
            Planning (12 semaines)
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'reports' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <FileText className="w-4 h-4 inline-block mr-1.5" />
            Rapports à valider
            {reports.filter(r => r.status === 'submitted').length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {reports.filter(r => r.status === 'submitted').length}
              </span>
            )}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : tab === 'planning' ? (
          <div className="divide-y divide-gray-100">
            {weeks.map((weekStart) => {
              const sched = getScheduleForWeek(weekStart);
              const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
              const isProcessing = processingId === `week-${format(weekStart, 'yyyy-MM-dd')}`;
              return (
                <div key={weekStart.toISOString()} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      Semaine du {format(weekStart, 'd MMM', { locale: fr })} au {format(weekEnd, 'd MMM yyyy', { locale: fr })}
                    </p>
                    {sched?.notes && <p className="text-xs text-gray-500 mt-0.5">{sched.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={sched?.technician_id || ''}
                      onChange={(e) => handleAssignWeek(weekStart, e.target.value)}
                      disabled={isProcessing}
                      className="h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                    >
                      <option value="">— Aucun —</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>{getTechName(t)}</option>
                      ))}
                    </select>
                    {isProcessing && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                  </div>
                </div>
              );
            })}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun rapport d&apos;urgence en attente</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((r) => (
              <div key={r.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        r.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {r.status === 'submitted' ? 'À valider' : 'Brouillon'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {getTechName(r.technician)}
                      </span>
                      <span className="text-xs text-gray-500">
                        · Appel reçu {format(new Date(r.call_received_at), "d MMM 'à' HH:mm", { locale: fr })}
                      </span>
                    </div>
                    <div className="flex items-start gap-1 text-sm text-gray-700 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      {r.address}
                    </div>
                    {r.client_name && (
                      <p className="text-sm text-gray-700">
                        👤 {r.client_name}
                        {r.client_phone && (
                          <a href={`tel:${r.client_phone}`} className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <Phone className="w-3 h-3" />{r.client_phone}
                          </a>
                        )}
                      </p>
                    )}
                    {r.problem_description && (
                      <p className="text-sm text-gray-600 mt-2"><strong>Problème :</strong> {r.problem_description}</p>
                    )}
                    {r.actions_taken && (
                      <p className="text-sm text-gray-600 mt-1"><strong>Actions :</strong> {r.actions_taken}</p>
                    )}
                    {r.supplies_used && (
                      <p className="text-sm text-gray-600 mt-1"><strong>Matériel :</strong> {r.supplies_used}</p>
                    )}
                    {r.photos && r.photos.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {r.photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {r.status === 'submitted' && (
                      <button
                        onClick={() => handleValidateReport(r.id)}
                        disabled={processingId === r.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg disabled:opacity-50"
                      >
                        {processingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Valider
                      </button>
                    )}
                    <button
                      onClick={() => handleBillReport(r)}
                      disabled={processingId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
                      title="Crée une intervention is_piquet=true avec majoration ×1.5"
                    >
                      <Receipt className="w-3 h-3" />
                      Transformer en facture
                    </button>
                    {r.intervention_id && (
                      <Link href={`/interventions/${r.intervention_id}`} className="text-xs text-blue-600 hover:underline">
                        Voir l&apos;intervention
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden imports */}
      <UserCog className="hidden" />
      <Trash2 className="hidden" />
    </div>
  );
}
