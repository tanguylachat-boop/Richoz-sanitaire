'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Filter, ChevronLeft, ChevronRight, User, CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { InterventionForm } from '@/components/interventions/InterventionForm';
import { InterventionDetailSheet } from '@/components/calendar/InterventionDetailSheet';
import { TimeGridView } from '@/components/calendar/TimeGridView';
import type { LeaveEntry } from '@/components/calendar/TimeGridView';
import { createClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isWithinInterval,
} from 'date-fns';
import { fr } from 'date-fns/locale';

// =============================================
// TYPES
// =============================================

type CalendarView = 'month' | 'week' | 'day';

interface Intervention {
  id: string;
  title: string;
  description: string | null;
  address: string;
  date_planned: string | null;
  estimated_duration_minutes: number;
  status: string;
  priority: number;
  technician_id: string | null;
  regie_id: string | null;
  client_info: { name?: string; phone?: string } | null;
  work_order_number: string | null;
  intervention_type?: 'depannage' | 'chantier' | null;
  technician?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

// Couleurs par TYPE d'intervention pour la vue mois
const TYPE_COLORS: Record<string, string> = {
  depannage: 'bg-red-500 hover:bg-red-600',
  chantier: 'bg-blue-500 hover:bg-blue-600',
};

// Fallback : couleurs par statut
const STATUS_COLORS: Record<string, string> = {
  nouveau: 'bg-blue-500 hover:bg-blue-600',
  planifie: 'bg-amber-500 hover:bg-amber-600',
  en_cours: 'bg-orange-500 hover:bg-orange-600',
  termine: 'bg-emerald-500 hover:bg-emerald-600',
  ready_to_bill: 'bg-amber-400 hover:bg-amber-500',
  billed: 'bg-violet-500 hover:bg-violet-600',
  annule: 'bg-gray-400 hover:bg-gray-500',
};

const getInterventionColor = (iv: Intervention) => {
  if (iv.intervention_type && TYPE_COLORS[iv.intervention_type]) {
    return TYPE_COLORS[iv.intervention_type];
  }
  return STATUS_COLORS[iv.status] || 'bg-gray-500 hover:bg-gray-600';
};

const VIEW_TABS: { value: CalendarView; label: string; icon: typeof CalendarDays }[] = [
  { value: 'month', label: 'Mois', icon: CalendarDays },
  { value: 'week', label: 'Semaine', icon: CalendarRange },
  { value: 'day', label: 'Jour', icon: Calendar },
];

// =============================================
// COMPONENT
// =============================================

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);

  // Detail sheet
  const [detailIntervention, setDetailIntervention] = useState<Intervention | null>(null);

  const supabase = createClient();

  // =============================================
  // DATA FETCHING
  // =============================================

  const getDateRange = useCallback(() => {
    switch (view) {
      case 'month': {
        const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
        return { start, end };
      }
      case 'week': {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 });
        const end = endOfWeek(currentDate, { weekStartsOn: 1 });
        return { start, end };
      }
      case 'day': {
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
      }
    }
  }, [view, currentDate]);

  const fetchInterventions = useCallback(async () => {
    setIsLoading(true);
    const { start, end } = getDateRange();

    // Fetch interventions
    const { data, error } = await supabase
      .from('interventions')
      .select(`
        id, title, description, address, date_planned,
        estimated_duration_minutes, status, priority,
        technician_id, regie_id, client_info, work_order_number,
        intervention_type,
        technician:users!interventions_technician_id_fkey(id, first_name, last_name)
      `)
      .gte('date_planned', start.toISOString())
      .lte('date_planned', end.toISOString())
      .order('date_planned', { ascending: true });

    if (!error && data) {
      setInterventions(data as Intervention[]);
    }

    // Fetch approved leaves for the same period
    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    const { data: leavesData } = await supabase
      .from('leave_requests')
      .select(`
        technician_id, start_date, end_date,
        technician:users!leave_requests_technician_id_fkey(first_name, last_name)
      `)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (leavesData) {
      setLeaves(leavesData as LeaveEntry[]);
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate]);

  useEffect(() => {
    fetchInterventions();
  }, [fetchInterventions]);

  // =============================================
  // NAVIGATION
  // =============================================

  const navigatePrevious = () => {
    switch (view) {
      case 'month':
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
        break;
      case 'week':
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(subDays(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case 'month':
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
        break;
      case 'week':
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const navigationTitle = useMemo(() => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: fr });
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(ws, 'd MMM', { locale: fr })} – ${format(we, 'd MMM yyyy', { locale: fr })}`;
      }
      case 'day':
        return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
    }
  }, [view, currentDate]);

  // =============================================
  // HANDLERS
  // =============================================

  const handleInterventionClick = (intervention: Intervention) => {
    setDetailIntervention(intervention);
  };

  const handleEditFromDetail = () => {
    if (detailIntervention) {
      setSelectedIntervention(detailIntervention);
      setDetailIntervention(null);
      setIsEditModalOpen(true);
    }
  };

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    fetchInterventions();
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedIntervention(null);
    fetchInterventions();
  };

  const switchToDay = (date: Date) => {
    setCurrentDate(date);
    setView('day');
  };

  // =============================================
  // MONTH VIEW HELPERS
  // =============================================

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getInterventionsForDay = (date: Date) => {
    return interventions.filter((iv) => {
      if (!iv.date_planned) return false;
      return isSameDay(new Date(iv.date_planned), date);
    });
  };

  const getLeavesForDay = (day: Date): LeaveEntry[] => {
    return leaves.filter((leave) => {
      const start = new Date(leave.start_date + 'T00:00:00');
      const end = new Date(leave.end_date + 'T23:59:59');
      return isWithinInterval(day, { start, end });
    });
  };

  const getTechnicianInitials = (tech: Intervention['technician']) => {
    if (!tech) return null;
    return ((tech.first_name?.[0] || '') + (tech.last_name?.[0] || '')).toUpperCase() || '?';
  };

  const getTypeEmoji = (iv: Intervention) => {
    if (iv.intervention_type === 'chantier') return '🏗️';
    return '🔧';
  };

  const getTechName = (tech: LeaveEntry['technician']) => {
    if (!tech) return '?';
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    return tech.first_name || tech.last_name || '?';
  };

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            Planification et vue d&apos;ensemble des interventions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
            <Filter className="w-4 h-4" />
            Filtrer
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle intervention
          </button>
        </div>
      </div>

      {/* Calendar container */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = view === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setView(tab.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            <button onClick={navigatePrevious} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goToToday} className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              Aujourd&apos;hui
            </button>
            <button onClick={navigateNext} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize ml-2">
              {navigationTitle}
            </h2>
          </div>
        </div>

        {/* View content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ========== MONTH VIEW ========== */}
              {view === 'month' && (
                <>
                  <div className="grid grid-cols-7 mb-2">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                      <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                    {calendarDays.map((day, idx) => {
                      const dayInterventions = getInterventionsForDay(day);
                      const dayLeaves = getLeavesForDay(day);
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      const isTodayDate = isToday(day);
                      const MAX_VISIBLE = 2;
                      const overflow = dayInterventions.length - MAX_VISIBLE;

                      return (
                        <div key={idx} className={`bg-white min-h-[100px] p-2 ${!isCurrentMonth ? 'bg-gray-50' : ''}`}>
                          <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${
                            isTodayDate ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                          }`}>
                            {format(day, 'd')}
                          </div>

                          {/* Congés en vue mois */}
                          {dayLeaves.map((leave, i) => (
                            <div key={`leave-${leave.technician_id}-${i}`} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 mb-0.5 truncate">
                              🌴 {getTechName(leave.technician)}
                            </div>
                          ))}

                          <div className="space-y-1">
                            {dayInterventions.slice(0, MAX_VISIBLE).map((iv) => (
                              <button
                                key={iv.id}
                                onClick={() => handleInterventionClick(iv)}
                                className={`w-full text-left text-xs px-1.5 py-1 rounded text-white transition-colors cursor-pointer ${getInterventionColor(iv)}`}
                                title={`${iv.intervention_type === 'chantier' ? '[Chantier]' : '[Dépannage]'} ${iv.title}`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px]">{getTypeEmoji(iv)}</span>
                                  {iv.technician && (
                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-bold">
                                      {getTechnicianInitials(iv.technician)}
                                    </span>
                                  )}
                                  <span className="truncate flex-1">{iv.title}</span>
                                </div>
                              </button>
                            ))}
                            {overflow > 0 && (
                              <button onClick={() => switchToDay(day)} className="w-full text-left text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors">
                                + {overflow} autre{overflow > 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ========== WEEK VIEW ========== */}
              {view === 'week' && (
                <TimeGridView
                  mode="week"
                  currentDate={currentDate}
                  interventions={interventions}
                  leaves={leaves}
                  onInterventionClick={handleInterventionClick}
                />
              )}

              {/* ========== DAY VIEW ========== */}
              {view === 'day' && (
                <TimeGridView
                  mode="day"
                  currentDate={currentDate}
                  interventions={interventions}
                  leaves={leaves}
                  onInterventionClick={handleInterventionClick}
                />
              )}
            </>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500" />
              <span className="text-gray-600">🔧 Dépannage</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-gray-600">🏗️ Chantier</span>
            </div>
            <div className="border-l border-gray-300 h-4" />
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
              <span className="text-gray-600">🌴 Congé</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-8 h-3 rounded bg-gray-100 border border-dashed border-gray-300" />
              <span className="text-gray-600">🍽️ Pause midi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-gray-500" />
              <span className="text-gray-600">= Technicien assigné</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nouvelle intervention" size="lg">
        <InterventionForm onSuccess={handleCreateSuccess} onCancel={() => setIsCreateModalOpen(false)} />
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }} title="Modifier l'intervention" size="lg">
        {selectedIntervention && (
          <InterventionForm
            intervention={selectedIntervention}
            onSuccess={handleEditSuccess}
            onCancel={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }}
            onDelete={() => { setIsEditModalOpen(false); setSelectedIntervention(null); }}
          />
        )}
      </Modal>

      <InterventionDetailSheet
        intervention={detailIntervention}
        onClose={() => setDetailIntervention(null)}
        onEdit={handleEditFromDetail}
      />
    </div>
  );
}