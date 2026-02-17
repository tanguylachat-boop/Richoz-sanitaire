'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Filter, ChevronLeft, ChevronRight, User, CalendarDays, CalendarRange, Calendar } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { InterventionForm } from '@/components/interventions/InterventionForm';
import { InterventionDetailSheet } from '@/components/calendar/InterventionDetailSheet';
import { TimeGridView } from '@/components/calendar/TimeGridView';
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
  technician?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  nouveau: 'bg-blue-500 hover:bg-blue-600',
  planifie: 'bg-amber-500 hover:bg-amber-600',
  en_cours: 'bg-orange-500 hover:bg-orange-600',
  termine: 'bg-emerald-500 hover:bg-emerald-600',
  ready_to_bill: 'bg-amber-400 hover:bg-amber-500',
  billed: 'bg-violet-500 hover:bg-violet-600',
  annule: 'bg-gray-400 hover:bg-gray-500',
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
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interventions, setInterventions] = useState<Intervention[]>([]);
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

    const { data, error } = await supabase
      .from('interventions')
      .select(`
        id, title, description, address, date_planned,
        estimated_duration_minutes, status, priority,
        technician_id, regie_id, client_info, work_order_number,
        technician:users!interventions_technician_id_fkey(id, first_name, last_name)
      `)
      .gte('date_planned', start.toISOString())
      .lte('date_planned', end.toISOString())
      .order('date_planned', { ascending: true });

    if (!error && data) {
      setInterventions(data as Intervention[]);
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

  const getTechnicianInitials = (tech: Intervention['technician']) => {
    if (!tech) return null;
    return ((tech.first_name?.[0] || '') + (tech.last_name?.[0] || '')).toUpperCase() || '?';
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
        {/* Toolbar: View Tabs + Navigation */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* View Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = view === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setView(tab.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={navigatePrevious}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={navigateNext}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
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
                  {/* Day labels */}
                  <div className="grid grid-cols-7 mb-2">
                    {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                      <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                    {calendarDays.map((day, idx) => {
                      const dayInterventions = getInterventionsForDay(day);
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      const isTodayDate = isToday(day);
                      const MAX_VISIBLE = 2;
                      const overflow = dayInterventions.length - MAX_VISIBLE;

                      return (
                        <div
                          key={idx}
                          className={`bg-white min-h-[100px] p-2 ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
                        >
                          {/* Day number */}
                          <div
                            className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full ${
                              isTodayDate
                                ? 'bg-blue-600 text-white'
                                : isCurrentMonth
                                ? 'text-gray-900'
                                : 'text-gray-400'
                            }`}
                          >
                            {format(day, 'd')}
                          </div>

                          {/* Interventions (max 2) */}
                          <div className="space-y-1">
                            {dayInterventions.slice(0, MAX_VISIBLE).map((iv) => (
                              <button
                                key={iv.id}
                                onClick={() => handleInterventionClick(iv)}
                                className={`w-full text-left text-xs px-1.5 py-1 rounded text-white transition-colors cursor-pointer ${
                                  STATUS_COLORS[iv.status] || 'bg-gray-500 hover:bg-gray-600'
                                }`}
                                title={`${iv.title}${iv.technician ? ` - ${iv.technician.first_name || ''} ${iv.technician.last_name || ''}`.trim() : ''}`}
                              >
                                <div className="flex items-center gap-1">
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
                              <button
                                onClick={() => switchToDay(day)}
                                className="w-full text-left text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 hover:bg-blue-50 rounded transition-colors"
                              >
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
                  onInterventionClick={handleInterventionClick}
                />
              )}

              {/* ========== DAY VIEW ========== */}
              {view === 'day' && (
                <TimeGridView
                  mode="day"
                  currentDate={currentDate}
                  interventions={interventions}
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
              <span className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-gray-600">Nouveau</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500" />
              <span className="text-gray-600">Planifié</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" />
              <span className="text-gray-600">En cours</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span className="text-gray-600">Terminé</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-500" />
              <span className="text-gray-600">Facturé</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-gray-500" />
              <span className="text-gray-600">= Technicien assigné</span>
            </div>
          </div>
        </div>
      </div>

      {/* =============================================
          MODALS & PANELS
          ============================================= */}

      {/* Modal Nouvelle Intervention */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Nouvelle intervention"
        size="lg"
      >
        <InterventionForm
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Modal Modifier Intervention */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedIntervention(null);
        }}
        title="Modifier l'intervention"
        size="lg"
      >
        {selectedIntervention && (
          <InterventionForm
            intervention={selectedIntervention}
            onSuccess={handleEditSuccess}
            onCancel={() => {
              setIsEditModalOpen(false);
              setSelectedIntervention(null);
            }}
            onDelete={() => {
              setIsEditModalOpen(false);
              setSelectedIntervention(null);
            }}
          />
        )}
      </Modal>

      {/* Detail Sheet */}
      <InterventionDetailSheet
        intervention={detailIntervention}
        onClose={() => setDetailIntervention(null)}
        onEdit={handleEditFromDetail}
      />
    </div>
  );
}
