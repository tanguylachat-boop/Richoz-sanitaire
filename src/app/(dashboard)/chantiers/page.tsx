'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  HardHat,
  Search,
  MapPin,
  AlertTriangle,
  MessageSquare,
  Loader2,
  Building2,
  Droplets,
  Zap,
  Flame,
  Plus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/Modal';
import { PlanificationSplitView } from '@/components/interventions/PlanificationSplitView';
import type { PlanificationTechnician, PlanificationRegie } from '@/components/interventions/PlanificationSplitView';
import { format, subHours, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ChantierRow {
  id: string;
  title: string;
  address: string;
  status: string;
  date_planned: string | null;
  regie?: { id: string; name: string } | null;
  technician?: { id: string; first_name: string | null; last_name: string | null } | null;
  chantier_details?: { id: string; progress_percent: number }[] | null;
}

interface CutoffNotice {
  intervention_id: string;
  end_date_estimated: string | null;
}

interface RecentMessage {
  intervention_id: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  nouveau: { label: 'Nouveau', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  planifie: { label: 'Planifié', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_cours: { label: 'En cours', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  termine: { label: 'Terminé', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready_to_bill: { label: 'Prêt à facturer', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  billed: { label: 'Facturé', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  annule: { label: 'Annulé', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

export default function ChantiersListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [chantiers, setChantiers] = useState<ChantierRow[]>([]);
  const [activeCutoffs, setActiveCutoffs] = useState<Map<string, number>>(new Map());
  const [recentMessages, setRecentMessages] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [technicians, setTechnicians] = useState<PlanificationTechnician[]>([]);
  const [regies, setRegies] = useState<PlanificationRegie[]>([]);

  // Stats
  const [statsEnCours, setStatsEnCours] = useState(0);
  const [statsCutoffs, setStatsCutoffs] = useState(0);
  const [statsMessagesToday, setStatsMessagesToday] = useState(0);

  const fetchReferenceData = async () => {
    const { data: techData } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, intervention_type_preference')
      .eq('role', 'technician')
      .order('last_name');
    if (techData) setTechnicians(techData);

    const { data: regiesData } = await supabase
      .from('regies')
      .select('id, name, email_contact')
      .eq('is_active', true)
      .order('name');
    if (regiesData) setRegies(regiesData);
  };

  const fetchChantiers = async () => {
    setIsLoading(true);
    const now = new Date().toISOString();
    const twentyFourHoursAgo = subHours(new Date(), 24).toISOString();

    // Fetch chantiers, active cutoffs, and recent messages in parallel
    const [chantiersRes, cutoffsRes, messagesRes, messagesTodayRes] = await Promise.all([
      supabase
        .from('interventions')
        .select(`
          id, title, address, status, date_planned,
          regie:regies(id, name),
          technician:users!interventions_technician_id_fkey(id, first_name, last_name),
          chantier_details(id, progress_percent)
        `)
        .eq('intervention_type', 'chantier')
        .neq('status', 'annule')
        .order('date_planned', { ascending: false }),

      // Active cutoffs (end_date > now or end_date is null and start_date < now)
      supabase
        .from('chantier_cutoff_notices')
        .select('intervention_id, end_date_estimated')
        .or(`end_date_estimated.gt.${now},end_date_estimated.is.null`),

      // Messages in last 24h
      supabase
        .from('chantier_messages')
        .select('intervention_id, created_at')
        .gte('created_at', twentyFourHoursAgo),

      // Total messages today count
      supabase
        .from('chantier_messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo),
    ]);

    if (chantiersRes.data) {
      setChantiers(chantiersRes.data as ChantierRow[]);
      setStatsEnCours(chantiersRes.data.filter((c) => c.status === 'en_cours').length);
    }

    // Build cutoff map: intervention_id → count of active cutoffs
    if (cutoffsRes.data) {
      const cutoffMap = new Map<string, number>();
      (cutoffsRes.data as CutoffNotice[]).forEach((c) => {
        cutoffMap.set(c.intervention_id, (cutoffMap.get(c.intervention_id) || 0) + 1);
      });
      setActiveCutoffs(cutoffMap);
      setStatsCutoffs(cutoffsRes.data.length);
    }

    // Build recent messages set
    if (messagesRes.data) {
      const msgSet = new Set<string>();
      (messagesRes.data as RecentMessage[]).forEach((m) => msgSet.add(m.intervention_id));
      setRecentMessages(msgSet);
    }

    setStatsMessagesToday(messagesTodayRes.count ?? 0);
    setIsLoading(false);

    // Mark chantier_update notifications as read
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await (supabase as any).from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.id)
        .eq('type', 'chantier_update')
        .eq('is_read', false);
    }
  };

  useEffect(() => {
    fetchChantiers();
    fetchReferenceData();
  }, []);

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    fetchChantiers();
  };

  const filteredChantiers = chantiers.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      (c.regie?.name?.toLowerCase().includes(q) ?? false) ||
      (c.technician?.first_name?.toLowerCase().includes(q) ?? false) ||
      (c.technician?.last_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const getTechName = (tech: ChantierRow['technician']) => {
    if (!tech) return null;
    return [tech.first_name, tech.last_name].filter(Boolean).join(' ') || null;
  };

  // Find last message date for a chantier (we use created_at from recent messages)
  const getLastActivity = (chantier: ChantierRow) => {
    // For now, return date_planned as fallback
    return chantier.date_planned;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <HardHat className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statsEnCours}</p>
              <p className="text-sm text-gray-500">Chantiers en cours</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statsCutoffs}</p>
              <p className="text-sm text-gray-500">Coupures actives</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{statsMessagesToday}</p>
              <p className="text-sm text-gray-500">Messages (24h)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            {filteredChantiers.length} chantier{filteredChantiers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un chantier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nouveau chantier
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : filteredChantiers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <HardHat className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun chantier</h3>
            <p className="text-gray-500">
              {searchQuery ? 'Aucun résultat pour cette recherche.' : 'Les chantiers planifiés apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Titre</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 hidden md:table-cell">Régie</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 hidden lg:table-cell">Adresse</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 hidden sm:table-cell">Technicien</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Progression</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Statut</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 hidden xl:table-cell">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredChantiers.map((chantier) => {
                  const progress = chantier.chantier_details?.[0]?.progress_percent ?? 0;
                  const status = statusConfig[chantier.status] || statusConfig.nouveau;
                  const techName = getTechName(chantier.technician);
                  const hasActiveCutoff = activeCutoffs.has(chantier.id);
                  const cutoffCount = activeCutoffs.get(chantier.id) || 0;
                  const hasRecentMessage = recentMessages.has(chantier.id);
                  const lastActivity = getLastActivity(chantier);

                  return (
                    <tr
                      key={chantier.id}
                      className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/chantiers/${chantier.id}`)}
                    >
                      {/* Title + badges */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{chantier.title}</span>
                          {hasActiveCutoff && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700" title={`${cutoffCount} coupure${cutoffCount > 1 ? 's' : ''} active${cutoffCount > 1 ? 's' : ''}`}>
                              <AlertTriangle className="w-3 h-3" />
                              {cutoffCount}
                            </span>
                          )}
                          {hasRecentMessage && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-orange-100 text-orange-700" title="Nouveau message">
                              <MessageSquare className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Régie */}
                      <td className="py-3 px-4 hidden md:table-cell">
                        {chantier.regie ? (
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span>{chantier.regie.name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Adresse */}
                      <td className="py-3 px-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-gray-600 max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{chantier.address}</span>
                        </div>
                      </td>

                      {/* Technicien */}
                      <td className="py-3 px-4 hidden sm:table-cell">
                        {techName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">
                              {techName.charAt(0)}
                            </div>
                            <span className="text-gray-700">{techName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Non assigné</span>
                        )}
                      </td>

                      {/* Progression */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-500 w-8 text-right">{progress}%</span>
                        </div>
                      </td>

                      {/* Statut */}
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${status.className}`}>
                          {status.label}
                        </span>
                      </td>

                      {/* Dernière activité */}
                      <td className="py-3 px-4 text-gray-500 hidden xl:table-cell">
                        {lastActivity
                          ? format(new Date(lastActivity), 'd MMM yyyy', { locale: fr })
                          : '—'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nouveau Chantier */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Planifier un nouveau chantier"
        size="full"
      >
        <PlanificationSplitView
          technicians={technicians}
          regies={regies}
          onSuccess={handleCreateSuccess}
          onCancel={() => setIsCreateModalOpen(false)}
          forceInterventionType="chantier"
        />
      </Modal>
    </div>
  );
}
