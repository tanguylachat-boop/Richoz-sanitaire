'use client';

// LOT 6A — saisie des éléments variables de salaire.
// Aucune règle salariale inventée : les traitements inconnus restent marqués
// « Règle à configurer » et aucun montant n'est calculé côté client — les
// montants/durées dérivés sont imposés par les triggers serveur (00031).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Wallet,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { formatLeaveDuration } from '@/lib/leave-duration';

type ItemType = 'sans_solde' | 'retard' | 'amende_parc' | 'heures_sup' | 'piquet';

const ITEM_TYPES: Record<ItemType, { label: string; emoji: string; badgeClass: string }> = {
  sans_solde: { label: 'Sans solde', emoji: '🚫', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300' },
  retard: { label: 'Retard', emoji: '⏰', badgeClass: 'bg-orange-100 text-orange-800 border-orange-300' },
  amende_parc: { label: 'Amende parking', emoji: '🅿️', badgeClass: 'bg-red-100 text-red-800 border-red-300' },
  heures_sup: { label: 'Heures sup.', emoji: '➕', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  piquet: { label: 'Piquet', emoji: '📞', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};
const ITEM_TYPE_ORDER: ItemType[] = ['piquet', 'heures_sup', 'sans_solde', 'retard', 'amende_parc'];

const PAYROLL_BADGES: Record<string, { label: string; className: string }> = {
  requires_rule: { label: 'Règle à configurer', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  not_processed: { label: 'Prêt pour paie', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  included: { label: 'Intégré paie', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  excluded: { label: 'Exclu paie', className: 'bg-gray-100 text-gray-500 border-gray-300' },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Validé', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Refusé', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulé', className: 'bg-gray-100 text-gray-500' },
};

const COMPENSATION_LABELS: Record<string, string> = {
  paid: 'Payé',
  recovered: 'Récupéré',
  pending_rule: 'Selon règle à valider',
};

interface SalaryItem {
  id: string;
  technician_id: string;
  item_type: ItemType;
  item_date: string;
  period_start: string | null;
  period_end: string | null;
  minutes: number | null;
  amount_chf: number | null;
  expected_time: string | null;
  actual_time: string | null;
  origin: string;
  source_id: string | null;
  reason: string | null;
  justification: string | null;
  compensation_mode: string | null;
  status: string;
  payroll_status: string;
  review_note: string | null;
  created_at: string;
  technician?: { first_name: string | null; last_name: string | null; email: string } | null;
}

interface TechnicianOption { id: string; first_name: string | null; last_name: string | null; email: string }
interface UnpaidLeaveOption { id: string; technician_id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null }
interface PiquetWeekOption { id: string; technician_id: string; start_date: string; end_date: string }

function techName(t: { first_name: string | null; last_name: string | null; email: string } | null | undefined): string {
  if (!t) return 'Inconnu';
  return t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email;
}

function serverErrorMessage(message: string): string {
  const known = message.match(/(PIQUET_SEMAINE_INCOMPLETE|MAUVAIS_COLLABORATEUR|SOURCE_INVALIDE|SOURCE_INTROUVABLE|RETARD_INVALIDE|AMENDE_INVALIDE|HEURES_SUP_INVALIDES|PAIE_FIGEE|PERIODE_HORS_SOURCE):\s*(.+)/);
  if (known) return known[2];
  if (message.includes('duplicate key')) return 'Cette source est déjà consommée par un autre élément (pas de double décompte).';
  return 'Erreur lors de l’enregistrement';
}

export default function SalaryItemsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<SalaryItem[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [unpaidLeaves, setUnpaidLeaves] = useState<UnpaidLeaveOption[]>([]);
  const [piquetWeeks, setPiquetWeeks] = useState<PiquetWeekOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [filterTech, setFilterTech] = useState('');
  const [filterType, setFilterType] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    item_type: 'piquet' as ItemType,
    technician_id: '',
    item_date: '',
    expected_time: '',
    actual_time: '',
    amount_chf: '',
    minutes: '',
    compensation_mode: 'pending_rule',
    source_id: '',
    reason: '',
    justification: '',
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, [supabase]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
    const monthEnd = format(monthEndDate, 'yyyy-MM-dd');
    try {
      let itemsQuery = supabase
        .from('salary_items')
        .select('*, technician:users!salary_items_technician_id_fkey(first_name, last_name, email)')
        .gte('item_date', monthStart)
        .lte('item_date', monthEnd)
        .order('item_date', { ascending: false });
      if (filterTech) itemsQuery = itemsQuery.eq('technician_id', filterTech);
      if (filterType) itemsQuery = itemsQuery.eq('item_type', filterType);

      const [itemsRes, techRes, unpaidRes, piquetRes, consumedRes] = await Promise.all([
        itemsQuery,
        supabase.from('users').select('id, first_name, last_name, email').eq('role', 'technician').eq('is_active', true).order('last_name'),
        supabase.from('leave_requests').select('id, technician_id, start_date, end_date, start_time, end_time').eq('leave_type', 'sans_solde').eq('status', 'approved').order('start_date', { ascending: false }).limit(100),
        supabase.from('piquet_schedule').select('id, technician_id, start_date, end_date').order('start_date', { ascending: false }).limit(100),
        supabase.from('salary_items').select('source_id, status').not('source_id', 'is', null),
      ]);
      const firstError = itemsRes.error || techRes.error || unpaidRes.error || piquetRes.error || consumedRes.error;
      if (firstError) throw new Error(firstError.message);

      const consumed = new Set(
        (consumedRes.data || [])
          .filter((c) => c.status !== 'cancelled' && c.status !== 'rejected')
          .map((c) => c.source_id as string)
      );
      setItems((itemsRes.data || []) as unknown as SalaryItem[]);
      setTechnicians((techRes.data || []) as TechnicianOption[]);
      setUnpaidLeaves(((unpaidRes.data || []) as UnpaidLeaveOption[]).filter((l) => !consumed.has(l.id)));
      setPiquetWeeks(((piquetRes.data || []) as PiquetWeekOption[]).filter((w) => !consumed.has(w.id)));
    } catch (error) {
      console.error('Error loading salary items:', error);
      setLoadError('Impossible de charger les éléments de salaire. Vérifiez votre connexion et vos droits, puis réessayez.');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, month, filterTech, filterType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const weekDays = (w: PiquetWeekOption) =>
    Math.round((Date.parse(w.end_date) - Date.parse(w.start_date)) / 86400000) + 1;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const usesSource = form.item_type === 'sans_solde' || form.item_type === 'piquet';
    if (usesSource && !form.source_id) {
      toast.error(form.item_type === 'piquet' ? 'Sélectionne une semaine de piquet planifiée' : 'Sélectionne un congé sans solde approuvé');
      return;
    }
    if (!usesSource && !form.technician_id) {
      toast.error('Sélectionne un collaborateur');
      return;
    }
    if (!usesSource && !form.item_date) {
      toast.error('Date obligatoire');
      return;
    }

    setIsCreating(true);
    try {
      let technicianId = form.technician_id;
      if (form.item_type === 'sans_solde') {
        technicianId = unpaidLeaves.find((l) => l.id === form.source_id)?.technician_id || '';
      } else if (form.item_type === 'piquet') {
        technicianId = piquetWeeks.find((w) => w.id === form.source_id)?.technician_id || '';
      }
      const { error } = await supabase.from('salary_items').insert({
        technician_id: technicianId,
        item_type: form.item_type,
        item_date: usesSource ? undefined : form.item_date,
        origin: form.item_type === 'sans_solde' ? 'leave_request' : form.item_type === 'piquet' ? 'piquet_schedule' : 'manual',
        source_id: usesSource ? form.source_id : null,
        expected_time: form.item_type === 'retard' ? form.expected_time || null : null,
        actual_time: form.item_type === 'retard' ? form.actual_time || null : null,
        amount_chf: form.item_type === 'amende_parc' ? Number(form.amount_chf) || null : null,
        minutes: form.item_type === 'heures_sup' ? Number(form.minutes) || null : null,
        compensation_mode: form.item_type === 'heures_sup' ? form.compensation_mode : null,
        reason: form.reason || null,
        justification: form.justification || null,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
      toast.success('Élément enregistré');
      setForm((prev) => ({ ...prev, item_date: '', expected_time: '', actual_time: '', amount_chf: '', minutes: '', source_id: '', reason: '', justification: '' }));
      setShowForm(false);
      fetchAll();
    } catch (error) {
      console.error('Error creating salary item:', error);
      toast.error(serverErrorMessage(error instanceof Error ? error.message : ''));
    } finally {
      setIsCreating(false);
    }
  };

  const changeStatus = async (item: SalaryItem, status: 'approved' | 'rejected' | 'cancelled') => {
    if (!userId) return;
    setProcessingId(item.id);
    try {
      const { error } = await supabase.from('salary_items').update({
        status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', item.id);
      if (error) throw new Error(error.message);
      toast.success(status === 'approved' ? 'Élément validé' : status === 'rejected' ? 'Élément refusé' : 'Élément annulé');
      fetchAll();
    } catch (error) {
      console.error('Error updating salary item:', error);
      toast.error(serverErrorMessage(error instanceof Error ? error.message : ''));
    } finally {
      setProcessingId(null);
    }
  };

  const totals = useMemo(() => {
    const active = items.filter((i) => i.status === 'approved');
    const piquetChf = active.filter((i) => i.item_type === 'piquet').reduce((s, i) => s + Number(i.amount_chf || 0), 0);
    const amendesChf = active.filter((i) => i.item_type === 'amende_parc').reduce((s, i) => s + Number(i.amount_chf || 0), 0);
    const heuresSupMin = active.filter((i) => i.item_type === 'heures_sup').reduce((s, i) => s + (i.minutes || 0), 0);
    const sansSoldeMin = active.filter((i) => i.item_type === 'sans_solde').reduce((s, i) => s + (i.minutes || 0), 0);
    const retardMin = active.filter((i) => i.item_type === 'retard').reduce((s, i) => s + (i.minutes || 0), 0);
    return { piquetChf, amendesChf, heuresSupMin, sansSoldeMin, retardMin };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            Éléments de salaire
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Saisie et validation — l&apos;intégration en paie reste préparée, aucune retenue automatique.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouvel élément
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mois</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full h-9 px-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Collaborateur</label>
          <select
            value={filterTech}
            onChange={(e) => setFilterTech(e.target.value)}
            className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tous</option>
            {technicians.map((t) => <option key={t.id} value={t.id}>{techName(t)}</option>)}
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
            {ITEM_TYPE_ORDER.map((t) => <option key={t} value={t}>{ITEM_TYPES[t].label}</option>)}
          </select>
        </div>
      </div>

      {/* Totaux du mois (éléments validés) */}
      {!isLoading && !loadError && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs text-gray-600">📞 Piquet validé</p>
            <p className="text-lg font-bold text-emerald-700">{totals.piquetChf.toFixed(2)} CHF</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-gray-600">➕ Heures sup. validées</p>
            <p className="text-lg font-bold text-blue-700">{formatLeaveDuration(totals.heuresSupMin / 60)}</p>
            <p className="text-[11px] text-amber-700">Taux à configurer</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs text-gray-600">🚫 Sans solde validé</p>
            <p className="text-lg font-bold text-purple-700">{formatLeaveDuration(totals.sansSoldeMin / 60)}</p>
            <p className="text-[11px] text-amber-700">Base de calcul à valider</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <p className="text-xs text-gray-600">⏰ Retards validés</p>
            <p className="text-lg font-bold text-orange-700">{totals.retardMin} min</p>
            <p className="text-[11px] text-amber-700">Effet salarial à valider</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-gray-600">🅿️ Amendes saisies</p>
            <p className="text-lg font-bold text-red-700">{totals.amendesChf.toFixed(2)} CHF</p>
            <p className="text-[11px] text-amber-700">Imputabilité à examiner</p>
          </div>
        </div>
      )}

      {/* Formulaire de création */}
      {showForm && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Nouvel élément de salaire
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={form.item_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, item_type: e.target.value as ItemType, source_id: '' }))}
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ITEM_TYPE_ORDER.map((t) => <option key={t} value={t}>{ITEM_TYPES[t].emoji} {ITEM_TYPES[t].label}</option>)}
                </select>
              </div>

              {form.item_type === 'piquet' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Semaine planifiée *</label>
                  <select
                    value={form.source_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, source_id: e.target.value }))}
                    className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Planification piquet --</option>
                    {piquetWeeks.map((w) => {
                      const days = weekDays(w);
                      const tech = technicians.find((t) => t.id === w.technician_id);
                      return (
                        <option key={w.id} value={w.id} disabled={days % 7 !== 0}>
                          {techName(tech)} · {format(new Date(w.start_date + 'T00:00:00'), 'd MMM', { locale: fr })} → {format(new Date(w.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
                          {days % 7 === 0 ? ` (${days / 7} sem. = ${150 * (days / 7)} CHF)` : ` (${days} j — prorata à valider)`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : form.item_type === 'sans_solde' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Congé sans solde approuvé *</label>
                  <select
                    value={form.source_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, source_id: e.target.value }))}
                    className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Congé approuvé non consommé --</option>
                    {unpaidLeaves.map((l) => {
                      const tech = technicians.find((t) => t.id === l.technician_id);
                      return (
                        <option key={l.id} value={l.id}>
                          {techName(tech)} · {format(new Date(l.start_date + 'T00:00:00'), 'd MMM', { locale: fr })} → {format(new Date(l.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
                          {l.start_time && l.end_time ? ` (${l.start_time.slice(0, 5)}–${l.end_time.slice(0, 5)})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Collaborateur *</label>
                  <select
                    value={form.technician_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, technician_id: e.target.value }))}
                    className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Sélectionner --</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{techName(t)}</option>)}
                  </select>
                </div>
              )}
            </div>

            {form.item_type !== 'piquet' && form.item_type !== 'sans_solde' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.item_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, item_date: e.target.value }))}
                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {form.item_type === 'retard' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Attendu *</label>
                      <input
                        type="time"
                        value={form.expected_time}
                        onChange={(e) => setForm((prev) => ({ ...prev, expected_time: e.target.value }))}
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Arrivée *</label>
                      <input
                        type="time"
                        value={form.actual_time}
                        onChange={(e) => setForm((prev) => ({ ...prev, actual_time: e.target.value }))}
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
                {form.item_type === 'amende_parc' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Montant CHF *</label>
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={form.amount_chf}
                      onChange={(e) => setForm((prev) => ({ ...prev, amount_chf: e.target.value }))}
                      className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                {form.item_type === 'heures_sup' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Minutes *</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.minutes}
                        onChange={(e) => setForm((prev) => ({ ...prev, minutes: e.target.value }))}
                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Compensation</label>
                      <select
                        value={form.compensation_mode}
                        onChange={(e) => setForm((prev) => ({ ...prev, compensation_mode: e.target.value }))}
                        className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="pending_rule">Selon règle à valider</option>
                        <option value="paid">Payé</option>
                        <option value="recovered">Récupéré</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Justificatif / récupération</label>
                <input
                  type="text"
                  value={form.justification}
                  onChange={(e) => setForm((prev) => ({ ...prev, justification: e.target.value }))}
                  placeholder="Référence du justificatif, modalité de récupération..."
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              La saisie ne déclenche aucune retenue. Piquet : 150 CHF par semaine complète (règle client) ; les autres traitements salariaux restent « à configurer » tant que les règles ne sont pas validées.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
                {isCreating ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button onClick={fetchAll} className="mt-2 underline">Réessayer</button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Aucun élément pour ce mois et ces filtres.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const typeInfo = ITEM_TYPES[item.item_type];
            const statusBadge = STATUS_BADGES[item.status] || STATUS_BADGES.pending;
            const payrollBadge = PAYROLL_BADGES[item.payroll_status] || PAYROLL_BADGES.requires_rule;
            const isProcessing = processingId === item.id;
            const frozen = item.payroll_status === 'included';
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${typeInfo.badgeClass}`}>
                        {typeInfo.emoji} {typeInfo.label}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.className}`}>{statusBadge.label}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${payrollBadge.className}`}>{payrollBadge.label}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {techName(item.technician)} ·{' '}
                      {item.period_start && item.period_end && item.period_start !== item.period_end
                        ? `${format(new Date(item.period_start + 'T00:00:00'), 'd MMM', { locale: fr })} → ${format(new Date(item.period_end + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}`
                        : format(new Date(item.item_date + 'T00:00:00'), 'd MMMM yyyy', { locale: fr })}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {item.item_type === 'piquet' && `${Number(item.amount_chf || 0).toFixed(2)} CHF`}
                      {item.item_type === 'amende_parc' && `${Number(item.amount_chf || 0).toFixed(2)} CHF`}
                      {item.item_type === 'heures_sup' && `${formatLeaveDuration((item.minutes || 0) / 60)}${item.compensation_mode ? ` · ${COMPENSATION_LABELS[item.compensation_mode] || item.compensation_mode}` : ''}`}
                      {item.item_type === 'sans_solde' && `${formatLeaveDuration((item.minutes || 0) / 60)} sans solde`}
                      {item.item_type === 'retard' && `${item.minutes || 0} min (${(item.expected_time || '').slice(0, 5)} → ${(item.actual_time || '').slice(0, 5)})`}
                    </p>
                    {item.reason && <p className="text-xs text-gray-500 mt-1">Motif : {item.reason}</p>}
                    {item.justification && <p className="text-xs text-gray-500">Justificatif : {item.justification}</p>}
                    {item.review_note && <p className="text-xs text-gray-500">Note : {item.review_note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && !frozen && (
                      <>
                        <button
                          onClick={() => changeStatus(item, 'rejected')}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" /> Refuser
                        </button>
                        <button
                          onClick={() => changeStatus(item, 'approved')}
                          disabled={isProcessing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Valider
                        </button>
                      </>
                    )}
                    {(item.status === 'approved' || item.status === 'pending') && !frozen && (
                      <button
                        onClick={() => changeStatus(item, 'cancelled')}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
                        title="Annuler (la source redevient consommable)"
                      >
                        <Trash2 className="w-4 h-4" /> Annuler
                      </button>
                    )}
                    {frozen && <span className="text-xs text-gray-400">Figé (intégré paie)</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
