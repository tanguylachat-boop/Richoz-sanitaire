'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Filter, ChevronLeft, ChevronRight, User, CalendarDays, CalendarRange, Calendar, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { InterventionForm } from '@/components/interventions/InterventionForm';
import { InterventionDetailSheet } from '@/components/calendar/InterventionDetailSheet';
import { TimeGridView } from '@/components/calendar/TimeGridView';
import type { LeaveEntry, BirthdayEntry } from '@/components/calendar/TimeGridView';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, addWeeks, subWeeks, addDays,
  subDays, addMinutes, isWithinInterval,
} from 'date-fns';
import { fr } from 'date-fns/locale';

type CalendarView = 'month' | 'week' | 'day';
type InterventionTypeFilter = 'all' | 'depannage' | 'chantier';

interface Intervention {
  id: string; title: string; description: string | null; address: string;
  date_planned: string | null; estimated_duration_minutes: number; status: string;
  priority: number; technician_id: string | null; regie_id: string | null;
  client_info: { name?: string; phone?: string } | null; work_order_number: string | null;
  intervention_type?: 'depannage' | 'chantier' | null;
  technician?: { id: string; first_name: string | null; last_name: string | null } | null;
}

interface Technician { id: string; first_name: string | null; last_name: string | null; email: string; }
interface Regie { id: string; name: string; }
interface CalendarBlock { id: string; title: string; date_planned: string; estimated_duration_minutes: number; status: string; technician_id: string | null; intervention_type?: string | null; work_order_number?: string | null; }

const TYPE_COLORS: Record<string, string> = { depannage: 'bg-red-500 hover:bg-red-600', chantier: 'bg-blue-500 hover:bg-blue-600' };
const STATUS_COLORS: Record<string, string> = { nouveau: 'bg-blue-500 hover:bg-blue-600', planifie: 'bg-amber-500 hover:bg-amber-600', en_cours: 'bg-orange-500 hover:bg-orange-600', termine: 'bg-emerald-500 hover:bg-emerald-600', ready_to_bill: 'bg-amber-400 hover:bg-amber-500', billed: 'bg-violet-500 hover:bg-violet-600', annule: 'bg-gray-400 hover:bg-gray-500' };
const getInterventionColor = (iv: Intervention) => (iv.intervention_type && TYPE_COLORS[iv.intervention_type]) ? TYPE_COLORS[iv.intervention_type] : STATUS_COLORS[iv.status] || 'bg-gray-500 hover:bg-gray-600';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [detailIntervention, setDetailIntervention] = useState<Intervention | null>(null);
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
    const { data } = await supabase.from('interventions').select(`id, title, description, address, date_planned, estimated_duration_minutes, status, priority, technician_id, regie_id, client_info, work_order_number, intervention_type, technician:users!interventions_technician_id_fkey(id, first_name, last_name)`).gte('date_planned', start.toISOString()).lte('date_planned', end.toISOString()).order('date_planned', { ascending: true });
    if (data) setInterventions(data as Intervention[]);
    const sd = format(start, 'yyyy-MM-dd'); const ed = format(end, 'yyyy-MM-dd');
    const { data: leavesData } = await supabase.from('leave_requests').select(`technician_id, start_date, end_date, technician:users!leave_requests_technician_id_fkey(first_name, last_name)`).eq('status', 'approved').lte('start_date', ed).gte('end_date', sd);
    if (leavesData) setLeaves(leavesData as LeaveEntry[]);

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

  const getIvsForDay = (date: Date) => filteredInterventions.filter((iv) => iv.date_planned && isSameDay(new Date(iv.date_planned), date));
  const getLeavesForDay = (day: Date): LeaveEntry[] => leaves.filter((l) => { const s = new Date(l.start_date + 'T00:00:00'); const e = new Date(l.end_date + 'T23:59:59'); return isWithinInterval(day, { start: s, end: e }); });
  const getBirthdaysForDay = (day: Date): BirthdayEntry[] => birthdays.filter((b) => isSameDay(new Date(b.date + 'T00:00:00'), day));
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
                  const dayIvs = getIvsForDay(day); const dayLeaves = getLeavesForDay(day); const dayBirthdays = getBirthdaysForDay(day);
                  const isCur = isSameMonth(day, currentDate); const isT = isToday(day);
                  const MAX = 2; const overflow = dayIvs.length - MAX;
                  return (<div key={idx} className={`bg-white min-h-[100px] p-2 ${!isCur ? 'bg-gray-50' : ''}`}>
                    <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${isT ? 'bg-blue-600 text-white' : isCur ? 'text-gray-900' : 'text-gray-400'}`}>{format(day, 'd')}</div>
                    {dayBirthdays.map((b) => (<div key={`b-${b.user_id}`} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 mb-0.5 truncate">🎂 {b.first_name}</div>))}
                    {dayLeaves.map((l, i) => (<div key={`l-${l.technician_id}-${i}`} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 mb-0.5 truncate">🌴 {getTechName(l.technician)}</div>))}
                    <div className="space-y-1">
                      {dayIvs.slice(0, MAX).map((iv) => (<button key={iv.id} onClick={() => handleInterventionClick(iv)} className={`w-full text-left text-xs px-1.5 py-1 rounded text-white transition-colors cursor-pointer ${getInterventionColor(iv)}`} title={`${iv.intervention_type === 'chantier' ? '[Chantier]' : '[Dépannage]'} ${iv.work_order_number || iv.title}`}><div className="flex items-center gap-1"><span className="text-[10px]">{getTypeEmoji(iv)}</span>{iv.technician && <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-bold">{getTechInitials(iv.technician)}</span>}<span className="truncate flex-1">{iv.work_order_number || iv.title}</span></div></button>))}
                      {overflow > 0 && (<button onClick={() => switchToDay(day)} className="w-full text-left text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors">+ {overflow} autre{overflow > 1 ? 's' : ''}</button>)}
                    </div>
                  </div>);
                })}
              </div>
            </>)}
            {view === 'week' && <TimeGridView mode="week" currentDate={currentDate} interventions={filteredInterventions} leaves={leaves} birthdays={birthdays} onInterventionClick={handleInterventionClick} />}
            {view === 'day' && <TimeGridView mode="day" currentDate={currentDate} interventions={filteredInterventions} leaves={leaves} birthdays={birthdays} onInterventionClick={handleInterventionClick} />}
          </>)}
        </div>

        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /><span className="text-gray-600">🔧 Dépannage</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /><span className="text-gray-600">🏗️ Chantier</span></div>
            <div className="border-l border-gray-300 h-4" />
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" /><span className="text-gray-600">🌴 Congé</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-100 border border-violet-300" /><span className="text-gray-600">🎂 Anniversaire</span></div>
            <div className="flex items-center gap-1.5"><span className="w-8 h-3 rounded bg-gray-100 border border-dashed border-gray-300" /><span className="text-gray-600">🍽️ Pause midi</span></div>
            <div className="flex items-center gap-1.5"><User className="w-3 h-3 text-gray-500" /><span className="text-gray-600">= Technicien assigné</span></div>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPLIT VIEW pour création: Formulaire + Calendrier semaine cliquable
// ═══════════════════════════════════════════════════════════════════════════════

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const LUNCH_START = 12;
const LUNCH_END_HOUR = 13;
const LUNCH_END_MIN = 30;

function CreateInterventionSplitView({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState(new Date());
  const [calendarInterventions, setCalendarInterventions] = useState<CalendarBlock[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);
  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '',
    intervention_type: 'depannage',
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
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const fetchCalendarData = useCallback(async () => {
    let q = supabase.from('interventions').select('id, title, date_planned, estimated_duration_minutes, status, technician_id, intervention_type, work_order_number').gte('date_planned', weekStart.toISOString()).lte('date_planned', weekEnd.toISOString()).not('status', 'eq', 'annule');
    if (formData.technician_id) q = q.eq('technician_id', formData.technician_id);
    const { data } = await q;
    if (data) setCalendarInterventions(data as CalendarBlock[]);
  }, [weekStart, weekEnd, formData.technician_id]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'priority' || name === 'estimated_duration_minutes' ? parseInt(value) : value }));
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (hour >= LUNCH_START && hour < 13.5) return;
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
      });
      if (error) throw new Error(error.message);
      toast.success('Intervention créée avec succès');
      onSuccess();
    } catch (err) {
      console.error('Error creating intervention:', err);
      toast.error("Erreur lors de la création");
    } finally { setIsLoading(false); }
  };

  const getTechName = (t: Technician) => { if (t.first_name && t.last_name) return `${t.first_name} ${t.last_name}`; return t.first_name || t.last_name || t.email; };
  const selectedTechName = formData.technician_id ? getTechName(technicians.find(t => t.id === formData.technician_id)!) : 'Tous les techniciens';
  const ic = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const sc = `${ic} bg-white`;
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);
  const getDayIvs = (day: Date) => calendarInterventions.filter(iv => iv.date_planned && isSameDay(new Date(iv.date_planned), day));
  const getBlockStyle = (iv: CalendarBlock) => { const d = new Date(iv.date_planned); const h = d.getHours(); const m = d.getMinutes(); const sm = Math.max((h - START_HOUR) * 60 + m, 0); const dur = Math.max(iv.estimated_duration_minutes || 30, 15); const em = Math.min(sm + dur, TOTAL_HOURS * 60); return { top: (sm / 60) * HOUR_HEIGHT, height: Math.max(((em - sm) / 60) * HOUR_HEIGHT, 16) }; };
  const lunchTop = (LUNCH_START - START_HOUR) * HOUR_HEIGHT;
  const lunchHeight = ((LUNCH_END_HOUR - LUNCH_START) * 60 + LUNCH_END_MIN) / 60 * HOUR_HEIGHT;

  return (
    <div className="flex gap-0 max-h-[85vh]">
      {/* ═══ LEFT: Formulaire ═══ */}
      <div className="w-[480px] flex-shrink-0 overflow-y-auto px-6 border-r border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label><input type="text" name="title" required value={formData.title} onChange={handleChange} className={ic} placeholder="Ex: Fuite robinet cuisine" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Détails..." /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label><input type="text" name="address" required value={formData.address} onChange={handleChange} className={ic} placeholder="Adresse complète" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Technicien</label><select name="technician_id" value={formData.technician_id} onChange={handleChange} className={sc}><option value="">-- Non assigné --</option>{technicians.map((t) => <option key={t.id} value={t.id}>{getTechName(t)}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select name="intervention_type" value={formData.intervention_type} onChange={handleChange} className={sc}><option value="depannage">🔧 Dépannage</option><option value="chantier">🏗️ Chantier</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Régie</label><select name="regie_id" value={formData.regie_id} onChange={handleChange} className={sc}><option value="">-- Aucune --</option>{regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">N° Bon de travail</label><input type="text" name="work_order_number" value={formData.work_order_number} onChange={handleChange} className={ic} placeholder="Ex: #1723245" /></div>
          </div>
          <div className={`p-3 rounded-lg border ${formData.date_planned ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {formData.date_planned ? (<p className="text-sm text-green-800">📅 <strong>{format(new Date(formData.date_planned), 'EEEE d MMMM', { locale: fr })}</strong> à <strong>{formData.time_planned || '09:00'}</strong></p>) : (<p className="text-sm text-amber-800">👆 Cliquez sur un créneau libre dans le calendrier →</p>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" name="date_planned" value={formData.date_planned} onChange={handleChange} className={ic} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Heure</label><input type="time" name="time_planned" step="1800" value={formData.time_planned} onChange={handleChange} className={ic} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label><input type="number" name="estimated_duration_minutes" min="15" step="15" value={formData.estimated_duration_minutes} onChange={handleChange} className={ic} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label><select name="status" value={formData.status} onChange={handleChange} className={sc}><option value="nouveau">Nouveau</option><option value="planifie">Planifié</option><option value="en_cours">En cours</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label><select name="priority" value={formData.priority} onChange={handleChange} className={sc}><option value={0}>Normal</option><option value={1}>Urgent</option><option value={2}>Urgence absolue</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom client</label><input type="text" name="client_name" value={formData.client_name} onChange={handleChange} className={ic} placeholder="Nom du locataire" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label><input type="tel" name="client_phone" value={formData.client_phone} onChange={handleChange} className={ic} placeholder="+41 XX XXX XX XX" /></div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">{isLoading && <Loader2 className="w-4 h-4 animate-spin" />}{isLoading ? 'Création...' : "Créer l'intervention"}</button>
          </div>
        </form>
      </div>

      {/* ═══ RIGHT: Mini calendrier semaine ═══ */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3 px-3 pt-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarWeek(subWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-gray-700">{format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}</span>
            <button onClick={() => setCalendarWeek(addWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setCalendarWeek(new Date())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg font-medium">Auj.</button>
          </div>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{selectedTechName}</span>
        </div>

        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mx-3 mb-3">
          <div className="flex min-w-[500px]">
            <div className="flex-shrink-0 w-12 border-r border-gray-200">
              <div className="h-8 border-b border-gray-200" />
              <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                {hours.map((h) => (<div key={h} className="absolute w-full text-right pr-1.5 text-[10px] text-gray-400 -translate-y-1/2" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>{`${String(h).padStart(2, '0')}:00`}</div>))}
              </div>
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}>
              {weekDays.map((day, ci2) => {
                const dayIvs = getDayIvs(day); const td = isToday(day);
                const isSel = formData.date_planned && isSameDay(new Date(formData.date_planned + 'T00:00:00'), day);
                return (
                  <div key={ci2} className="border-r border-gray-100 last:border-r-0">
                    <div className={`h-8 flex items-center justify-center border-b border-gray-200 text-xs font-medium ${td ? 'bg-blue-50 text-blue-600' : isSel ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>{format(day, 'EEE d', { locale: fr })}</div>
                    <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                      {hours.map((h) => (<div key={h} className="absolute w-full border-t border-gray-50" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />))}
                      {hours.map((h) => [0, 0.5].map((half) => {
                        const sh = h + half; if (sh >= LUNCH_START && sh < 13.5) return null;
                        return (<div key={`${h}-${half}`} className="absolute left-0 right-0 cursor-pointer hover:bg-blue-50 transition-colors z-[1]" style={{ top: (sh - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT / 2 }} onClick={() => handleSlotClick(day, sh)} title={`${String(Math.floor(sh)).padStart(2, '0')}:${half ? '30' : '00'}`} />);
                      }))}
                      <div className="absolute left-0 right-0 z-[2] pointer-events-none" style={{ top: lunchTop, height: lunchHeight }}><div className="w-full h-full bg-gray-100 border-y border-dashed border-gray-300 flex items-center justify-center"><span className="text-[10px] text-gray-400">🍽️</span></div></div>
                      {td && (() => { const now = new Date(); const nm = (now.getHours() - START_HOUR) * 60 + now.getMinutes(); if (nm < 0 || nm > TOTAL_HOURS * 60) return null; return <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: (nm / 60) * HOUR_HEIGHT }}><div className="h-px bg-red-500 w-full" /><div className="w-1.5 h-1.5 rounded-full bg-red-500 -mt-[3px] -ml-0.5" /></div>; })()}
                      {isSel && formData.time_planned && (() => { const [hh, mm] = formData.time_planned.split(':').map(Number); const sm2 = (hh - START_HOUR) * 60 + mm; const dur = formData.estimated_duration_minutes || 60; const t2 = (sm2 / 60) * HOUR_HEIGHT; const h2 = (dur / 60) * HOUR_HEIGHT; return (<div className="absolute left-0.5 right-0.5 rounded border-2 border-dashed border-green-500 bg-green-100/50 z-[8] pointer-events-none" style={{ top: t2, height: Math.max(h2, 16) }}><div className="px-1 py-0.5 text-[10px] font-medium text-green-700 truncate">📌 {formData.title || 'Nouvelle'}</div></div>); })()}
                      {dayIvs.map((iv) => { const { top, height } = getBlockStyle(iv); const isDep = iv.intervention_type !== 'chantier'; const col = isDep ? 'bg-red-400 border-red-600' : 'bg-blue-400 border-blue-600'; const st = format(new Date(iv.date_planned), 'HH:mm'); const et = format(addMinutes(new Date(iv.date_planned), iv.estimated_duration_minutes || 30), 'HH:mm'); return (<div key={iv.id} className={`absolute left-0.5 right-0.5 rounded border-l-2 text-white text-[10px] overflow-hidden z-[5] ${col}`} style={{ top, height: Math.max(height, 16) }} title={`${iv.work_order_number || iv.title} (${st}-${et})`}><div className="px-1 py-0.5 truncate font-medium">{iv.work_order_number || iv.title}</div>{height >= 28 && <div className="px-1 text-white/70">{st}-{et}</div>}</div>); })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 px-3 pb-2 text-[10px] text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400" />Dépannage</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" />Chantier</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-100 border border-dashed border-green-500" />Nouveau RDV</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gray-100" />Pause midi</span>
        </div>
      </div>
    </div>
  );
}