'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
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
  History,
} from 'lucide-react';
import { sendPush } from '@/lib/send-push';
import { LEAVE_TYPES, LEAVE_TYPE_ORDER, type LeaveType } from '@/lib/constants';
import {
  LEAVE_HOURS_PER_DAY,
  annualAllowanceHours,
  formatLeaveDuration,
  leaveHours,
  validateLeaveSpan,
} from '@/lib/leave-duration';

interface LeaveRequest {
  id: string;
  technician_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  leave_type: LeaveType;
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

interface LeaveHistoryRow {
  id: string;
  leave_request_id: string;
  action: 'create' | 'update' | 'delete';
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_user: { first_name: string | null; last_name: string | null; email: string } | null;
}

// Message serveur du trigger anti-chevauchement (migration 00030).
const OVERLAP_MARKER = 'CHEVAUCHEMENT_CONGE';

const HISTORY_FIELDS: { key: string; label: string }[] = [
  { key: 'start_date', label: 'Début' },
  { key: 'end_date', label: 'Fin' },
  { key: 'start_time', label: 'Heure début' },
  { key: 'end_time', label: 'Heure fin' },
  { key: 'leave_type', label: 'Type' },
  { key: 'status', label: 'Statut' },
  { key: 'reason', label: 'Motif' },
  { key: 'rejection_reason', label: 'Motif du refus' },
];

const HISTORY_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Accepté',
  rejected: 'Refusé',
};

function historyValueLabel(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value);
  if (key === 'leave_type' && LEAVE_TYPES[text as LeaveType]) return LEAVE_TYPES[text as LeaveType].label;
  if (key === 'status') return HISTORY_STATUS_LABELS[text] || text;
  if (key === 'start_time' || key === 'end_time') return text.slice(0, 5);
  return text;
}

function formatTimeShort(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

type TabFilter = 'pending' | 'all';

interface TechnicianOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  annual_leave_weeks?: number | null;
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
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editReason, setEditReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Historique tab filters
  const [filterTech, setFilterTech] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Change history (leave_request_history) per request
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<LeaveHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Create-leave-for-technician state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [createForm, setCreateForm] = useState<{
    technician_id: string;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    reason: string;
    leave_type: LeaveType;
  }>({
    technician_id: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    reason: '',
    leave_type: 'conge',
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

  // Charge le personnel pour le formulaire de congés : techniciens ET employés
  // de bureau (secrétaires + admin) — tous prennent des congés et doivent être
  // visibles dans la liste. Seuls les comptes actifs.
  useEffect(() => {
    const loadTechnicians = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, annual_leave_weeks')
        .in('role', ['technician', 'secretary', 'admin'])
        .eq('is_active', true)
        .order('last_name');
      if (data) setTechnicians(data as TechnicianOption[]);
    };
    loadTechnicians();
  }, []);

  // Approved "conge" hours this year per technician (for remaining-hours cards).
  // Durées via la règle partagée (leave-duration) : heures réelles pour les
  // absences partielles, jours calendaires × 8h sinon — pas de double décompte,
  // toujours recalculé depuis les lignes actuelles.
  const [approvedThisYear, setApprovedThisYear] = useState<Record<string, number>>({});
  useEffect(() => {
    const loadApproved = async () => {
      const year = new Date().getFullYear();
      const { data } = await supabase
        .from('leave_requests')
        .select('technician_id, start_date, end_date, start_time, end_time, leave_type')
        .eq('status', 'approved')
        .eq('leave_type', 'conge')
        .lte('start_date', `${year}-12-31`)
        .gte('end_date', `${year}-01-01`);
      if (!data) return;
      const clip = { clipStart: `${year}-01-01`, clipEnd: `${year}-12-31` };
      const totals: Record<string, number> = {};
      for (const l of data as { technician_id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null }[]) {
        totals[l.technician_id] = (totals[l.technician_id] || 0) + leaveHours(l, clip);
      }
      setApprovedThisYear(totals);
    };
    loadApproved();
  }, [requests]);

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
    setEditStartTime(formatTimeShort(req.start_time));
    setEditEndTime(formatTimeShort(req.end_time));
    setEditReason(req.reason || '');
  };

  const handleEdit = async (requestId: string) => {
    // Heures uniquement pour une absence sur un seul jour (voir migration 00030).
    const sameDay = editStartDate === editEndDate;
    const span = {
      start_date: editStartDate,
      end_date: editEndDate,
      start_time: sameDay ? editStartTime || null : null,
      end_time: sameDay ? editEndTime || null : null,
    };
    const validationError = validateLeaveSpan(span);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setProcessingId(requestId);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          start_date: span.start_date,
          end_date: span.end_date,
          start_time: span.start_time,
          end_time: span.end_time,
          reason: editReason || null,
        })
        .eq('id', requestId);

      if (error) throw new Error(error.message);

      toast.success('Congé modifié');
      setEditingId(null);
      if (historyOpenId === requestId) setHistoryOpenId(null);
      fetchRequests();
    } catch (error) {
      console.error('Error editing leave:', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes(OVERLAP_MARKER)
          ? 'Un congé de même type existe déjà sur cette période pour ce collaborateur'
          : 'Erreur lors de la modification'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const loadHistory = async (requestId: string) => {
    if (historyOpenId === requestId) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(requestId);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryRows([]);
    const { data, error } = await supabase
      .from('leave_request_history')
      .select('id, leave_request_id, action, changed_at, old_values, new_values, changed_user:users!leave_request_history_changed_by_fkey(first_name, last_name, email)')
      .eq('leave_request_id', requestId)
      .order('changed_at', { ascending: false });
    if (error) {
      console.error('Error loading leave history:', error);
      setHistoryError('Historique indisponible. Réessayez.');
    } else {
      setHistoryRows((data || []) as unknown as LeaveHistoryRow[]);
    }
    setHistoryLoading(false);
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
    const createSameDay = createForm.start_date === createForm.end_date;
    const createSpan = {
      start_date: createForm.start_date,
      end_date: createForm.end_date,
      start_time: createSameDay ? createForm.start_time || null : null,
      end_time: createSameDay ? createForm.end_time || null : null,
    };
    const createValidation = validateLeaveSpan(createSpan);
    if (createValidation) {
      toast.error(createValidation);
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .insert({
          technician_id: createForm.technician_id,
          start_date: createSpan.start_date,
          end_date: createSpan.end_date,
          start_time: createSpan.start_time,
          end_time: createSpan.end_time,
          reason: createForm.reason || null,
          leave_type: createForm.leave_type,
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
      setCreateForm({ technician_id: '', start_date: '', end_date: '', start_time: '', end_time: '', reason: '', leave_type: 'conge' });
      setShowCreateForm(false);
      fetchRequests();
    } catch (error) {
      console.error('Error creating leave:', error);
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes(OVERLAP_MARKER)
          ? 'Un congé de même type existe déjà sur cette période pour ce collaborateur'
          : 'Erreur lors de la création du congé'
      );
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

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Historique filtré (onglet Historique uniquement ; l'onglet En attente reste inchangé)
  const visibleRequests = useMemo(() => {
    if (tab !== 'all') return requests;
    return requests.filter((r) => {
      if (filterTech && r.technician_id !== filterTech) return false;
      if (filterType && r.leave_type !== filterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterFrom && r.end_date < filterFrom) return false;
      if (filterTo && r.start_date > filterTo) return false;
      return true;
    });
  }, [tab, requests, filterTech, filterType, filterStatus, filterFrom, filterTo]);

  // Résumé vacances (type "conge") sur les demandes filtrées : prises / à
  // venir approuvées / en attente, + total sans solde approuvé. Le solde
  // n'est affiché que pour un collaborateur précis (droits de base connus).
  const summary = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let takenHours = 0;
    let upcomingHours = 0;
    let pendingHours = 0;
    let unpaidHours = 0;
    for (const r of visibleRequests) {
      const hours = leaveHours(r);
      if (r.leave_type === 'conge') {
        if (r.status === 'approved') {
          if (r.start_date > today) upcomingHours += hours;
          else takenHours += hours;
        } else if (r.status === 'pending') {
          pendingHours += hours;
        }
      }
      if (r.leave_type === 'sans_solde' && r.status === 'approved') unpaidHours += hours;
    }
    const tech = filterTech ? technicians.find((t) => t.id === filterTech) : null;
    const balanceHours = tech
      ? annualAllowanceHours(tech.annual_leave_weeks) - (approvedThisYear[tech.id] || 0)
      : null;
    return { takenHours, upcomingHours, pendingHours, unpaidHours, balanceHours };
  }, [visibleRequests, filterTech, technicians, approvedThisYear]);

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

      {/* Remaining hours per technician (current year) */}
      {technicians.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Heures de congé restantes — {new Date().getFullYear()}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {technicians.map((t) => {
              const weeks = t.annual_leave_weeks ?? 5;
              const allowedHours = annualAllowanceHours(t.annual_leave_weeks);
              const usedHours = approvedThisYear[t.id] || 0;
              const remainingHours = allowedHours - usedHours;
              const remainingDays = remainingHours / LEAVE_HOURS_PER_DAY;
              const isExhausted = remainingHours <= 0;
              const isLow = !isExhausted && remainingHours <= allowedHours * 0.2;
              const name = t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.email;
              const bg = isExhausted ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
              const fg = isExhausted ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-emerald-700';
              return (
                <div key={t.id} className={`rounded-lg border p-3 ${bg}`}>
                  <p className="text-xs font-medium text-gray-700 truncate" title={name}>{name}</p>
                  <p className={`text-2xl font-bold mt-1 ${fg}`}>{remainingHours}h</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    ≈ {remainingDays.toFixed(1)} j. · solde {weeks} sem.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            {createForm.start_date && createForm.start_date === createForm.end_date && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heure de début (absence partielle)</label>
                  <input
                    type="time"
                    value={createForm.start_time}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, start_time: e.target.value }))}
                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heure de fin</label>
                  <input
                    type="time"
                    value={createForm.end_time}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, end_time: e.target.value }))}
                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500 -mt-2">
                  Laisser vide pour une journée complète. Les heures ne sont possibles que sur un seul jour.
                </p>
              </div>
            )}
            {createForm.start_date && createForm.end_date && (
              <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                📅 {formatLeaveDuration(leaveHours({
                  start_date: createForm.start_date,
                  end_date: createForm.end_date,
                  start_time: createForm.start_date === createForm.end_date ? createForm.start_time || null : null,
                  end_time: createForm.start_date === createForm.end_date ? createForm.end_time || null : null,
                }))} d&apos;absence
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={createForm.leave_type}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, leave_type: e.target.value as LeaveType }))}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LEAVE_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPES[t].emoji} {LEAVE_TYPES[t].label}</option>
                ))}
              </select>
            </div>
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

      {/* Filtres + résumé (onglet Historique) */}
      {tab === 'all' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Collaborateur</label>
              <select
                value={filterTech}
                onChange={(e) => setFilterTech(e.target.value)}
                className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tous</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tous</option>
                {LEAVE_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPES[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Statut</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tous</option>
                <option value="pending">En attente</option>
                <option value="approved">Accepté</option>
                <option value="rejected">Refusé</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Du</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Au</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-gray-100">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs text-gray-600">Vacances prises / en cours</p>
              <p className="text-lg font-bold text-emerald-700">{formatLeaveDuration(summary.takenHours)}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-gray-600">Vacances futures approuvées</p>
              <p className="text-lg font-bold text-blue-700">{formatLeaveDuration(summary.upcomingHours)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-gray-600">Vacances en attente</p>
              <p className="text-lg font-bold text-amber-700">{formatLeaveDuration(summary.pendingHours)}</p>
            </div>
            <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
              <p className="text-xs text-gray-600">Sans solde approuvé</p>
              <p className="text-lg font-bold text-purple-700">{formatLeaveDuration(summary.unpaidHours)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs text-gray-600">Solde {new Date().getFullYear()}</p>
              <p className="text-lg font-bold text-gray-900">
                {summary.balanceHours === null ? '—' : formatLeaveDuration(Math.max(summary.balanceHours, 0))}
              </p>
              {summary.balanceHours === null && (
                <p className="text-[11px] text-gray-400">Choisir un collaborateur</p>
              )}
              {summary.balanceHours !== null && summary.balanceHours < 0 && (
                <p className="text-[11px] text-red-600">Dépassement de {formatLeaveDuration(-summary.balanceHours)}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Durées selon la règle actuelle du logiciel : jours calendaires × {LEAVE_HOURS_PER_DAY} h, heures réelles pour les absences partielles. Seules les vacances (type Congé) sont déduites du solde ; les congés sans solde sont listés séparément pour la paie.
          </p>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {tab === 'pending' ? 'Aucune demande en attente' : 'Aucun congé pour ces filtres'}
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            {tab === 'pending'
              ? 'Les demandes de congé des techniciens apparaîtront ici.'
              : requests.length === 0
                ? 'L\'historique des congés traités apparaîtra ici.'
                : 'Élargissez les filtres pour voir plus de congés.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';
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
                        {req.leave_type && LEAVE_TYPES[req.leave_type] && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${LEAVE_TYPES[req.leave_type].badgeClass}`}>
                            {LEAVE_TYPES[req.leave_type].emoji} {LEAVE_TYPES[req.leave_type].label}
                          </span>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
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
                          {req.start_time && req.end_time && (
                            <span className="text-gray-500">
                              {formatTimeShort(req.start_time)} → {formatTimeShort(req.end_time)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {formatLeaveDuration(leaveHours(req))}
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
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: fr })}
                      </span>
                      <button
                        onClick={() => loadHistory(req.id)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                        title="Historique des modifications"
                      >
                        <History className="w-3.5 h-3.5" />
                        {historyOpenId === req.id ? 'Masquer' : 'Modifications'}
                      </button>
                    </div>
                  </div>

                  {/* Historique des modifications (journal serveur, lecture seule) */}
                  {historyOpenId === req.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {historyLoading ? (
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Chargement de l&apos;historique...
                        </p>
                      ) : historyError ? (
                        <p className="text-sm text-red-600">{historyError}</p>
                      ) : historyRows.length === 0 ? (
                        <p className="text-sm text-gray-500">Aucune modification enregistrée pour ce congé.</p>
                      ) : (
                        <ul className="space-y-2">
                          {historyRows.map((h) => {
                            const author = h.changed_user
                              ? `${h.changed_user.first_name || ''} ${h.changed_user.last_name || ''}`.trim() || h.changed_user.email
                              : 'Système';
                            const changes = h.action === 'update'
                              ? HISTORY_FIELDS.filter(({ key }) => {
                                  const before = h.old_values?.[key] ?? null;
                                  const after = h.new_values?.[key] ?? null;
                                  return JSON.stringify(before) !== JSON.stringify(after);
                                })
                              : [];
                            return (
                              <li key={h.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-medium text-gray-700">
                                  {h.action === 'create' ? 'Création' : h.action === 'delete' ? 'Suppression' : 'Modification'}
                                </span>
                                <span className="text-gray-500">
                                  {' '}par {author} · {format(new Date(h.changed_at), 'd MMM yyyy HH:mm', { locale: fr })}
                                </span>
                                {changes.length > 0 && (
                                  <ul className="mt-1 space-y-0.5 text-gray-600">
                                    {changes.map(({ key, label }) => (
                                      <li key={key}>
                                        {label} : {historyValueLabel(key, h.old_values?.[key])} → {historyValueLabel(key, h.new_values?.[key])}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}

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
                      <p className="text-sm font-medium text-gray-700">Modifier les dates et heures du congé</p>
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
                      {editStartDate && editStartDate === editEndDate && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Heure début (absence partielle)</label>
                            <input
                              type="time"
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Heure fin</label>
                            <input
                              type="time"
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <p className="col-span-2 text-xs text-gray-500 -mt-1">
                            Laisser vide pour une journée complète.
                          </p>
                        </div>
                      )}
                      {editStartDate && editEndDate && editStartDate !== editEndDate && (editStartTime || editEndTime) && (
                        <p className="text-xs text-amber-600">
                          Les heures seront ignorées : elles ne sont possibles que pour une absence sur un seul jour.
                        </p>
                      )}
                      {editStartDate && editEndDate && (
                        <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                          Durée : {formatLeaveDuration(leaveHours({
                            start_date: editStartDate,
                            end_date: editEndDate,
                            start_time: editStartDate === editEndDate ? editStartTime || null : null,
                            end_time: editStartDate === editEndDate ? editEndTime || null : null,
                          }))}
                        </p>
                      )}
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