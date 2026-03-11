'use client';

import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addMinutes, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';

const START_HOUR = 7;
const END_HOUR = 18;
const HOUR_HEIGHT = 64; // px per hour
const TOTAL_HOURS = END_HOUR - START_HOUR;
const GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

// Pause midi : 12h00 - 13h30
const LUNCH_START_HOUR = 12;
const LUNCH_START_MIN = 0;
const LUNCH_END_HOUR = 13;
const LUNCH_END_MIN = 30;

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

export interface LeaveEntry {
  technician_id: string;
  start_date: string;
  end_date: string;
  technician?: { first_name: string | null; last_name: string | null } | null;
}

export interface BirthdayEntry {
  user_id: string;
  first_name: string;
  last_name: string;
  date: string; // 'YYYY-MM-DD' in current year
}

// Couleurs par TYPE d'intervention (dépannage vs chantier)
const typeColors: Record<string, { bg: string; border: string; label: string }> = {
  depannage: { bg: 'bg-red-500', border: 'border-red-700', label: 'Dépannage' },
  chantier: { bg: 'bg-blue-500', border: 'border-blue-700', label: 'Chantier' },
};

// Couleur par défaut (si pas de type défini) = par statut
const statusColors: Record<string, string> = {
  nouveau: 'bg-blue-500 border-blue-600',
  planifie: 'bg-amber-500 border-amber-600',
  en_cours: 'bg-orange-500 border-orange-600',
  termine: 'bg-emerald-500 border-emerald-600',
  ready_to_bill: 'bg-amber-400 border-amber-500',
  billed: 'bg-violet-500 border-violet-600',
  annule: 'bg-gray-400 border-gray-500',
};

interface TimeGridViewProps {
  mode: 'week' | 'day';
  currentDate: Date;
  interventions: Intervention[];
  leaves?: LeaveEntry[];
  birthdays?: BirthdayEntry[];
  onInterventionClick: (intervention: Intervention) => void;
}

export function TimeGridView({ mode, currentDate, interventions, leaves = [], birthdays = [], onInterventionClick }: TimeGridViewProps) {
  const days = useMemo(() => {
    if (mode === 'day') return [currentDate];
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [mode, currentDate]);

  const getInterventionsForDay = (day: Date) => {
    return interventions.filter((iv) => {
      if (!iv.date_planned) return false;
      return isSameDay(new Date(iv.date_planned), day);
    });
  };

  // Congés pour un jour donné
  const getLeavesForDay = (day: Date): LeaveEntry[] => {
    return leaves.filter((leave) => {
      const start = new Date(leave.start_date + 'T00:00:00');
      const end = new Date(leave.end_date + 'T23:59:59');
      return isWithinInterval(day, { start, end });
    });
  };

  // Anniversaires pour un jour donné
  const getBirthdaysForDay = (day: Date): BirthdayEntry[] => {
    return birthdays.filter((b) => isSameDay(new Date(b.date + 'T00:00:00'), day));
  };

  const getBlockStyle = (iv: Intervention) => {
    if (!iv.date_planned) return { top: 0, height: 30 };
    const d = new Date(iv.date_planned);
    const hours = d.getHours();
    const minutes = d.getMinutes();

    const startMinutes = Math.max((hours - START_HOUR) * 60 + minutes, 0);
    const durationMin = Math.max(iv.estimated_duration_minutes || 30, 20);
    const endMinutes = Math.min(startMinutes + durationMin, TOTAL_HOURS * 60);

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);

    return { top, height };
  };

  const getBlockColor = (iv: Intervention) => {
    const type = iv.intervention_type;
    if (type && typeColors[type]) {
      return `${typeColors[type].bg} ${typeColors[type].border}`;
    }
    return statusColors[iv.status] || 'bg-gray-500 border-gray-600';
  };

  const getTechInitials = (tech: Intervention['technician']) => {
    if (!tech) return null;
    return ((tech.first_name?.[0] || '') + (tech.last_name?.[0] || '')).toUpperCase() || '?';
  };

  const getTechName = (tech: LeaveEntry['technician']) => {
    if (!tech) return '?';
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    return tech.first_name || tech.last_name || '?';
  };

  // Calcul position pause midi
  const lunchTop = ((LUNCH_START_HOUR - START_HOUR) * 60 + LUNCH_START_MIN) / 60 * HOUR_HEIGHT;
  const lunchDuration = (LUNCH_END_HOUR - LUNCH_START_HOUR) * 60 + LUNCH_END_MIN - LUNCH_START_MIN;
  const lunchHeight = (lunchDuration / 60) * HOUR_HEIGHT;

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Check if any day has all-day items
  const hasAnyAllDay = days.some((day) => getLeavesForDay(day).length > 0 || getBirthdaysForDay(day).length > 0);
  const ALL_DAY_HEIGHT = 26;

  return (
    <div className="flex flex-col max-h-[calc(100vh-320px)]">
      {/* ====== FIXED HEADER: Day names + All-day section ====== */}
      <div className="flex min-w-[600px] flex-shrink-0">
        {/* Hour labels spacer */}
        <div className="flex-shrink-0 w-16 border-r border-gray-200">
          <div className="h-10 border-b border-gray-200" />
          {hasAnyAllDay && (
            <div className="border-b border-gray-200 flex items-center justify-end pr-2" style={{ height: ALL_DAY_HEIGHT }}>
              <span className="text-[9px] text-gray-400 uppercase">Journée</span>
            </div>
          )}
        </div>

        {/* Day headers + all-day row */}
        <div
          className="flex-1 grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, colIdx) => {
            const dayLeaves = getLeavesForDay(day);
            const dayBirthdays = getBirthdaysForDay(day);
            const today = isToday(day);

            return (
              <div key={colIdx} className="border-r border-gray-100 last:border-r-0">
                {/* Day header */}
                <div
                  className={`h-10 flex items-center justify-center border-b border-gray-200 text-sm font-medium ${
                    today ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className={today ? 'text-blue-600' : 'text-gray-600'}>
                    {mode === 'week'
                      ? format(day, 'EEE d', { locale: fr })
                      : format(day, 'EEEE d MMMM', { locale: fr })}
                  </span>
                  {today && (
                    <span className="ml-1.5 w-2 h-2 rounded-full bg-blue-600 inline-block" />
                  )}
                </div>

                {/* All-day row (fixed height) */}
                {hasAnyAllDay && (
                  <div
                    className="border-b border-gray-200 flex items-center gap-1 px-1 overflow-hidden"
                    style={{ height: ALL_DAY_HEIGHT }}
                  >
                    {dayBirthdays.map((b) => (
                      <span
                        key={`b-${b.user_id}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-medium whitespace-nowrap"
                      >
                        🎂 {b.first_name}
                      </span>
                    ))}
                    {dayLeaves.map((leave, i) => (
                      <span
                        key={`l-${leave.technician_id}-${i}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-medium whitespace-nowrap"
                      >
                        🌴 {getTechName(leave.technician)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ====== SCROLLABLE TIME GRID ====== */}
      <div className="overflow-auto flex-1 min-h-0">
        <div className="flex min-w-[600px]">
          {/* Hour labels column */}
          <div className="flex-shrink-0 w-16 border-r border-gray-200">
            <div className="relative" style={{ height: GRID_HEIGHT }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full text-right pr-2 text-xs text-gray-400 font-medium -translate-y-1/2"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, hour), 'HH:mm')}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns - time grid only */}
          <div
            className="flex-1 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day, colIdx) => {
              const dayInterventions = getInterventionsForDay(day);
              const today = isToday(day);

              return (
                <div key={colIdx} className="border-r border-gray-100 last:border-r-0">
                  {/* Time grid for this day */}
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {/* Hour lines */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-gray-100"
                        style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                      />
                    ))}

                    {/* ====== PAUSE MIDI 12h-13h30 ====== */}
                    <div
                      className="absolute left-0 right-0 z-[1] pointer-events-none"
                      style={{ top: lunchTop, height: lunchHeight }}
                    >
                      <div className="w-full h-full bg-gray-100 border-y border-gray-200 border-dashed flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-400 select-none">
                          🍽️ Pause midi
                        </span>
                      </div>
                    </div>

                    {/* Now indicator */}
                    {today && (() => {
                      const now = new Date();
                      const nowMin = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                      if (nowMin < 0 || nowMin > TOTAL_HOURS * 60) return null;
                      const top = (nowMin / 60) * HOUR_HEIGHT;
                      return (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top }}
                        >
                          <div className="flex items-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-px bg-red-500" />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Intervention blocks */}
                    {dayInterventions.map((iv) => {
                      const { top, height } = getBlockStyle(iv);
                      const color = getBlockColor(iv);
                      const startTime = iv.date_planned ? format(new Date(iv.date_planned), 'HH:mm') : '';
                      const endTime = iv.date_planned
                        ? format(addMinutes(new Date(iv.date_planned), iv.estimated_duration_minutes || 30), 'HH:mm')
                        : '';
                      const initials = getTechInitials(iv.technician);
                      const typeLabel = iv.intervention_type === 'chantier' ? '🏗️' : '🔧';
                      const displayLabel = iv.work_order_number || iv.title;

                      return (
                        <button
                          key={iv.id}
                          onClick={() => onInterventionClick(iv)}
                          className={`absolute left-1 right-1 rounded-lg border-l-[3px] text-left text-white text-xs cursor-pointer transition-opacity hover:opacity-90 overflow-hidden z-[5] ${color}`}
                          style={{ top, height: Math.max(height, 24) }}
                          title={`${iv.intervention_type === 'chantier' ? '[Chantier]' : '[Dépannage]'} ${displayLabel}`}
                        >
                          <div className="px-2 py-1 h-full flex flex-col">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px]">{typeLabel}</span>
                              <span className="font-semibold truncate">{displayLabel}</span>
                            </div>
                            {height >= 40 && (
                              <span className="text-white/80 text-[10px]">
                                {startTime} – {endTime}
                              </span>
                            )}
                            {height >= 56 && initials && (
                              <span className="text-white/70 text-[10px] mt-auto">
                                👤 {initials}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}