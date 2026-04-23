'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  X,
  MapPin,
  Droplets,
  Bell,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Loader2,
  User,
  FileText,
} from 'lucide-react';

export interface ReminderSheetData {
  id: string;
  intervention_id: string;
  user_id: string;
  reminder_date: string;
  message: string;
  completed: boolean;
  technician?: { first_name: string | null; last_name: string | null } | null;
}

interface LinkedIntervention {
  id: string;
  title: string;
  address: string;
  work_order_number: string | null;
  date_planned: string | null;
  intervention_type: string | null;
  status: string;
}

interface CutoffNoticeSheetProps {
  reminder: ReminderSheetData | null;
  onClose: () => void;
  onOpenIntervention: (interventionId: string) => void;
  onChanged: () => void;
}

export function CutoffNoticeSheet({ reminder, onClose, onOpenIntervention, onChanged }: CutoffNoticeSheetProps) {
  const supabase = createClient();
  const [intervention, setIntervention] = useState<LinkedIntervention | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!reminder) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [reminder, handleKeyDown]);

  useEffect(() => {
    if (!reminder?.intervention_id) {
      setIntervention(null);
      return;
    }
    const fetchIntervention = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('interventions')
        .select('id, title, address, work_order_number, date_planned, intervention_type, status')
        .eq('id', reminder.intervention_id)
        .single();
      setIntervention(data as LinkedIntervention | null);
      setIsLoading(false);
    };
    fetchIntervention();
  }, [reminder?.intervention_id, supabase]);

  const handleMarkDone = async () => {
    if (!reminder) return;
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('intervention_reminders')
        .update({ completed: true })
        .eq('id', reminder.id);
      if (error) throw new Error(error.message);
      toast.success('Rappel marqué comme fait');
      onChanged();
      onClose();
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!reminder) return;
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('intervention_reminders')
        .delete()
        .eq('id', reminder.id);
      if (error) throw new Error(error.message);
      toast.success('Rappel supprimé');
      onChanged();
      onClose();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!reminder) return null;

  const techName = reminder.technician
    ? [reminder.technician.first_name, reminder.technician.last_name].filter(Boolean).join(' ')
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 inline-flex items-center gap-1">
                <Bell className="w-3 h-3" />
                Rappel
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700 inline-flex items-center gap-1">
                <Droplets className="w-3 h-3" />
                Coupure d&apos;eau
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">
              {reminder.message}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {format(new Date(reminder.reminder_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {techName && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-500">Technicien notifié</p>
                <p className="font-medium text-gray-900">{techName}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : intervention ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">Intervention liée</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">{intervention.title}</p>
                {intervention.work_order_number && (
                  <p className="text-sm text-amber-700 font-medium">
                    Bon N° {intervention.work_order_number}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span>{intervention.address}</span>
              </div>
              {intervention.date_planned && (
                <p className="text-sm text-gray-600">
                  Planifiée : {format(new Date(intervention.date_planned), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                </p>
              )}
              <button
                onClick={() => onOpenIntervention(intervention.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Voir la fiche intervention
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
              Aucune intervention liée trouvée.
            </div>
          )}
        </div>

        {confirmDelete && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200">
            <p className="text-sm text-red-800">Supprimer définitivement ce rappel ?</p>
          </div>
        )}

        <div className="p-6 border-t border-gray-100 space-y-2">
          {!confirmDelete && (
            <>
              <button
                onClick={handleMarkDone}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Marquer comme fait
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border border-gray-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer le rappel
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Non, garder
              </button>
              <button
                onClick={handleDelete}
                disabled={isProcessing}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
