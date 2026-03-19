'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Filter, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Calendar, Loader2, Pencil, Trash2, X as XIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { InterventionForm } from '@/components/interventions/InterventionForm';
import { InterventionDetailSheet } from '@/components/calendar/InterventionDetailSheet';
import { TimeGridView, TECHNICIAN_COLORS } from '@/components/calendar/TimeGridView';
import type { LeaveEntry, BirthdayEntry, ReminderEntry, SelectedSlot } from '@/components/calendar/TimeGridView';
import { getApprovedLeaves } from '@/lib/leave-utils';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addWeeks, subWeeks, addDays,
  subDays, isWithinInterval,
} from 'date-fns';
import { fr } from 'date-fns/locale';

type CalendarView = 'month' | 'week' | 'day';
type InterventionTypeFilter = 'all' | 'depannage' | 'chantier';

interface Intervention {
  id: string; title: string; description: string | null; address: string;
  date_planned: string | null; date_end: string | null; estimated_duration_minutes: number; status: string;
  priority: number; technician_id: string | null; regie_id: string | null;
  client_info: { name?: string; phone?: string } | null; work_order_number: string | null;
  intervention_type?: 'depannage' | 'chantier' | null;
  technician?: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface Technician { id: string; first_name: string | null; last_name: string | null; email: string; }
interface Regie { id: string; name: string; }

const UNASSIGNED_COLOR = '#9CA3AF';

const VIEW_TABS: { value: CalendarView; label: string; icon: typeof CalendarDays }[] = [
  { value: 'month', label: 'Mois', icon: CalendarDays },
  { value: 'week', label: 'Semaine', icon: CalendarRange },
  { value: 'day', label: 'Jour', icon: Calendar },
];

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>('week');
  const [typeFilter, setTypeFilter] = useState<InterventionTypeFilter>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [reminders, setReminders] = useState<ReminderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [detailIntervention, setDetailIntervention] = useState<Intervention | null>(null);
  // Leave popup state
  const [selectedLeave, setSelectedLeave] = useState<LeaveEntry & { id?: string } | null>(null);
  const [isEditingLeave, setIsEditingLeave] = useState(false);
  const [editLeaveStart, setEditLeaveStart] = useState('');
  const [editLeaveEnd, setEditLeaveEnd] = useState('');
  const [isDeletingLeave, setIsDeletingLeave] = useState(false);
  const [leaveProcessing, setLeaveProcessing] = useState(false);
  const supabase = createClient();

  const getDateRange = useCallback(() => {
    switch (view) {
      case 'month': { const s = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }); const e = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }); return { start: s, end: e }; }
      case 'week': { const s = startOfWeek(currentDate, { weekStartsOn: 1 }); const e = endOfWeek(currentDate, { weekStartsOn: 1 }); return { start: s, end: e }; }
      case 'day': return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    }
  }, [view, currentDate]);

  const fetchInterventions = useCallback(async () => {
    setIsLoading(true);
    const { start, end } = getDateRange();
    const { data } = await supabase.from('interventions').select(`id, title, description, address, date_planned, date_end, estimated_duration_minutes, status, priority, technician_id, regie_id, client_info, work_order_number, intervention_type, technician:users!interventions_technician_id_fkey(id, first_name, last_name)`).gte('date_planned', start.toISOString()).lte('date_planned', end.toISOString()).order('date_planned', { ascending: true });
    if (data) setInterventions(data as Intervention[]);
    const sd = format(start, 'yyyy-MM-dd'); const ed = format(end, 'yyyy-MM-dd');
    const { data: leavesData } = await supabase.from('leave_requests').select(`id, technician_id, start_date, end_date, technician:users!leave_requests_technician_id_fkey(first_name, last_name)`).eq('status', 'approved').lte('start_date', ed).gte('end_date', sd);
    if (leavesData) setLeaves(leavesData as (LeaveEntry & { id: string })[]);

    // Fetch birthdays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usersData } = await (supabase as any)
      .from('users')
      .select('id, first_name, last_name, birth_date')
      .not('birth_date', 'is', null)
      .eq('is_active', true);

    if (usersData) {
      const currentYear = start.getFullYear();
      const entries: BirthdayEntry[] = [];
      for (const u of usersData as { id: string; first_name: string; last_name: string; birth_date: string }[]) {
        const [, month, day] = u.birth_date.split('-');
        const bdThisYear = `${currentYear}-${month}-${day}`;
        entries.push({ user_id: u.id, first_name: u.first_name, last_name: u.last_name, date: bdThisYear });
      }
      setBirthdays(entries);
    }

    // Fetch reminders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: remindersData } = await (supabase as any)
      .from('intervention_reminders')
      .select('id, intervention_id, user_id, reminder_date, message, completed, technician:users!intervention_reminders_user_id_fkey(first_name, last_name)')
      .gte('reminder_date', sd)
      .lte('reminder_date', ed)
      .eq('completed', false);
    if (remindersData) setReminders(remindersData as ReminderEntry[]);

    setIsLoading(false);
  }, [view, currentDate]);

  useEffect(() => { fetchInterventions(); }, [fetchInterventions]);

  const navigatePrevious = () => { switch (view) { case 'month': setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)); break; case 'week': setCurrentDate(subWeeks(currentDate, 1)); break; case 'day': setCurrentDate(subDays(currentDate, 1)); break; } };
  const navigateNext = () => { switch (view) { case 'month': setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)); break; case 'week': setCurrentDate(addWeeks(currentDate, 1)); break; case 'day': setCurrentDate(addDays(currentDate, 1)); break; } };
  const goToToday = () => setCurrentDate(new Date());

  const navigationTitle = useMemo(() => {
    switch (view) {
      case 'month': return format(currentDate, 'MMMM yyyy', { locale: fr });
      case 'week': { const ws = startOfWeek(currentDate, { weekStartsOn: 1 }); const we = endOfWeek(currentDate, { weekStartsOn: 1 }); return `${format(ws, 'd MMM', { locale: fr })} – ${format(we, 'd MMM yyyy', { locale: fr })}`; }
      case 'day': return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
    }
  }, [view, currentDate]);

  const handleLeaveClick = (leave: LeaveEntry) => {
    setSelectedLeave(leave as LeaveEntry & { id?: string });
    setIsEditingLeave(false);
    setIsDeletingLeave(false);
  };

  const handleEditLeave = async () => {
    if (!selectedLeave || !(selectedLeave as { id?: string }).id) return;
    setLeaveProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('leave_requests').update({ start_date: editLeaveStart, end_date: editLeaveEnd }).eq('id', (selectedLeave as { id: string }).id);
      if (error) throw new Error(error.message);
      toast.success('Congé modifié');
      setSelectedLeave(null);
      fetchInterventions();
    } catch { toast.error('Erreur lors de la modification'); }
    finally { setLeaveProcessing(false); }
  };

  const handleDeleteLeave = async () => {
    if (!selectedLeave || !(selectedLeave as { id?: string }).id) return;
    setLeaveProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('leave_requests').delete().eq('id', (selectedLeave as { id: string }).id);
      if (error) throw new Error(error.message);
      toast.success('Congé annulé et supprimé');
      setSelectedLeave(null);
      fetchInterventions();
    } catch { toast.error('Erreur lors de la suppression'); }
    finally { setLeaveProcessing(false); }
  };

  const handleInterventionClick = (iv: Intervention) => setDetailIntervention(iv);
  const handleEditFromDetail = () => { if (detailIntervention) { setSelectedIntervention(detailIntervention); setDetailIntervention(null); setIsEditModalOpen(true); } };
  const handleCreateSuccess = () => { setIsCreateModalOpen(false); fetchInterventions(); };
  const handleEditSuccess = () => { setIsEditModalOpen(false); setSelectedIntervention(null); fetchInterventions(); };
  const switchToDay = (date: Date) => { setCurrentDate(date); setView('day'); };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const filteredInterventions = useMemo(() => {
    if (typeFilter === 'all') return interventions;
    return interventions.filter((iv) => iv.intervention_type === typeFilter);
  }, [interventions, typeFilter]);

  // Technician color map for month view
  const techColorMap = useMemo(() => {
    const uniqueIds = Array.from(new Set(interventions.map((iv) => iv.technician_id).filter(Boolean))) as string[];
    uniqueIds.sort();
    const map: Record<string, string> = {};
    uniqueIds.forEach((id, idx) => { map[id] = TECHNICIAN_COLORS[idx % TECHNICIAN_COLORS.length]; });
    return map;
  }, [interventions]);

  const getTechColor = (techId: string | null): string => {
    if (!techId) return UNASSIGNED_COLOR;
    return techColorMap[techId] || UNASSIGNED_COLOR;
  };

  // Unique technicians for legend
  const uniqueTechnicians = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    interventions.forEach((iv) => {
      if (iv.technician_id && iv.technician && !seen.has(iv.technician_id)) {
        const name = [iv.technician.first_name, iv.technician.last_name].filter(Boolean).join(' ') || '?';
        seen.set(iv.technician_id, { id: iv.technician_id, name, color: techColorMap[iv.technician_id] || UNASSIGNED_COLOR });
      }
    });
    return Array.from(seen.values());
  }, [interventions, techColorMap]);

  const getIvsForDay = (date: Date) => filteredInterventions.filter((iv) => {
    if (!iv.date_planned) return false;
    // Multi-day chantier: show on all days between date_planned and date_end
    if (iv.date_end && iv.intervention_type === 'chantier') {
      const start = new Date(iv.date_planned);
      const end = new Date(iv.date_end);
      return date >= startOfDay(start) && date <= endOfDay(end);
    }
    return isSameDay(new Date(iv.date_planned), date);
  });
  const getLeavesForDay = (day: Date): LeaveEntry[] => leaves.filter((l) => { const s = new Date(l.start_date + 'T00:00:00'); const e = new Date(l.end_date + 'T23:59:59'); return isWithinInterval(day, { start: s, end: e }); });
  const getBirthdaysForDay = (day: Date): BirthdayEntry[] => birthdays.filter((b) => isSameDay(new Date(b.date + 'T00:00:00'), day));
  const getRemindersForDay = (day: Date): ReminderEntry[] => reminders.filter((r) => isSameDay(new Date(r.reminder_date + 'T00:00:00'), day));
  const getTechInitials = (t: Intervention['technician']) => t ? ((t.first_name?.[0] || '') + (t.last_name?.[0] || '')).toUpperCase() || '?' : null;
  const getTypeEmoji = (iv: Intervention) => iv.intervention_type === 'chantier' ? '🏗️' : '🔧';
  const getTechName = (t: LeaveEntry['technician']) => { if (!t) return '?'; if (t.first_name && t.last_name) return `${t.first_name} ${t.last_name}`; return t.first_name || t.last_name || '?'; };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><p className="text-gray-500">Planification et vue d&apos;ensemble des interventions</p></div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"><Filter className="w-4 h-4" />Filtrer</button>
          <button onClick={() => setIsCreateModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"><Plus className="w-4 h-4" />Nouvelle intervention</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {VIEW_TABS.map((tab) => { const Icon = tab.icon; const isActive = view === tab.value; return (<button key={tab.value} onClick={() => setView(tab.value)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Icon className="w-4 h-4" />{tab.label}</button>); })}
            </div>
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
              {([
                { value: 'all' as const, label: 'Tout', color: 'text-gray-900', activeBg: 'bg-white' },
                { value: 'depannage' as const, label: '🔧 Dépannage', color: 'text-red-700', activeBg: 'bg-red-50' },
                { value: 'chantier' as const, label: '🏗️ Chantier', color: 'text-blue-700', activeBg: 'bg-blue-50' },
              ]).map((tab) => (
                <button key={tab.value} onClick={() => setTypeFilter(tab.value)} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${typeFilter === tab.value ? `${tab.activeBg} ${tab.color} shadow-sm` : 'text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={navigatePrevious} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">Aujourd&apos;hui</button>
            <button onClick={navigateNext} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize ml-2">{navigationTitle}</h2>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>) : (<>
            {view === 'month' && (<>
              <div className="grid grid-cols-7 mb-2">{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d) => (<div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>))}</div>
              <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                {calendarDays.map((day, idx) => {
                  const dayIvs = getIvsForDay(day); const dayLeaves = getLeavesForDay(day); const dayBirthdays = getBirthdaysForDay(day); const dayReminders = getRemindersForDay(day);
                  const isCur = isSameMonth(day, currentDate); const isT = isToday(day);
                  const MAX = 2; const overflow = dayIvs.length - MAX;
                  return (<div key={idx} className={`bg-white min-h-[100px] p-2 ${!isCur ? 'bg-gray-50' : ''}`}>
                    <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${isT ? 'bg-blue-600 text-white' : isCur ? 'text-gray-900' : 'text-gray-400'}`}>{format(day, 'd')}</div>
                    {dayBirthdays.map((b) => (<div key={`b-${b.user_id}`} className="w-full text-left text-xs px-1.5 py-1 rounded-md bg-violet-200 text-violet-800 font-semibold mb-0.5 truncate border border-violet-300">🎂 {b.first_name}</div>))}
                    {dayLeaves.map((l, i) => (<div key={`l-${l.technician_id}-${i}`} className="w-full text-left text-xs px-1.5 py-1 rounded-md bg-emerald-200 text-emerald-800 font-semibold mb-0.5 truncate border border-emerald-400">🌴 {getTechName(l.technician)}</div>))}
                    {dayReminders.map((rem) => (<div key={`r-${rem.id}`} className="w-full text-left text-xs px-1.5 py-1 rounded-md bg-orange-200 text-orange-800 font-semibold mb-0.5 truncate border border-orange-400" title={rem.message}>🔔 {rem.message.length > 15 ? rem.message.slice(0, 15) + '…' : rem.message}</div>))}
                    <div className="space-y-1">
                      {dayIvs.slice(0, MAX).map((iv) => (<button key={iv.id} onClick={() => handleInterventionClick(iv)} className="w-full text-left text-xs px-1.5 py-1 rounded text-white transition-colors cursor-pointer hover:opacity-90" style={{ backgroundColor: getTechColor(iv.technician_id) }} title={`${iv.intervention_type === 'chantier' ? '[Chantier]' : '[Dépannage]'} ${iv.work_order_number || iv.title}`}><div className="flex items-center gap-1"><span className="text-[10px]">{getTypeEmoji(iv)}</span>{iv.technician && <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-bold">{getTechInitials(iv.technician)}</span>}<span className="truncate flex-1">{iv.work_order_number || iv.title}</span></div></button>))}
                      {overflow > 0 && (<button onClick={() => switchToDay(day)} className="w-full text-left text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors">+ {overflow} autre{overflow > 1 ? 's' : ''}</button>)}
                    </div>
                  </div>);
                })}
              </div>
            </>)}
            {view === 'week' && <TimeGridView mode="week" currentDate={currentDate} interventions={filteredInterventions} leaves={leaves} birthdays={birthdays} reminders={reminders} onInterventionClick={handleInterventionClick} onLeaveClick={handleLeaveClick} />}
            {view === 'day' && <TimeGridView mode="day" currentDate={currentDate} interventions={filteredInterventions} leaves={leaves} birthdays={birthdays} reminders={reminders} onInterventionClick={handleInterventionClick} onLeaveClick={handleLeaveClick} />}
          </>)}
        </div>

        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {uniqueTechnicians.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: t.color }} /><span className="text-gray-600">{t.name}</span></div>
            ))}
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: UNASSIGNED_COLOR }} /><span className="text-gray-600">Non assigné</span></div>
            <div className="border-l border-gray-300 h-4" />
            <div className="flex items-center gap-1.5"><span className="text-gray-600">🔧 Dépannage</span></div>
            <div className="flex items-center gap-1.5"><span className="text-gray-600">🏗️ Chantier</span></div>
            <div className="border-l border-gray-300 h-4" />
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /><span className="text-gray-600">🌴 Congé</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-100 border border-violet-300" /><span className="text-gray-600">🎂 Anniversaire</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" /><span className="text-gray-600">🔔 Rappel</span></div>
            <div className="flex items-center gap-1.5"><span className="w-8 h-3 rounded bg-gray-100 border border-dashed border-gray-300" /><span className="text-gray-600">🍽️ Pause midi</span></div>
          </div>
        </div>
      </div>

      {/* MODAL CRÉATION — Split view Formulaire + Calendrier */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nouvelle intervention" size="full">
        <CreateInterventionSplitView onSuccess={handleCreateSuccess} onCancel={() => setIsCreateModalOpen(false)} />
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }} title="Modifier l'intervention" size="lg">
        {selectedIntervention && <InterventionForm intervention={selectedIntervention} onSuccess={handleEditSuccess} onCancel={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }} onDelete={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }} />}
      </Modal>

      <InterventionDetailSheet intervention={detailIntervention} onClose={() => setDetailIntervention(null)} onEdit={handleEditFromDetail} />

      {/* Leave popup */}
      {selectedLeave && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setSelectedLeave(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">🌴 Congé</h3>
              <button onClick={() => setSelectedLeave(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><XIcon className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500">Technicien</p>
                <p className="text-sm font-semibold text-gray-900">{getTechName(selectedLeave.technician)}</p>
              </div>
              <div className="flex gap-4">
                <div><p className="text-xs text-gray-500">Du</p><p className="text-sm font-medium">{format(new Date(selectedLeave.start_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}</p></div>
                <div><p className="text-xs text-gray-500">Au</p><p className="text-sm font-medium">{format(new Date(selectedLeave.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}</p></div>
              </div>

              {isEditingLeave && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700">Modifier les dates</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={editLeaveStart} onChange={(e) => setEditLeaveStart(e.target.value)} className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
                    <input type="date" value={editLeaveEnd} onChange={(e) => setEditLeaveEnd(e.target.value)} className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}

              {isDeletingLeave && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <p className="text-sm text-red-800">Supprimer ce congé ?</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              {!isEditingLeave && !isDeletingLeave && (
                <>
                  <button onClick={() => { setIsEditingLeave(true); setEditLeaveStart(selectedLeave.start_date); setEditLeaveEnd(selectedLeave.end_date); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"><Pencil className="w-3.5 h-3.5" />Modifier</button>
                  <button onClick={() => setIsDeletingLeave(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" />Annuler</button>
                </>
              )}
              {isEditingLeave && (
                <>
                  <button onClick={() => setIsEditingLeave(false)} className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Retour</button>
                  <button onClick={handleEditLeave} disabled={leaveProcessing} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">{leaveProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}Enregistrer</button>
                </>
              )}
              {isDeletingLeave && (
                <>
                  <button onClick={() => setIsDeletingLeave(false)} className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Non, garder</button>
                  <button onClick={handleDeleteLeave} disabled={leaveProcessing} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">{leaveProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Supprimer</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPLIT VIEW pour création: Formulaire + TimeGridView calendrier semaine
// ═══════════════════════════════════════════════════════════════════════════════

function CreateInterventionSplitView({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState(new Date());
  const [calendarInterventions, setCalendarInterventions] = useState<Intervention[]>([]);
  const [calendarLeaves, setCalendarLeaves] = useState<LeaveEntry[]>([]);
  const [calendarBirthdays, setCalendarBirthdays] = useState<BirthdayEntry[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);
  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '',
    intervention_type: 'depannage', keys_info: '', date_end: '',
  });
  const supabase = createClient();

  useEffect(() => {
    const fetchRefs = async () => {
      const { data: t } = await supabase.from('users').select('id, first_name, last_name, email').eq('role', 'technician').order('last_name');
      if (t) setTechnicians(t);
      const { data: r } = await supabase.from('regies').select('id, name').eq('is_active', true).order('name');
      if (r) setRegies(r);
    };
    fetchRefs();
  }, []);

  const weekStart = useMemo(() => startOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);
  const weekEnd = useMemo(() => endOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);

  const fetchCalendarData = useCallback(async () => {
    const sd = format(weekStart, 'yyyy-MM-dd');
    const ed = format(weekEnd, 'yyyy-MM-dd');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from('interventions')
      .select('id, title, description, address, date_planned, estimated_duration_minutes, status, priority, technician_id, regie_id, client_info, work_order_number, intervention_type, technician:users!interventions_technician_id_fkey(id, first_name, last_name)')
      .gte('date_planned', weekStart.toISOString()).lte('date_planned', weekEnd.toISOString()).not('status', 'eq', 'annule');
    if (formData.technician_id) q = q.eq('technician_id', formData.technician_id);
    if (formData.intervention_type) q = q.eq('intervention_type', formData.intervention_type);

    const [{ data: ivData }, leavesData, { data: usersData }] = await Promise.all([
      q,
      getApprovedLeaves(sd, ed),
      supabase.from('users').select('id, first_name, last_name, birth_date').not('birth_date', 'is', null).eq('is_active', true),
    ]);

    if (ivData) setCalendarInterventions(ivData as Intervention[]);
    setCalendarLeaves(leavesData || []);

    if (usersData) {
      const year = new Date().getFullYear();
      const bdays: BirthdayEntry[] = usersData
        .filter((u: { birth_date: string | null }) => u.birth_date)
        .map((u: { id: string; first_name: string; last_name: string; birth_date: string }) => {
          const [, m, d] = u.birth_date.split('-');
          return { user_id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', date: `${year}-${m}-${d}` };
        });
      setCalendarBirthdays(bdays);
    }
  }, [weekStart, weekEnd, formData.technician_id, formData.intervention_type]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'priority' || name === 'estimated_duration_minutes' ? parseInt(value) : value }));
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (hour >= 12 && hour < 13.5) return;
    setFormData((prev) => ({ ...prev, date_planned: format(day, 'yyyy-MM-dd'), time_planned: `${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 === 0.5 ? '30' : '00'}` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let datePlanned = null;
      if (formData.date_planned) {
        const ds = formData.time_planned ? `${formData.date_planned}T${formData.time_planned}:00` : `${formData.date_planned}T09:00:00`;
        datePlanned = new Date(ds).toISOString();
      }
      const ci: Record<string, string> = {};
      if (formData.client_name) ci.name = formData.client_name;
      if (formData.client_phone) ci.phone = formData.client_phone;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('interventions').insert({
        title: formData.title, description: formData.description || null, address: formData.address,
        date_planned: datePlanned, estimated_duration_minutes: formData.estimated_duration_minutes,
        status: formData.status, priority: formData.priority,
        technician_id: formData.technician_id || null, regie_id: formData.regie_id || null,
        work_order_number: formData.work_order_number || null,
        client_info: Object.keys(ci).length > 0 ? ci : null,
        source_type: 'manual', intervention_type: formData.intervention_type,
        keys_info: formData.keys_info || null,
        date_end: formData.intervention_type === 'chantier' && formData.date_end
          ? new Date(`${formData.date_end}T18:00:00`).toISOString()
          : null,
      });
      if (error) throw new Error(error.message);

      // Insert notification if technician is assigned
      if (formData.technician_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert({
          user_id: formData.technician_id,
          title: 'Nouvelle intervention assignée',
          message: `${formData.title} — ${formData.address}`,
          type: 'intervention_assigned',
        });
      }

      toast.success('Intervention créée avec succès');
      onSuccess();
    } catch (err) {
      console.error('Error creating intervention:', err);
      toast.error("Erreur lors de la création");
    } finally { setIsLoading(false); }
  };

  const getTechNameLocal = (t: Technician) => { if (t.first_name && t.last_name) return `${t.first_name} ${t.last_name}`; return t.first_name || t.last_name || t.email; };
  const selectedTechName = formData.technician_id ? getTechNameLocal(technicians.find(t => t.id === formData.technician_id)!) : 'Tous les techniciens';
  const ic = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const sc = `${ic} bg-white`;

  const calendarSelectedSlot: SelectedSlot | null = formData.date_planned && formData.time_planned
    ? { date: formData.date_planned, time: formData.time_planned, durationMinutes: formData.estimated_duration_minutes || 60, title: formData.title || 'Nouvelle' }
    : null;

  return (
    <div className="flex gap-0 max-h-[85vh]">
      {/* ═══ LEFT: Formulaire ═══ */}
      <div className="w-[480px] flex-shrink-0 overflow-y-auto px-6 border-r border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input type="text" name="title" required value={formData.title} onChange={handleChange} className={ic} placeholder="Ex: Fuite robinet cuisine" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Détails..." /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label><input type="text" name="address" required value={formData.address} onChange={handleChange} className={ic} placeholder="Adresse complète" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technicien</label>
              <select name="technician_id" value={formData.technician_id} onChange={handleChange} className={sc}>
                <option value="">-- Non assigné --</option>
                {technicians.map((t) => {
                  const techLeave = formData.date_planned
                    ? calendarLeaves.find(l => l.technician_id === t.id && l.start_date <= formData.date_planned && l.end_date >= formData.date_planned)
                    : null;
                  const leaveLabel = techLeave
                    ? ` (En congé du ${format(new Date(techLeave.start_date + 'T00:00:00'), 'd MMM', { locale: fr })} au ${format(new Date(techLeave.end_date + 'T00:00:00'), 'd MMM', { locale: fr })})`
                    : '';
                  return <option key={t.id} value={t.id} disabled={!!techLeave}>{getTechNameLocal(t)}{leaveLabel}</option>;
                })}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select name="intervention_type" value={formData.intervention_type} onChange={handleChange} className={sc}><option value="depannage">🔧 Dépannage</option><option value="chantier">🏗️ Chantier</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Régie</label><select name="regie_id" value={formData.regie_id} onChange={handleChange} className={sc}><option value="">-- Aucune --</option>{regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">N° Bon de travail</label><input type="text" name="work_order_number" value={formData.work_order_number} onChange={handleChange} className={ic} placeholder="Ex: #1723245" /></div>
          </div>
          <div className={`p-3 rounded-lg border ${formData.date_planned ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {formData.date_planned ? (<p className="text-sm text-green-800">📅 <strong>{format(new Date(formData.date_planned), 'EEEE d MMMM', { locale: fr })}</strong> à <strong>{formData.time_planned || '09:00'}</strong></p>) : (<p className="text-sm text-amber-800">👆 Cliquez sur un créneau libre dans le calendrier →</p>)}
          </div>
          {formData.intervention_type === 'chantier' ? (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date début</label><input type="date" name="date_planned" value={formData.date_planned} onChange={handleChange} className={ic} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label><input type="date" name="date_end" value={formData.date_end} onChange={handleChange} className={ic} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" name="date_planned" value={formData.date_planned} onChange={handleChange} className={ic} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Heure</label><input type="time" name="time_planned" step="1800" value={formData.time_planned} onChange={handleChange} className={ic} /></div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label><input type="number" name="estimated_duration_minutes" min="15" step="15" value={formData.estimated_duration_minutes} onChange={handleChange} className={ic} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="status" value={formData.status} onChange={handleChange} className={sc}><option value="nouveau">Nouveau</option><option value="planifie">Planifié</option><option value="en_cours">En cours</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label><select name="priority" value={formData.priority} onChange={handleChange} className={sc}><option value={0}>Normal</option><option value={1}>Urgent</option><option value={2}>Urgence absolue</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom client</label><input type="text" name="client_name" value={formData.client_name} onChange={handleChange} className={ic} placeholder="Nom du locataire" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label><input type="tel" name="client_phone" value={formData.client_phone} onChange={handleChange} className={ic} placeholder="+41 XX XXX XX XX" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">🔑 Clés & Accès</label><textarea name="keys_info" rows={2} value={formData.keys_info} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Ex: Clés dans la boîte aux lettres, code 1234..." /></div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">{isLoading && <Loader2 className="w-4 h-4 animate-spin" />}{isLoading ? 'Création...' : "Créer l'intervention"}</button>
          </div>
        </form>
      </div>

      {/* ═══ RIGHT: TimeGridView calendrier semaine ═══ */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-2 px-3 pt-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarWeek(subWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-gray-700">{format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}</span>
            <button onClick={() => setCalendarWeek(addWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setCalendarWeek(new Date())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg font-medium">Auj.</button>
          </div>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{selectedTechName}</span>
        </div>

        <div className="flex-1 overflow-hidden mx-3 mb-3">
          <TimeGridView
            mode="week"
            currentDate={calendarWeek}
            interventions={calendarInterventions}
            leaves={calendarLeaves}
            birthdays={calendarBirthdays}
            onInterventionClick={() => {}}
            onSlotClick={handleSlotClick}
            selectedSlot={calendarSelectedSlot}
          />
        </div>
      </div>
    </div>
  );
}