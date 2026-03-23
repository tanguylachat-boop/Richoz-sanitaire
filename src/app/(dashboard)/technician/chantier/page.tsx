'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  HardHat,
  MapPin,
  ChevronRight,
  Loader2,
  Building2,
  BarChart3,
  AlertTriangle,
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
  has_pending_revision?: boolean;
  revision_message?: string | null;
}

const COMPLETED_STATUSES = ['termine', 'completed', 'terminated', 'ready_to_bill', 'billed'];

export default function ChantierListPage() {
  const [chantiers, setChantiers] = useState<ChantierIntervention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchChantiers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!userId) setUserId(user.id);

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

      let chantierList: ChantierIntervention[] = [];
      if (error) {
        console.error('Error fetching chantiers:', error);
        const { data: fallbackData } = await supabase
          .from('interventions')
          .select('id, title, address, date_planned, status, regie:regies(id, name)')
          .eq('technician_id', user.id)
          .eq('intervention_type', 'chantier')
          .not('status', 'eq', 'annule')
          .order('date_planned', { ascending: false });
        if (fallbackData) chantierList = fallbackData as ChantierIntervention[];
      } else {
        chantierList = (data || []) as ChantierIntervention[];
      }

      // Fetch reports with pending revision for this technician's chantiers
      if (chantierList.length > 0) {
        const chantierIds = chantierList.map(c => c.id);
        const { data: revReports } = await supabase
          .from('reports')
          .select('intervention_id, revision_message')
          .eq('technician_id', user.id)
          .eq('revision_requested', true)
          .in('status', ['rejected'])
          .in('intervention_id', chantierIds);

        if (revReports && revReports.length > 0) {
          const revMap = new Map(revReports.map(r => [r.intervention_id, r.revision_message]));
          chantierList = chantierList.map(c => ({
            ...c,
            has_pending_revision: revMap.has(c.id),
            revision_message: revMap.get(c.id) || null,
          }));
        }
      }

    setChantiers(chantierList);
    setIsLoading(false);
  }, [supabase, userId]);

  useEffect(() => { fetchChantiers(); }, [fetchChantiers]);

  // Realtime: listen for intervention changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('tech-chantiers-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions', filter: 'technician_id=eq.' + userId }, () => {
        fetchChantiers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, fetchChantiers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Chantiers with pending revision go to "En cours" even if status is completed
  const activeChantiers = chantiers.filter((c) => !COMPLETED_STATUSES.includes(c.status) || c.has_pending_revision);
  const completedChantiers = chantiers.filter((c) => COMPLETED_STATUSES.includes(c.status) && !c.has_pending_revision);
  const displayedChantiers = showCompleted ? completedChantiers : activeChantiers;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <HardHat className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes chantiers</h1>
          <p className="text-sm text-gray-500">{activeChantiers.length} chantier{activeChantiers.length !== 1 ? 's' : ''} en cours</p>
        </div>
      </div>

      {/* Tabs: En cours / Terminés */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setShowCompleted(false)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!showCompleted ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          En cours ({activeChantiers.length})
        </button>
        <button
          onClick={() => setShowCompleted(true)}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${showCompleted ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          Terminés ({completedChantiers.length})
        </button>
      </div>

      {displayedChantiers.length === 0 ? (
        <div className="text-center py-16">
          <HardHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{showCompleted ? 'Aucun chantier terminé' : 'Aucun chantier en cours'}</p>
          <p className="text-sm text-gray-400 mt-1">{showCompleted ? 'Les chantiers terminés apparaîtront ici' : 'Les chantiers planifiés apparaîtront ici'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedChantiers.map((chantier) => {
            const progress = chantier.chantier_details?.[0]?.progress_percent ?? 0;
            const statusLabel = chantier.status === 'planifie' ? 'Planifié' : chantier.status === 'en_cours' ? 'En cours' : chantier.status === 'termine' ? 'Terminé' : chantier.status;
            const statusColor = chantier.status === 'en_cours' ? 'bg-blue-100 text-blue-700' : chantier.status === 'termine' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

            return (
              <Link
                key={chantier.id}
                href={`/technician/chantier/${chantier.id}`}
                className={`block bg-white rounded-2xl border ${chantier.has_pending_revision ? 'border-orange-300' : 'border-gray-200'} p-4 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]`}
              >
                {/* Revision banner */}
                {chantier.has_pending_revision && (
                  <div className="flex items-start gap-2 mb-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                    <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-orange-800">Révision demandée</p>
                      {chantier.revision_message && (
                        <p className="text-xs text-orange-700 mt-0.5 line-clamp-2">{chantier.revision_message}</p>
                      )}
                    </div>
                  </div>
                )}
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
