'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';

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
  work_order_number: string | null;
  client_info: { name?: string; phone?: string } | null;
}

interface Technician {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Regie {
  id: string;
  name: string;
}

interface InterventionFormProps {
  intervention?: Intervention | null;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const STATUS_OPTIONS = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'planifie', label: 'Planifié' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'termine', label: 'Terminé' },
  { value: 'ready_to_bill', label: 'Prêt à facturer' },
  { value: 'billed', label: 'Facturé' },
  { value: 'annule', label: 'Annulé' },
];

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'Urgence absolue' },
];

export function InterventionForm({ 
  intervention, 
  onSuccess, 
  onCancel,
  onDelete 
}: InterventionFormProps) {
  const isEditMode = !!intervention;
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);

  // Parse existing date/time if editing
  const getInitialDate = () => {
    if (intervention?.date_planned) {
      return intervention.date_planned.split('T')[0];
    }
    return '';
  };

  const getInitialTime = () => {
    if (intervention?.date_planned) {
      const timePart = intervention.date_planned.split('T')[1];
      if (timePart) {
        return timePart.substring(0, 5);
      }
    }
    return '';
  };

  const [formData, setFormData] = useState({
    title: intervention?.title || '',
    description: intervention?.description || '',
    address: intervention?.address || '',
    date_planned: getInitialDate(),
    time_planned: getInitialTime(),
    estimated_duration_minutes: intervention?.estimated_duration_minutes || 60,
    status: intervention?.status || 'planifie',
    priority: intervention?.priority || 0,
    technician_id: intervention?.technician_id || '',
    regie_id: intervention?.regie_id || '',
    work_order_number: intervention?.work_order_number || '',
    client_name: (intervention?.client_info as { name?: string })?.name || '',
    client_phone: (intervention?.client_info as { phone?: string })?.phone || '',
  });

  const supabase = createClient();

  // Fetch technicians and regies on mount
  useEffect(() => {
    const fetchData = async () => {
      // Fetch technicians (users with role 'technician')
      const { data: techData } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('role', 'technician')
        .order('last_name');

      if (techData) {
        setTechnicians(techData);
      }

      // Fetch regies
      const { data: regieData } = await supabase
        .from('regies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (regieData) {
        setRegies(regieData);
      }
    };

    fetchData();
  }, [supabase]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' || name === 'estimated_duration_minutes' 
        ? parseInt(value) 
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Combine date and time
      let datePlanned = null;
      if (formData.date_planned) {
        const dateStr = formData.time_planned
          ? `${formData.date_planned}T${formData.time_planned}:00`
          : `${formData.date_planned}T09:00:00`;
        datePlanned = new Date(dateStr).toISOString();
      }

      // Prepare client_info JSON
      const clientInfo: Record<string, string> = {};
      if (formData.client_name) clientInfo.name = formData.client_name;
      if (formData.client_phone) clientInfo.phone = formData.client_phone;

      const interventionData = {
        title: formData.title,
        description: formData.description || null,
        address: formData.address,
        date_planned: datePlanned,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        status: formData.status as 'nouveau' | 'planifie' | 'en_cours' | 'termine' | 'ready_to_bill' | 'billed' | 'annule',
        priority: formData.priority,
        technician_id: formData.technician_id || null,
        regie_id: formData.regie_id || null,
        work_order_number: formData.work_order_number || null,
        client_info: Object.keys(clientInfo).length > 0 ? clientInfo : null,
      };

      if (isEditMode && intervention) {
        // UPDATE
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('interventions')
          .update(interventionData)
          .eq('id', intervention.id);

        if (error) {
          console.error('Supabase error:', error);
          throw new Error(error.message);
        }

        toast.success('Intervention modifiée avec succès');
      } else {
        // INSERT
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('interventions').insert({
          ...interventionData,
          source_type: 'manual',
        });

        if (error) {
          console.error('Supabase error:', error);
          throw new Error(error.message);
        }

        toast.success('Intervention créée avec succès');
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving intervention:', error);
      toast.error(isEditMode ? 'Erreur lors de la modification' : 'Erreur lors de la création');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!intervention) return;
    
    setIsDeleting(true);
    try {
      // Option 1: Actually delete
      // const { error } = await supabase
      //   .from('interventions')
      //   .delete()
      //   .eq('id', intervention.id);

      // Option 2: Set status to 'annule' (soft delete)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('interventions')
        .update({ status: 'annule' })
        .eq('id', intervention.id);

      if (error) {
        throw new Error(error.message);
      }

      toast.success('Intervention annulée');
      onDelete?.();
      onSuccess();
    } catch (error) {
      console.error('Error deleting intervention:', error);
      toast.error('Erreur lors de l\'annulation');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getTechnicianDisplayName = (tech: Technician) => {
    if (tech.first_name && tech.last_name) {
      return `${tech.first_name} ${tech.last_name}`;
    }
    if (tech.first_name) return tech.first_name;
    if (tech.last_name) return tech.last_name;
    return tech.email;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Titre */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1.5">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          value={formData.title}
          onChange={handleChange}
          placeholder="Ex: Fuite robinet cuisine"
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          value={formData.description}
          onChange={handleChange}
          placeholder="Détails de l'intervention..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Adresse */}
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1.5">
          Adresse <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="address"
          name="address"
          required
          value={formData.address}
          onChange={handleChange}
          placeholder="Rue, NPA Ville"
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Technicien assigné */}
      <div>
        <label htmlFor="technician_id" className="block text-sm font-medium text-gray-700 mb-1.5">
          Technicien assigné
        </label>
        <select
          id="technician_id"
          name="technician_id"
          value={formData.technician_id}
          onChange={handleChange}
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="">-- Non assigné --</option>
          {technicians.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {getTechnicianDisplayName(tech)}
            </option>
          ))}
        </select>
        {technicians.length === 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Aucun technicien disponible
          </p>
        )}
      </div>

      {/* Régie */}
      <div>
        <label htmlFor="regie_id" className="block text-sm font-medium text-gray-700 mb-1.5">
          Régie
        </label>
        <select
          id="regie_id"
          name="regie_id"
          value={formData.regie_id}
          onChange={handleChange}
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="">-- Aucune régie --</option>
          {regies.map((regie) => (
            <option key={regie.id} value={regie.id}>
              {regie.name}
            </option>
          ))}
        </select>
      </div>

      {/* Numéro de Bon de travail */}
      <div>
        <label htmlFor="work_order_number" className="block text-sm font-medium text-gray-700 mb-1.5">
          N° Bon de travail
        </label>
        <input
          type="text"
          id="work_order_number"
          name="work_order_number"
          value={formData.work_order_number}
          onChange={handleChange}
          placeholder="Ex: BT-2024-001234"
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">Référence du bon de travail de la régie</p>
      </div>

      {/* Date et Heure */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="date_planned" className="block text-sm font-medium text-gray-700 mb-1.5">
            Date prévue
          </label>
          <input
            type="date"
            id="date_planned"
            name="date_planned"
            value={formData.date_planned}
            onChange={handleChange}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="time_planned" className="block text-sm font-medium text-gray-700 mb-1.5">
            Heure
          </label>
          <input
            type="time"
            id="time_planned"
            name="time_planned"
            value={formData.time_planned}
            onChange={handleChange}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Durée et Statut */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium text-gray-700 mb-1.5">
            Durée estimée (min)
          </label>
          <input
            type="number"
            id="estimated_duration_minutes"
            name="estimated_duration_minutes"
            min="15"
            step="15"
            value={formData.estimated_duration_minutes}
            onChange={handleChange}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1.5">
            Statut
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Priorité */}
      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1.5">
          Priorité
        </label>
        <select
          id="priority"
          name="priority"
          value={formData.priority}
          onChange={handleChange}
          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Informations client */}
      <div className="pt-4 border-t border-gray-100">
        <p className="text-sm font-medium text-gray-700 mb-3">Informations client</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="client_name" className="block text-sm text-gray-600 mb-1.5">
              Nom du client
            </label>
            <input
              type="text"
              id="client_name"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              placeholder="M. Dupont"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="client_phone" className="block text-sm text-gray-600 mb-1.5">
              Téléphone
            </label>
            <input
              type="tel"
              id="client_phone"
              name="client_phone"
              value={formData.client_phone}
              onChange={handleChange}
              placeholder="+41 79 123 45 67"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Confirmer l&apos;annulation
              </p>
              <p className="text-sm text-red-600 mt-1">
                Cette intervention sera marquée comme annulée. Êtes-vous sûr ?
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Oui, annuler
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Non, garder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        {/* Delete button (only in edit mode) */}
        <div>
          {isEditMode && !showDeleteConfirm && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Annuler le RDV
            </button>
          )}
        </div>

        {/* Save/Cancel buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
          >
            Fermer
          </button>
          <button
            type="submit"
            disabled={isLoading || isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? 'Enregistrement...' : isEditMode ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </form>
  );
}
