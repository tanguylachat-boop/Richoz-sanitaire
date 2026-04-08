'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ChevronLeft,
  MapPin,
  Phone,
  Clock,
  Building2,
  Navigation,
  Loader2,
  KeyRound,
  Droplets,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ReportForm } from '@/components/reports/ReportForm';
import { format, addMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Intervention, Report, Product, Regie } from '@/types/database';

type InterventionWithDetails = Intervention & {
  regie?: Regie | null;
  reports?: Report[] | null;
};

interface CutoffReminder {
  id: string;
  reminder_date: string;
  message: string;
  reminder_type: string | null;
}

export default function TechnicianReportPage() {
  const router = useRouter();
  const params = useParams();
  const interventionId = params.interventionId as string;

  const [intervention, setIntervention] = useState<InterventionWithDetails | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cutoffs, setCutoffs] = useState<CutoffReminder[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      // Fetch intervention
      const { data: interventionData, error: intError } = await supabase
        .from('interventions')
        .select(`
          *,
          regie:regies(id, name, keyword),
          reports(*)
        `)
        .eq('id', interventionId)
        .single();

      if (intError || !interventionData) {
        setError('Intervention non trouvée');
        setIsLoading(false);
        return;
      }

      setIntervention(interventionData as InterventionWithDetails);

      // Fetch cutoff notices for this intervention (water cutoff reminders set by admin)
      const { data: cutoffData } = await supabase
        .from('intervention_reminders')
        .select('id, reminder_date, message, reminder_type')
        .eq('intervention_id', interventionId)
        .eq('reminder_type', 'cutoff')
        .order('reminder_date', { ascending: true });
      setCutoffs((cutoffData as CutoffReminder[]) || []);

      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name');

      setProducts(productsData || []);
      setIsLoading(false);
    };

    fetchData();
  }, [interventionId, router, supabase]);

  const openGoogleMaps = (address: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const callPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error || !intervention) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error || 'Erreur'}</p>
          <button
            onClick={() => router.push('/technician/today')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  const existingReport = intervention.reports?.[0] || null;
  const startTime = intervention.date_planned ? new Date(intervention.date_planned) : null;
  const endTime = startTime ? addMinutes(startTime, intervention.estimated_duration_minutes || 60) : null;
  const clientInfo = intervention.client_info as { name?: string; phone?: string } | null;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header with intervention details */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-5 pt-4 pb-6 rounded-b-3xl shadow-lg">
        {/* Back button */}
        <button
          onClick={() => router.push('/technician/today')}
          className="flex items-center gap-1 text-emerald-100 mb-4 active:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Retour</span>
        </button>

        {/* Title + Work Order Number */}
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-xl font-bold">{intervention.title}</h1>
          {intervention.work_order_number && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/20 backdrop-blur-sm border border-white/30">
              Bon #{intervention.work_order_number}
            </span>
          )}
        </div>
        
        {/* Time */}
        <div className="flex items-center gap-2 text-emerald-100 mb-3">
          <Clock className="w-4 h-4" />
          <span>
            {startTime ? format(startTime, "EEEE d MMMM 'à' HH:mm", { locale: fr }) : 'Non planifié'}
            {endTime && ` - ${format(endTime, 'HH:mm')}`}
          </span>
        </div>

        {/* Régie */}
        {intervention.regie && (
          <div className="flex items-center gap-2 text-emerald-100 mb-4">
            <Building2 className="w-4 h-4" />
            <span>{intervention.regie.name}</span>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-2">
          {intervention.address && (
            <button
              onClick={() => openGoogleMaps(intervention.address)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl active:bg-white/30"
            >
              <Navigation className="w-4 h-4" />
              <span className="text-sm font-medium">Itinéraire</span>
            </button>
          )}
          {clientInfo?.phone && (
            <button
              onClick={() => callPhone(clientInfo.phone!)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/20 backdrop-blur-sm rounded-xl active:bg-white/30"
            >
              <Phone className="w-4 h-4" />
              <span className="text-sm font-medium">Appeler</span>
            </button>
          )}
        </div>
      </div>

      {/* Intervention details card */}
      <div className="px-4 -mt-4 mb-4">
        <div className="bg-white rounded-2xl shadow-sm p-4">
          {/* Address */}
          {intervention.address && (
            <button
              onClick={() => openGoogleMaps(intervention.address)}
              className="flex items-start gap-3 w-full text-left mb-3 pb-3 border-b border-gray-100"
            >
              <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Adresse</p>
                <p className="text-gray-900">{intervention.address}</p>
              </div>
            </button>
          )}

          {/* Clés & Accès */}
          {intervention.keys_info && (
            <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-100">
              <KeyRound className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Clés & Accès</p>
                <p className="text-gray-900 font-medium">{intervention.keys_info}</p>
              </div>
            </div>
          )}

          {/* Client */}
          {clientInfo?.name && (
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Client</p>
                <p className="text-gray-900">{clientInfo.name}</p>
                {clientInfo.phone && (
                  <button
                    onClick={() => callPhone(clientInfo.phone!)}
                    className="text-emerald-600 text-sm font-medium mt-1"
                  >
                    {clientInfo.phone}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {intervention.description && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Description</p>
              <p className="text-gray-700 text-sm">{intervention.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Avis de coupure (set by admin/secretary) */}
      {cutoffs.length > 0 && (
        <div className="px-4 mb-4 space-y-3">
          {cutoffs.map((cutoff) => (
            <div
              key={cutoff.id}
              className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Droplets className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900">Avis de coupure d&apos;eau</p>
                  <p className="text-sm text-blue-700 mt-0.5">
                    Prévue le{' '}
                    <strong>
                      {format(new Date(cutoff.reminder_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                    </strong>
                  </p>
                  {cutoff.message && cutoff.message !== 'Avis de coupure d eau' && (
                    <p className="text-sm text-blue-600 mt-1">{cutoff.message}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Form */}
      <div className="px-4">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Rapport d&apos;intervention</h2>
        {userId && (
          <ReportForm
            intervention={intervention}
            existingReport={existingReport}
            products={products}
            technicianId={userId}
          />
        )}
      </div>
    </div>
  );
}
