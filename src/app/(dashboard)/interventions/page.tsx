'use client';

import { useState, useEffect } from 'react';
import { Wrench, Plus, Search, Filter, MapPin, Clock, User, Edit2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { InterventionForm } from '@/components/interventions/InterventionForm';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
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

const statusConfig: Record<string, { label: string; className: string }> = {
  nouveau: { label: 'Nouveau', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  planifie: { label: 'Planifié', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_cours: { label: 'En cours', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  termine: { label: 'Terminé', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready_to_bill: { label: 'Prêt à facturer', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  billed: { label: 'Facturé', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  annule: { label: 'Annulé', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const priorityConfig: Record<number, { label: string; className: string }> = {
  0: { label: 'Normal', className: 'text-gray-500' },
  1: { label: 'Urgent', className: 'text-orange-600 font-medium' },
  2: { label: 'Urgence absolue', className: 'text-red-600 font-semibold' },
};

export default function InterventionsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const supabase = createClient();

  const fetchInterventions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('interventions')
      .select(`
        id, title, description, address, date_planned,
        estimated_duration_minutes, status, priority,
        technician_id, regie_id, client_info, work_order_number,
        technician:users!interventions_technician_id_fkey(id, first_name, last_name)
      `)
      .order('date_planned', { ascending: false })
      .limit(50);

    if (!error && data) {
      setInterventions(data as Intervention[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInterventions();
  }, []);

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    fetchInterventions();
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedIntervention(null);
    fetchInterventions();
  };

  const handleInterventionClick = (intervention: Intervention) => {
    setSelectedIntervention(intervention);
    setIsEditModalOpen(true);
  };

  // Filter interventions by search query
  const filteredInterventions = interventions.filter((intervention) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      intervention.title.toLowerCase().includes(query) ||
      intervention.address.toLowerCase().includes(query) ||
      (intervention.client_info?.name?.toLowerCase().includes(query) ?? false) ||
      (intervention.technician?.first_name?.toLowerCase().includes(query) ?? false) ||
      (intervention.technician?.last_name?.toLowerCase().includes(query) ?? false)
    );
  });

  const getTechnicianName = (tech: Intervention['technician']) => {
    if (!tech) return null;
    const parts = [tech.first_name, tech.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            {filteredInterventions.length} intervention{filteredInterventions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtrer</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouvelle</span>
          </button>
        </div>
      </div>

      {/* Interventions List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : filteredInterventions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucune intervention
            </h3>
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'Aucun résultat pour cette recherche.' : 'Commencez par créer une nouvelle intervention.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nouvelle intervention
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredInterventions.map((intervention) => {
              const status = statusConfig[intervention.status] || statusConfig.nouveau;
              const priority = priorityConfig[intervention.priority] || priorityConfig[0];
              const technicianName = getTechnicianName(intervention.technician);

              return (
                <div 
                  key={intervention.id} 
                  className="p-4 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                  onClick={() => handleInterventionClick(intervention)}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-5 h-5 text-blue-600" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <h3 className="font-semibold text-gray-900">{intervention.title}</h3>
                          {intervention.priority > 0 && (
                            <span className={`text-xs ${priority.className}`}>
                              ⚠️ {priority.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${status.className}`}>
                            {status.label}
                          </span>
                          <button 
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInterventionClick(intervention);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        {intervention.date_planned && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>
                              {format(new Date(intervention.date_planned), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                            </span>
                          </div>
                        )}
                        {intervention.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            <span className="truncate max-w-[200px]">{intervention.address}</span>
                          </div>
                        )}
                        {intervention.client_info?.name && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4" />
                            <span>{intervention.client_info.name}</span>
                          </div>
                        )}
                        {technicianName && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs flex items-center justify-center font-medium">
                              {technicianName.charAt(0)}
                            </span>
                            <span className="text-emerald-700">{technicianName}</span>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {intervention.description && (
                        <p className="text-sm text-gray-500 mt-2 line-clamp-1">
                          {intervention.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
    </div>
  );
}
