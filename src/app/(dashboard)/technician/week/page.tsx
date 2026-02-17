'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Clock,
  ChevronDown,
  Loader2,
  Calendar
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  addWeeks, 
  addDays, 
  isToday, 
  isSameDay,
  addMinutes
} from 'date-fns';
import { fr } from 'date-fns/locale';

interface Intervention {
  id: string;
  title: string;
  address: string;
  date_planned: string | null;
  estimated_duration_minutes: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  nouveau: 'bg-blue-500',
  planifie: 'bg-amber-500',
  en_cours: 'bg-orange-500',
  termine: 'bg-emerald-500',
  facture: 'bg-violet-500',
  annule: 'bg-gray-400',
};

export default function TechnicianWeekPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const supabase = createClient();

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  // Fetch week's interventions
  const fetchInterventions = async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from('interventions')
      .select('id, title, address, date_planned, estimated_duration_minutes, status')
      .gte('date_planned', currentWeekStart.toISOString())
      .lte('date_planned', weekEnd.toISOString())
      .neq('status', 'annule')
      .order('date_planned', { ascending: true });

    if (!error && data) {
      setInterventions(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInterventions();
  }, [currentWeekStart]);

  // Group interventions by day
  const getInterventionsForDay = (day: Date) => {
    return interventions.filter(intervention => {
      if (!intervention.date_planned) return false;
      return isSameDay(new Date(intervention.date_planned), day);
    });
  };

  const navigateWeek = (direction: number) => {
    setCurrentWeekStart(prev => addWeeks(prev, direction));
    setExpandedDay(null);
  };

  const goToThisWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setExpandedDay(null);
  };

  const isCurrentWeek = isSameDay(
    currentWeekStart,
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white px-5 pt-6 pb-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-6 h-6 text-indigo-200" />
          <span className="text-indigo-100 font-medium">Vue semaine</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Ma semaine</h1>
        <p className="text-indigo-100">
          {format(currentWeekStart, 'd MMM', { locale: fr })} - {format(weekEnd, 'd MMM yyyy', { locale: fr })}
        </p>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 bg-white/20 rounded-xl active:bg-white/30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          {!isCurrentWeek && (
            <button
              onClick={goToThisWeek}
              className="px-4 py-2 bg-white/20 rounded-xl text-sm font-medium active:bg-white/30"
            >
              Cette semaine
            </button>
          )}
          
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 bg-white/20 rounded-xl active:bg-white/30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 -mt-4">
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {days.map((day) => {
              const dayInterventions = getInterventionsForDay(day);
              const dayKey = format(day, 'yyyy-MM-dd');
              const isExpanded = expandedDay === dayKey;
              const dayIsToday = isToday(day);
              const hasInterventions = dayInterventions.length > 0;

              return (
                <div key={dayKey} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Day Header */}
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : dayKey)}
                    className={`w-full flex items-center justify-between p-4 transition-colors ${
                      dayIsToday ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Day number circle */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                          dayIsToday
                            ? 'bg-blue-600 text-white'
                            : hasInterventions
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-gray-50 text-gray-400'
                        }`}
                      >
                        {format(day, 'd')}
                      </div>
                      <div className="text-left">
                        <p className={`font-semibold capitalize ${dayIsToday ? 'text-blue-600' : 'text-gray-900'}`}>
                          {format(day, 'EEEE', { locale: fr })}
                        </p>
                        <p className="text-sm text-gray-500">
                          {hasInterventions 
                            ? `${dayInterventions.length} intervention${dayInterventions.length > 1 ? 's' : ''}`
                            : 'Libre'
                          }
                        </p>
                      </div>
                    </div>
                    
                    {hasInterventions && (
                      <ChevronDown 
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                      />
                    )}
                  </button>

                  {/* Expanded Interventions */}
                  {isExpanded && hasInterventions && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                      {dayInterventions.map((intervention) => {
                        const startTime = intervention.date_planned 
                          ? new Date(intervention.date_planned) 
                          : null;
                        const endTime = startTime 
                          ? addMinutes(startTime, intervention.estimated_duration_minutes || 60) 
                          : null;
                        const statusColor = STATUS_COLORS[intervention.status] || STATUS_COLORS.nouveau;

                        return (
                          <Link
                            key={intervention.id}
                            href={`/technician/report/${intervention.id}`}
                            className="flex items-start gap-3 p-4 active:bg-gray-50"
                          >
                            {/* Status indicator */}
                            <div className={`w-1 h-12 rounded-full ${statusColor} flex-shrink-0`} />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>
                                  {startTime ? format(startTime, 'HH:mm') : '--:--'}
                                  {endTime && ` - ${format(endTime, 'HH:mm')}`}
                                </span>
                              </div>
                              <p className="font-medium text-gray-900 truncate">
                                {intervention.title}
                              </p>
                              {intervention.address && (
                                <p className="text-sm text-gray-500 truncate flex items-center gap-1 mt-1">
                                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                  {intervention.address}
                                </p>
                              )}
                            </div>

                            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
