'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HardHat,
  MapPin,
  ChevronRight,
  Loader2,
  Building2,
  BarChart3,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ChantierIntervention {
  id: string;
  title: string;
  address: string;
  date_planned: string | null;
  status: string;
  regie?: { id: string; name: string } | null;
  chantier_details?: {
    id: string;
    progress_percent: number;
  }[] | null;
}

export default function ChantierListPage() {
  const [chantiers, setChantiers] = useState<ChantierIntervention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchChantiers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('interventions')
        .select(`
          id, title, address, date_planned, status,
          regie:regies(id, name),
          chantier_details(id, progress_percent)
        `)
        .eq('technician_id', user.id)
        .eq('intervention_type', 'chantier')
        .not('status', 'eq', 'annule')
        .order('date_planned', { ascending: false });

      if (error) {
        console.error('Error fetching chantiers:', error);
        // If chantier_details table doesn't exist yet, retry without it
        const { data: fallbackData } = await supabase
          .from('interventions')
          .select('id, title, address, date_planned, status, regie:regies(id, name)')
          .eq('technician_id', user.id)
          .eq('intervention_type', 'chantier')
          .not('status', 'eq', 'annule')
          .order('date_planned', { ascending: false });
        if (fallbackData) setChantiers(fallbackData as ChantierIntervention[]);
      } else {
        setChantiers((data || []) as ChantierIntervention[]);
      }
      setIsLoading(false);
    };
    fetchChantiers();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <HardHat className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes chantiers</h1>
          <p className="text-sm text-gray-500">{chantiers.length} chantier{chantiers.length !== 1 ? 's' : ''} en cours</p>
        </div>
      </div>

      {chantiers.length === 0 ? (
        <div className="text-center py-16">
          <HardHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun chantier assigné</p>
          <p className="text-sm text-gray-400 mt-1">Les chantiers planifiés apparaîtront ici</p>
        </div>
      ) : (
        <div className="space-y-3">
          {chantiers.map((chantier) => {
            const progress = chantier.chantier_details?.[0]?.progress_percent ?? 0;
            const statusLabel = chantier.status === 'planifie' ? 'Planifié' : chantier.status === 'en_cours' ? 'En cours' : chantier.status === 'termine' ? 'Terminé' : chantier.status;
            const statusColor = chantier.status === 'en_cours' ? 'bg-blue-100 text-blue-700' : chantier.status === 'termine' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

            return (
              <Link
                key={chantier.id}
                href={`/technician/chantier/${chantier.id}`}
                className="block bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{chantier.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{chantier.address}</span>
                    </div>
                    {chantier.regie && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{chantier.regie.name}</span>
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500">{progress}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
