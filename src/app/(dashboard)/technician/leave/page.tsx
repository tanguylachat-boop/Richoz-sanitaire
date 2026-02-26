'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CalendarDays,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Palmtree,
  Send,
} from 'lucide-react';

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Accepté', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  rejected: { label: 'Refusé', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function TechnicianLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    reason: '',
  });

  const supabase = createClient();

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  // Fetch leave requests
  const fetchRequests = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('technician_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching leave requests:', error);
    } else {
      setRequests(data as LeaveRequest[]);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) fetchRequests();
  }, [userId, fetchRequests]);

  // Submit new request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    // Validation
    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      toast.error('La date de fin doit être après la date de début');
      return;
    }

    if (new Date(formData.start_date) < new Date(new Date().toDateString())) {
      toast.error('Vous ne pouvez pas demander un congé dans le passé');
      return;
    }

    setIsSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leave_requests')
        .insert({
          technician_id: userId,
          start_date: formData.start_date,
          end_date: formData.end_date,
          reason: formData.reason || null,
          status: 'pending',
        });

      if (error) throw new Error(error.message);

      toast.success('Demande de congé envoyée !');
      setFormData({ start_date: '', end_date: '', reason: '' });
      setShowForm(false);
      fetchRequests();
    } catch (error) {
      console.error('Error submitting leave request:', error);
      toast.error('Erreur lors de l\'envoi de la demande');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDurationDays = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Palmtree className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mes congés</h1>
            <p className="text-sm text-gray-500">
              {pendingCount > 0 ? `${pendingCount} en attente` : 'Aucune demande en attente'}
              {approvedCount > 0 ? ` · ${approvedCount} accepté${approvedCount > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Demande de congé
        </button>
      </div>

      {/* Formulaire nouvelle demande */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Nouvelle demande de congé</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de début *
                </label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de fin *
                </label>
                <input
                  type="date"
                  required
                  value={formData.end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                  min={formData.start_date || format(new Date(), 'yyyy-MM-dd')}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {formData.start_date && formData.end_date && (
              <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                📅 {getDurationDays(formData.start_date, formData.end_date)} jour{getDurationDays(formData.start_date, formData.end_date) > 1 ? 's' : ''} de congé demandé{getDurationDays(formData.start_date, formData.end_date) > 1 ? 's' : ''}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motif (optionnel)
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Vacances, rendez-vous médical, personnel..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSubmitting ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des demandes */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucune demande de congé</h3>
          <p className="text-gray-500 max-w-sm mx-auto">Cliquez sur &quot;Demande de congé&quot; pour en créer une.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const config = STATUS_CONFIG[req.status];
            const StatusIcon = config.icon;
            const days = getDurationDays(req.start_date, req.end_date);

            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${config.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {days} jour{days > 1 ? 's' : ''}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {format(new Date(req.start_date + 'T00:00:00'), 'd MMMM yyyy', { locale: fr })}
                      {req.start_date !== req.end_date && (
                        <> → {format(new Date(req.end_date + 'T00:00:00'), 'd MMMM yyyy', { locale: fr })}</>
                      )}
                    </p>

                    {req.reason && (
                      <p className="text-sm text-gray-500">{req.reason}</p>
                    )}

                    {req.status === 'rejected' && req.rejection_reason && (
                      <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600">
                          <strong>Motif du refus :</strong> {req.rejection_reason}
                        </p>
                      </div>
                    )}
                  </div>

                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: fr })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}