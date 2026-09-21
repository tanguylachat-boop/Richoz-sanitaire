'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { BarChart3, Download, Users as UsersIcon, Loader2 } from 'lucide-react';
import { LEAVE_TYPES, LEAVE_TYPE_ORDER, type LeaveType } from '@/lib/constants';
import { LEAVE_HOURS_PER_DAY, annualAllowanceHours, leaveHours } from '@/lib/leave-duration';

interface LeaveRow {
  id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  leave_type: LeaveType;
  status: string;
}

interface TechRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  is_active: boolean;
  annual_leave_weeks: number | null;
}

// Durées via la règle partagée du dépôt (src/lib/leave-duration) : jours
// calendaires × 8h, heures réelles pour les absences partielles. Stats en
// HEURES en interne, affichées en jours équivalents — mêmes chiffres que la
// page Gestion des congés (pas de double décompte, recalcul systématique).
type StatsByTech = Record<string, Record<LeaveType, number>>;

function formatDaysFromHours(hours: number): string {
  const days = hours / LEAVE_HOURS_PER_DAY;
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function getTechName(t: TechRow): string {
  if (t.first_name && t.last_name) return `${t.first_name} ${t.last_name}`;
  return t.first_name || t.last_name || t.email;
}

export default function AdminStatsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [technicians, setTechnicians] = useState<TechRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    setLeaves([]);
    setTechnicians([]);
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;

    try {
      const [{ data: leavesData, error: leavesError }, { data: techData, error: techError }] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('id, technician_id, start_date, end_date, start_time, end_time, leave_type, status')
          .eq('status', 'approved')
          .lte('start_date', endStr)
          .gte('end_date', startStr),
        supabase
          .from('users')
          .select('id, first_name, last_name, email, is_active, annual_leave_weeks')
          .in('role', ['technician', 'secretary', 'admin'])
          .order('last_name'),
      ]);

      if (leavesError || techError) throw new Error('Chargement RH impossible');
      if (currentRequest !== requestId.current) return;
      setLeaves((leavesData || []) as LeaveRow[]);
      setTechnicians((techData || []) as TechRow[]);
    } catch {
      if (currentRequest === requestId.current) {
        setLoadError('Impossible de charger les statistiques RH. Vérifiez votre connexion et vos droits, puis réessayez.');
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [year, supabase]);

  useEffect(() => {
    const pendingRequests = requestId;
    fetchData();
    return () => { pendingRequests.current++; };
  }, [fetchData]);

  const stats: StatsByTech = useMemo(() => {
    const result: StatsByTech = {};
    for (const t of technicians) {
      result[t.id] = { conge: 0, maladie: 0, rtt: 0, sans_solde: 0, accident: 0, autre: 0 };
    }
    const clip = { clipStart: `${year}-01-01`, clipEnd: `${year}-12-31` };

    for (const l of leaves) {
      if (!result[l.technician_id]) continue;
      const hours = leaveHours(l, clip);
      const type = (l.leave_type || 'conge') as LeaveType;
      result[l.technician_id][type] = (result[l.technician_id][type] || 0) + hours;
    }
    return result;
  }, [leaves, technicians, year]);

  const totals = useMemo(() => {
    const t: Record<LeaveType, number> = { conge: 0, maladie: 0, rtt: 0, sans_solde: 0, accident: 0, autre: 0 };
    for (const techId of Object.keys(stats)) {
      for (const lt of LEAVE_TYPE_ORDER) {
        t[lt] += stats[techId][lt] || 0;
      }
    }
    return t;
  }, [stats]);

  const handleExportCSV = () => {
    const header = ['Nom', 'Email', 'Solde annuel (sem.)', 'Solde annuel (h)', ...LEAVE_TYPE_ORDER.map((t) => `${LEAVE_TYPES[t].label} (j)`), 'Total jours', 'Heures restantes'];
    const rows = technicians.map((t) => {
      const s = stats[t.id] || ({} as Record<LeaveType, number>);
      const totalHours = LEAVE_TYPE_ORDER.reduce((sum, lt) => sum + (s[lt] || 0), 0);
      const weeks = t.annual_leave_weeks ?? 5;
      const allowedHours = annualAllowanceHours(t.annual_leave_weeks);
      const remainingHours = allowedHours - (s.conge || 0);
      return [
        getTechName(t),
        t.email,
        String(weeks),
        String(allowedHours),
        ...LEAVE_TYPE_ORDER.map((lt) => formatDaysFromHours(s[lt] || 0)),
        formatDaysFromHours(totalHours),
        String(remainingHours),
      ];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stats-rh-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé');
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Statistiques RH</h1>
            <p className="text-sm text-gray-500">Congés, maladie et absences par employé</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={handleExportCSV}
            disabled={isLoading || !!loadError || technicians.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button onClick={fetchData} className="mt-2 underline">Réessayer</button>
        </div>
      )}
      {!isLoading && !loadError && leaves.length === 0 && technicians.length > 0 && (
        <p role="status" className="text-sm text-gray-600">Aucune absence approuvée pour {year}.</p>
      )}
      {!isLoading && !loadError && <>
      {/* Totals cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {LEAVE_TYPE_ORDER.map((lt) => (
          <div key={lt} className={`rounded-xl border p-4 ${LEAVE_TYPES[lt].badgeClass}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wide">{LEAVE_TYPES[lt].label}</span>
              <span className="text-lg">{LEAVE_TYPES[lt].emoji}</span>
            </div>
            <div className="text-2xl font-bold">{formatDaysFromHours(totals[lt])}</div>
            <div className="text-xs opacity-75">jour{totals[lt] > LEAVE_HOURS_PER_DAY ? 's' : ''}</div>
          </div>
        ))}
      </div>

      {/* Table per tech */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Détail par employé · {year}</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employé</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Solde / an</th>
                  {LEAVE_TYPE_ORDER.map((lt) => (
                    <th key={lt} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                      {LEAVE_TYPES[lt].emoji} {LEAVE_TYPES[lt].label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Total j.</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-emerald-700 uppercase whitespace-nowrap">Heures restantes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {technicians.map((t) => {
                  const s = stats[t.id] || ({} as Record<LeaveType, number>);
                  const totalHours = LEAVE_TYPE_ORDER.reduce((sum, lt) => sum + (s[lt] || 0), 0);
                  const weeks = t.annual_leave_weeks ?? 5;
                  const allowedHours = annualAllowanceHours(t.annual_leave_weeks);
                  const remainingHours = allowedHours - (s.conge || 0);
                  const isLow = remainingHours <= allowedHours * 0.2;
                  const isExhausted = remainingHours <= 0;
                  return (
                    <tr key={t.id} className={!t.is_active ? 'opacity-50' : ''}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {getTechName(t)}
                        {!t.is_active && <span className="ml-2 text-xs text-gray-400">(inactif)</span>}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{weeks} sem.</span>
                        <span className="block text-gray-400">({allowedHours}h)</span>
                      </td>
                      {LEAVE_TYPE_ORDER.map((lt) => (
                        <td key={lt} className="px-3 py-3 text-center text-gray-700">
                          {formatDaysFromHours(s[lt] || 0)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-semibold text-gray-900">{formatDaysFromHours(totalHours)}</td>
                      <td className={`px-3 py-3 text-center font-bold ${isExhausted ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {remainingHours}h
                        <span className="block text-xs font-normal opacity-70">
                          ≈ {(remainingHours / LEAVE_HOURS_PER_DAY).toFixed(1)} j.
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {technicians.length === 0 && (
                  <tr>
                    <td colSpan={LEAVE_TYPE_ORDER.length + 4} className="px-4 py-12 text-center text-gray-400">
                      Aucun employé trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}
      {isLoading && <p role="status" className="flex items-center gap-2 text-gray-600"><Loader2 className="h-5 w-5 animate-spin" />Chargement des statistiques RH…</p>}
    </div>
  );
}
