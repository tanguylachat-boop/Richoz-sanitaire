'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, addDays, isSameDay, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { INTERVENTION_STATUS } from '@/lib/constants';
import type { InterventionWithRelations } from '@/types/database';
import { MapPin, Clock, Building } from 'lucide-react';

interface WeekCalendarProps {
  interventions: InterventionWithRelations[];
  weekStart: Date;
  readOnly?: boolean;
}

export function WeekCalendar({
  interventions,
  weekStart,
  readOnly = false,
}: WeekCalendarProps) {
  // Generate days of the week
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Group interventions by day
  const interventionsByDay = useMemo(() => {
    const grouped: Record<string, InterventionWithRelations[]> = {};

    days.forEach((day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      grouped[dayKey] = interventions.filter((intervention) => {
        if (!intervention.date_planned) return false;
        return isSameDay(new Date(intervention.date_planned), day);
      });
    });

    return grouped;
  }, [days, interventions]);

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayInterventions = interventionsByDay[dayKey] || [];
        const isCurrentDay = isToday(day);

        return (
          <div
            key={dayKey}
            className={cn(
              'bg-white rounded-xl border overflow-hidden',
              isCurrentDay ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'
            )}
          >
            {/* Day header */}
            <div
              className={cn(
                'px-4 py-3 border-b',
                isCurrentDay
                  ? 'bg-blue-50 border-blue-100'
                  : 'bg-gray-50 border-gray-100'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'text-sm font-medium capitalize',
                      isCurrentDay ? 'text-blue-700' : 'text-gray-600'
                    )}
                  >
                    {format(day, 'EEEE', { locale: fr })}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-sm font-semibold',
                      isCurrentDay
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                {dayInterventions.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {dayInterventions.length} intervention
                    {dayInterventions.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Day content */}
            <div className="p-2">
              {dayInterventions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Aucune intervention
                </p>
              ) : (
                <div className="space-y-2">
                  {dayInterventions.map((intervention) => {
                    const statusInfo = INTERVENTION_STATUS[intervention.status];

                    return (
                      <Link
                        key={intervention.id}
                        href={
                          readOnly
                            ? `/interventions/${intervention.id}`
                            : `/technician/report/${intervention.id}`
                        }
                        className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        {/* Time and status */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {intervention.date_planned
                                ? format(new Date(intervention.date_planned), 'HH:mm')
                                : '--:--'}
                            </span>
                            {intervention.estimated_duration_minutes && (
                              <span className="text-gray-400">
                                ({intervention.estimated_duration_minutes} min)
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              statusInfo.color
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="font-medium text-gray-900 mb-1 line-clamp-1">
                          {intervention.title}
                        </h4>

                        {/* Details */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          {intervention.regie && (
                            <div className="flex items-center gap-1">
                              <Building className="w-3.5 h-3.5" />
                              <span>{intervention.regie.name}</span>
                            </div>
                          )}
                          {intervention.address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[150px]">
                                {intervention.address}
                              </span>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
