'use client';

import { useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import {
  X,
  MapPin,
  Clock,
  User,
  Building2,
  Phone,
  FileText,
  ExternalLink,
  Pencil,
  AlertTriangle,
} from 'lucide-react';

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  nouveau: { label: 'Nouveau', color: 'bg-blue-100 text-blue-700' },
  planifie: { label: 'Planifié', color: 'bg-amber-100 text-amber-700' },
  en_cours: { label: 'En cours', color: 'bg-orange-100 text-orange-700' },
  termine: { label: 'Terminé', color: 'bg-emerald-100 text-emerald-700' },
  ready_to_bill: { label: 'Prêt à facturer', color: 'bg-amber-100 text-amber-700' },
  billed: { label: 'Facturé', color: 'bg-violet-100 text-violet-700' },
  annule: { label: 'Annulé', color: 'bg-gray-100 text-gray-600' },
};

interface InterventionDetailSheetProps {
  intervention: Intervention | null;
  onClose: () => void;
  onEdit: () => void;
}

export function InterventionDetailSheet({ intervention, onClose, onEdit }: InterventionDetailSheetProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (intervention) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [intervention, handleKeyDown]);

  if (!intervention) return null;

  const statusInfo = STATUS_LABELS[intervention.status] || { label: intervention.status, color: 'bg-gray-100 text-gray-700' };
  const clientInfo = intervention.client_info as { name?: string; phone?: string } | null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {intervention.priority > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" />
                  {intervention.priority === 2 ? 'Urgence absolue' : 'Urgent'}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">
              {intervention.title}
            </h2>
            {intervention.work_order_number && (
              <p className="text-sm text-amber-700 font-medium mt-0.5">
                Bon N° {intervention.work_order_number}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Date & Duration */}
          {intervention.date_planned && (
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Date planifiée</p>
                <p className="font-medium text-gray-900">
                  {format(new Date(intervention.date_planned), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </p>
                <p className="text-sm text-gray-500">
                  Durée estimée : {intervention.estimated_duration_minutes} min
                </p>
              </div>
            </div>
          )}

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-500">Adresse</p>
              <p className="font-medium text-gray-900">{intervention.address}</p>
            </div>
          </div>

          {/* Technician */}
          {intervention.technician && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Technicien</p>
                <p className="font-medium text-gray-900">
                  {intervention.technician.first_name} {intervention.technician.last_name}
                </p>
              </div>
            </div>
          )}

          {/* Client */}
          {clientInfo?.name && (
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Client</p>
                <p className="font-medium text-gray-900">{clientInfo.name}</p>
                {clientInfo.phone && (
                  <a href={`tel:${clientInfo.phone}`} className="flex items-center gap-1 text-sm text-blue-600 mt-0.5">
                    <Phone className="w-3.5 h-3.5" />
                    {clientInfo.phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {intervention.description && (
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap text-sm mt-1">{intervention.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-gray-100 space-y-2">
          <button
            onClick={onEdit}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Modifier l&apos;intervention
          </button>
          <Link
            href={`/interventions`}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Voir toutes les interventions
          </Link>
        </div>
      </div>
    </div>
  );
}
