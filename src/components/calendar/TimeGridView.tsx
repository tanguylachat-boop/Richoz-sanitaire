'use client';

import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';

const START_HOUR = 7;
const END_HOUR = 18;
const HOUR_HEIGHT = 64; // px per hour
const TOTAL_HOURS = END_HOUR - START_HOUR;
const GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

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
  onInterventionClick: (intervention: Intervention) => void;
}

export function TimeGridView({ mode, currentDate, interventions, onInterventionClick }: TimeGridViewProps) {
  // Compute columns (days)
  const days = useMemo(() => {
    if (mode === 'day') return [currentDate];
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [mode, currentDate]);

  // Get interventions for a given day
  const getInterventionsForDay = (day: Date) => {
    return interventions.filter((iv) => {
      if (!iv.date_planned) return false;
      return isSameDay(new Date(iv.date_planned), day);
    });
  };

  // Position an intervention block
  const getBlockStyle = (iv: Intervention) => {
    if (!iv.date_planned) return { top: 0, height: 30 };
    const d = new Date(iv.date_planned);
    const hours = d.getHours();
    const minutes = d.getMinutes();

    // Clamp to visible range
    const startMinutes = Math.max((hours - START_HOUR) * 60 + minutes, 0);
    const durationMin = Math.max(iv.estimated_duration_minutes || 30, 20);
    const endMinutes = Math.min(startMinutes + durationMin, TOTAL_HOURS * 60);

    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);

    return { top, height };
  };

  const getTechInitials = (tech: Intervention['technician']) => {
    if (!tech) return null;
    return ((tech.first_name?.[0] || '') + (tech.last_name?.[0] || '')).toUpperCase() || '?';
  };

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="overflow-auto max-h-[calc(100vh-320px)]">
      <div className="flex min-w-[600px]">
        {/* Hour labels column */}
        <div className="flex-shrink-0 w-16 border-r border-gray-200">
          <div className="h-10 border-b border-gray-200" /> {/* Spacer for day headers */}
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

        {/* Day columns */}
        <div
          className="flex-1 grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, colIdx) => {
            const dayInterventions = getInterventionsForDay(day);
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

                  {/* Now indicator */}
                  {today && (() => {
                    const now = new Date();
                    const nowMin = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                    if (nowMin < 0 || nowMin > TOTAL_HOURS * 60) return null;
                    const top = (nowMin / 60) * HOUR_HEIGHT;
                    return (
                      <div
                        className="absolute left-0 right-0 z-10 pointer-events-none"
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
                    const color = statusColors[iv.status] || 'bg-gray-500 border-gray-600';
                    const startTime = iv.date_planned ? format(new Date(iv.date_planned), 'HH:mm') : '';
                    const endTime = iv.date_planned
                      ? format(addMinutes(new Date(iv.date_planned), iv.estimated_duration_minutes || 30), 'HH:mm')
                      : '';
                    const initials = getTechInitials(iv.technician);

                    return (
                      <button
                        key={iv.id}
                        onClick={() => onInterventionClick(iv)}
                        className={`absolute left-1 right-1 rounded-lg border-l-[3px] text-left text-white text-xs cursor-pointer transition-opacity hover:opacity-90 overflow-hidden ${color}`}
                        style={{ top, height: Math.max(height, 24) }}
                        title={iv.title}
                      >
                        <div className="px-2 py-1 h-full flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold truncate">{iv.title}</span>
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
  );
}
