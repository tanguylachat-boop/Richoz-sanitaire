'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  MapPin, 
  Clock, 
  ChevronRight, 
  Sun, 
  Coffee,
  Navigation,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format, isToday, addMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Intervention {
  id: string;
  title: string;
  description: string | null;
  address: string;
  date_planned: string | null;
  estimated_duration_minutes: number;
  status: string;
  priority: number;
  client_info: { name?: string; phone?: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  nouveau: { label: 'Nouveau', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  planifie: { label: 'Planifié', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  en_cours: { label: 'En cours', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  termine: { label: 'Terminé', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  facture: { label: 'Facturé', color: 'text-violet-700', bgColor: 'bg-violet-100' },
  annule: { label: 'Annulé', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

export default function TechnicianTodayPage() {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const supabase = createClient();

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today's interventions
  const fetchInterventions = async () => {
    setIsLoading(true);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    const { data, error } = await supabase
      .from('interventions')
      .select('id, title, description, address, date_planned, estimated_duration_minutes, status, priority, client_info')
      .gte('date_planned', startOfDay)
      .lte('date_planned', endOfDay)
      .neq('status', 'annule')
      .order('date_planned', { ascending: true });

    if (!error && data) {
      setInterventions(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInterventions();
  }, []);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return { text: 'Bonjour', icon: Coffee };
    if (hour < 18) return { text: 'Bon après-midi', icon: Sun };
    return { text: 'Bonsoir', icon: Sun };
  };

  const greeting = getGreeting();
  const completedCount = interventions.filter(i => i.status === 'termine' || i.status === 'ready_to_bill' || i.status === 'billed').length;
  const pendingCount = interventions.filter(i => i.status !== 'termine' && i.status !== 'ready_to_bill' && i.status !== 'billed').length;

  // Open Google Maps
  const openGoogleMaps = (address: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Call phone
  const callPhone = (phone: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `tel:${phone}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header - Style mobile natif */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-5 pt-6 pb-8 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <greeting.icon className="w-6 h-6 text-blue-200" />
          <span className="text-blue-100 font-medium">{greeting.text}</span>
        </div>
        
        <h1 className="text-2xl font-bold mb-1">Mes interventions</h1>
        <p className="text-blue-100 capitalize">
          {format(currentTime, "EEEE d MMMM", { locale: fr })}
        </p>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-5">
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-3xl font-bold">{pendingCount}</p>
            <p className="text-sm text-blue-100">À faire</p>
          </div>
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-3xl font-bold">{completedCount}</p>
            <p className="text-sm text-blue-100">Terminées</p>
          </div>
          <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-3xl font-bold">{format(currentTime, 'HH:mm')}</p>
            <p className="text-sm text-blue-100">Heure</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 -mt-4">
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : interventions.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Aucune intervention
            </h2>
            <p className="text-gray-500 text-lg">
              Bonne journée ! ☀️
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Profitez bien de votre temps libre
            </p>
          </div>
        ) : (
          /* Interventions List */
          <div className="space-y-3">
            {interventions.map((intervention, index) => {
              const status = STATUS_CONFIG[intervention.status] || STATUS_CONFIG.nouveau;
              const startTime = intervention.date_planned ? new Date(intervention.date_planned) : null;
              const endTime = startTime ? addMinutes(startTime, intervention.estimated_duration_minutes || 60) : null;
              const isCompleted = intervention.status === 'termine' || intervention.status === 'ready_to_bill' || intervention.status === 'billed';
              const isUrgent = intervention.priority > 0;

              return (
                <Link
                  key={intervention.id}
                  href={`/technician/report/${intervention.id}`}
                  className={`block bg-white rounded-2xl shadow-sm overflow-hidden transition-all active:scale-[0.98] ${
                    isCompleted ? 'opacity-60' : ''
                  }`}
                >
                  {/* Urgence indicator */}
                  {isUrgent && (
                    <div className="bg-red-500 text-white text-xs font-bold px-4 py-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {intervention.priority === 2 ? 'URGENCE ABSOLUE' : 'URGENT'}
                    </div>
                  )}

                  <div className="p-4">
                    {/* Time & Status Row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <span className="text-lg font-bold text-gray-900">
                          {startTime ? format(startTime, 'HH:mm') : '--:--'}
                          {endTime && (
                            <span className="text-gray-400 font-normal">
                              {' - '}{format(endTime, 'HH:mm')}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status.bgColor} ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {intervention.title}
                    </h3>

                    {/* Address with Maps link */}
                    {intervention.address && (
                      <button
                        onClick={(e) => openGoogleMaps(intervention.address, e)}
                        className="flex items-start gap-2 text-left mb-3 group"
                      >
                        <MapPin className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 group-active:text-blue-600 underline-offset-2 group-active:underline">
                          {intervention.address}
                        </span>
                        <Navigation className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      </button>
                    )}

                    {/* Client info */}
                    {intervention.client_info?.name && (
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className="font-medium">{intervention.client_info.name}</span>
                        </div>
                        {intervention.client_info?.phone && (
                          <button
                            onClick={(e) => callPhone(intervention.client_info!.phone!, e)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium active:bg-emerald-200"
                          >
                            <Phone className="w-4 h-4" />
                            Appeler
                          </button>
                        )}
                      </div>
                    )}

                    {/* Arrow indicator */}
                    <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-100">
                      <span className="text-sm text-blue-600 font-medium flex items-center gap-1">
                        {isCompleted ? 'Voir le rapport' : 'Faire le rapport'}
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Refresh hint */}
        {!isLoading && interventions.length > 0 && (
          <p className="text-center text-gray-400 text-sm mt-6">
            Tirez vers le bas pour actualiser
          </p>
        )}
      </div>
    </div>
  );
}
