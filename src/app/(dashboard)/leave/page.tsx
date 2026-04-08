'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Palmtree,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarDays,
  User,
  Pencil,
  Trash2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { sendPush } from '@/lib/send-push';

interface LeaveRequest {
  id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  technician?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
}

type TabFilter = 'pending' | 'all';

interface TechnicianOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export default function LeaveManagementPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Edit / Cancel state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Create-leave-for-technician state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [createForm, setCreateForm] = useState({
    technician_id: '',
    start_date: '',
    end_date: '',
    reason: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  // Load technicians once for the create-leave form
  useEffect(() => {
    const loadTechnicians = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('role', 'technician')
        .order('last_name');
      if (data) setTechnicians(data as TechnicianOption[]);
    };
    loadTechnicians();
  }, []);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);

    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        technician:users!leave_requests_technician_id_fkey(id, first_name, last_name, email)
      `)
      .order('created_at', { ascending: false });

    if (tab === 'pending') {
      query = query.eq('status', 'pending');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching leave requests:', error);
      toast.error('Erreur lors du chargement des congés');
    } else {
      setRequests(data as LeaveRequest[]);
    }
    setIsLoading(false);
  }, [tab]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Realtime subscription for new requests
  useEffect(() => {
    const channel = supabase
      .channel('leave_requests_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leave_requests' }, () => {
        fetchRequests();
        toast.info('Nouvelle demande de congé reçue');
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    if (!userId) return;
    setProcessingId(requestId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leave_requests')
        .update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw new Error(error.message);

      toast.success('Congé approuvé ✅');
      fetchRequests();
    } catch (error) {
      console.error('Error approving leave:', error);
      toast.error('Erreur lors de l\'approbation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!userId) return;
    setProcessingId(requestId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leave_requests')
        .update({
          status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        })
        .eq('id', requestId);

      if (error) throw new Error(error.message);

      toast.success('Congé refusé');
      setRejectingId(null);
      setRejectionReason('');
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting leave:', error);
      toast.error('Erreur lors du refus');
    } finally {
      setProcessingId(null);
    }
  };

  const startEditing = (req: LeaveRequest) => {
    setEditingId(req.id);
    setEditStartDate(req.start_date);
    setEditEndDate(req.end_date);
    setEditReason(req.reason || '');
  };

  const handleEdit = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leave_requests')
        .update({
          start_date: editStartDate,
          end_date: editEndDate,
          reason: editReason || null,
        })
        .eq('id', requestId);

      if (error) throw new Error(error.message);

      toast.success('Congé modifié');
      setEditingId(null);
      fetchRequests();
    } catch (error) {
      console.error('Error editing leave:', error);
      toast.error('Erreur lors de la modification');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!createForm.technician_id) {
      toast.error('Sélectionne un technicien');
      return;
    }
    if (!createForm.start_date || !createForm.end_date) {
      toast.error('Dates de début et de fin obligatoires');
      return;
    }
    if (new Date(createForm.start_date) > new Date(createForm.end_date)) {
      toast.error('La date de fin doit être après la date de début');
      return;
    }

    setIsCreating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('leave_requests')
        .insert({
          technician_id: createForm.technician_id,
          start_date: createForm.start_date,
          end_date: createForm.end_date,
          reason: createForm.reason || null,
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      // Notify the technician (in-app + push)
      const tech = technicians.find((t) => t.id === createForm.technician_id);
      const techName = tech
        ? `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || tech.email
        : 'Technicien';
      const startLabel = format(new Date(createForm.start_date + 'T00:00:00'), 'd MMM', { locale: fr });
      const endLabel = format(new Date(createForm.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr });
      const notifMessage = createForm.start_date === createForm.end_date
        ? `Congé enregistré le ${startLabel}`
        : `Congé enregistré du ${startLabel} au ${endLabel}`;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert({
          recipient_id: createForm.technician_id,
          sender_id: userId,
          title: 'Congé ajouté par l\'administration',
          message: notifMessage,
          type: 'leave_created',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reference_id: (data as any)?.id || null,
          reference_type: 'leave_request',
        });
      } catch (notifErr) {
        console.error('Notification insert failed:', notifErr);
      }

      sendPush({
        recipient_id: createForm.technician_id,
        title: 'Congé ajouté',
        message: notifMessage,
        url: '/technician/leave',
      });

      toast.success(`Congé créé pour ${techName}`);
      setCreateForm({ technician_id: '', start_date: '', end_date: '', reason: '' });
      setShowCreateForm(false);
      fetchRequests();
    } catch (error) {
      console.error('Error creating leave:', error);
      toast.error('Erreur lors de la création du congé');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leave_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw new Error(error.message);

      toast.success('Congé annulé et supprimé');
      setCancellingId(null);
      fetchRequests();
    } catch (error) {
      console.error('Error deleting leave:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setProcessingId(null);
    }
  };

  const getTechName = (tech: LeaveRequest['technician']) => {
    if (!tech) return 'Inconnu';
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    return tech.first_name || tech.last_name || tech.email;
  };

  const getDurationDays = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Palmtree className="w-6 h-6 text-blue-600" />
            Gestion des congés
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingCount > 0
              ? `${pendingCount} demande${pendingCount > 1 ? 's' : ''} en attente de validation`
              : 'Aucune demande en attente'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouveau congé
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            En attente {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Historique
          </button>
        </div>
      </div>

      {/* Create-leave-for-technician form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Ajouter un congé pour un technicien
            </h3>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreateLeave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technicien *</label>
              <select
                required
                value={createForm.technician_id}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, technician_id: e.target.value }))}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Sélectionner --</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                <input
                  type="date"
                  required
                  value={createForm.start_date}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                <input
                  type="date"
                  required
                  value={createForm.end_date}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  min={createForm.start_date || undefined}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {createForm.start_date && createForm.end_date && (
              <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                📅 {getDurationDays(createForm.start_date, createForm.end_date)} jour
                {getDurationDays(createForm.start_date, createForm.end_date) > 1 ? 's' : ''} de congé
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motif (optionnel)</label>
              <input
                type="text"
                value={createForm.reason}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Vacances, maladie, formation..."
                className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {isCreating ? 'Création...' : 'Créer le congé'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {tab === 'pending' ? 'Aucune demande en attente' : 'Aucun historique de congés'}
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            {tab === 'pending'
              ? 'Les demandes de congé des techniciens apparaîtront ici.'
              : 'L\'historique des congés traités apparaîtra ici.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';
            const days = getDurationDays(req.start_date, req.end_date);
            const isRejecting = rejectingId === req.id;
            const isProcessing = processingId === req.id;

            return (
              <div
                key={req.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                  isPending ? 'border-amber-200' : 'border-gray-200'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Tech name + status */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="font-semibold text-gray-900">
                          {getTechName(req.technician)}
                        </span>
                        {isPending && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        )}
                        {isApproved && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Accepté
                          </span>
                        )}
                        {isRejected && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Refusé
                          </span>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <CalendarDays className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">
                            {format(new Date(req.start_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
                          </span>
                          {req.start_date !== req.end_date && (
                            <>
                              <span className="text-gray-400">→</span>
                              <span className="font-medium">
                                {format(new Date(req.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {days} jour{days > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Reason */}
                      {req.reason && (
                        <p className="text-sm text-gray-500 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {req.reason}
                        </p>
                      )}

                      {/* Rejection reason */}
                      {isRejected && req.rejection_reason && (
                        <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg">
                          <p className="text-xs text-red-600">
                            <strong>Motif du refus :</strong> {req.rejection_reason}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons for pending */}
                  {isPending && !isRejecting && editingId !== req.id && cancellingId !== req.id && (
                    <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => startEditing(req)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifier
                      </button>
                      <button
                        onClick={() => setCancellingId(req.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Annuler
                      </button>
                      <button
                        onClick={() => setRejectingId(req.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Refuser
                      </button>
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Accepter
                      </button>
                    </div>
                  )}

                  {/* Modifier/Annuler buttons for approved leaves */}
                  {isApproved && editingId !== req.id && cancellingId !== req.id && (
                    <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => startEditing(req)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Modifier
                      </button>
                      <button
                        onClick={() => setCancellingId(req.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Annuler le congé
                      </button>
                    </div>
                  )}

                  {/* Edit form */}
                  {editingId === req.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      <p className="text-sm font-medium text-gray-700">Modifier les dates du congé</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Date début</label>
                          <input
                            type="date"
                            value={editStartDate}
                            onChange={(e) => setEditStartDate(e.target.value)}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Date fin</label>
                          <input
                            type="date"
                            value={editEndDate}
                            onChange={(e) => setEditEndDate(e.target.value)}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Motif</label>
                        <input
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Motif du congé..."
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleEdit(req.id)}
                          disabled={isProcessing || !editStartDate || !editEndDate}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Cancel confirmation */}
                  {cancellingId === req.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-800 mb-3">
                          Supprimer le congé de {getTechName(req.technician)} du {format(new Date(req.start_date + 'T00:00:00'), 'd MMM', { locale: fr })} au {format(new Date(req.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })} ?
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setCancellingId(null)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
                          >
                            Non, garder
                          </button>
                          <button
                            onClick={() => handleDelete(req.id)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Oui, supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection form */}
                  {isRejecting && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Motif du refus (optionnel)
                        </label>
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Ex: Trop de techniciens absents cette semaine..."
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          Confirmer le refus
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}