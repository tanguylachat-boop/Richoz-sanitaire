'use client';

// LOT B — Ajout d'un jour férié ou d'un PONT depuis le calendrier (staff).
// L'effet paie est réalisé par les systèmes existants et testés :
//   * « non payé » → congé sans_solde approuvé (→ autosync → retenue de paie).
//   * « sur congés » → congé 'conge' approuvé (→ décompté du solde).
//   * « payé »      → simple marqueur (mensualisés déjà payés).
// Le marqueur calendrier est une (ou plusieurs) ligne(s) public_holidays.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, PartyPopper } from 'lucide-react';
import { eachDayOfInterval, format } from 'date-fns';

interface Tech {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

type Kind = 'ferie' | 'pont';
type PayEffect = 'paid' | 'unpaid' | 'leave';

const techName = (t: Tech) =>
  t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email;

export function HolidayPontModal({
  isOpen,
  onClose,
  onSuccess,
  defaultDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultDate?: string; // 'yyyy-MM-dd'
}) {
  const supabase = useMemo(() => createClient(), []);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('pont');
  const [payEffect, setPayEffect] = useState<PayEffect>('paid');
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState(defaultDate || '');
  const [endDate, setEndDate] = useState(defaultDate || '');
  const [allTechs, setAllTechs] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStartDate(defaultDate || '');
    setEndDate(defaultDate || '');
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
    supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'technician')
      .eq('is_active', true)
      .order('last_name')
      .then(({ data }) => { if (data) setTechs(data as Tech[]); });
  }, [isOpen, defaultDate, supabase]);

  const toggleTech = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const submit = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { toast.error('Libellé requis (ex. « Pont de l’Ascension »).'); return; }
    if (!startDate || !endDate) { toast.error('Dates requises.'); return; }
    if (endDate < startDate) { toast.error('La date de fin doit être après la date de début.'); return; }

    // Techniciens concernés : « tous » = tous les actifs ; sinon la sélection.
    const targetTechs = allTechs ? techs.map((t) => t.id) : Array.from(selected);
    if (payEffect !== 'paid' && targetTechs.length === 0) {
      toast.error('Sélectionnez au moins un technicien pour un effet paie.');
      return;
    }

    const days = eachDayOfInterval({
      start: new Date(startDate + 'T00:00:00'),
      end: new Date(endDate + 'T00:00:00'),
    }).map((d) => format(d, 'yyyy-MM-dd'));

    setSaving(true);
    try {
      // 1) Marqueur(s) calendrier : une ligne public_holidays par jour.
      const holidayRows = days.map((d) => ({
        holiday_date: d,
        label: trimmedLabel,
        kind,
        pay_effect: payEffect,
        is_paid: payEffect !== 'unpaid',
        created_by: userId,
      }));
      const { data: inserted, error: hErr } = await supabase
        .from('public_holidays')
        .insert(holidayRows)
        .select('id');
      if (hErr) throw new Error(hErr.message);

      // 2) Périmètre (si pas « tous ») : lie chaque jour aux techniciens choisis.
      if (!allTechs && inserted && selected.size > 0) {
        const links = (inserted as { id: string }[]).flatMap((h) =>
          Array.from(selected).map((tid) => ({ holiday_id: h.id, technician_id: tid })),
        );
        const { error: lErr } = await supabase.from('public_holiday_technicians').insert(links);
        if (lErr) throw new Error(lErr.message);
      }

      // 3) Effet paie via les congés (systèmes existants et testés).
      let leaveFailures = 0;
      if (payEffect === 'unpaid' || payEffect === 'leave') {
        const leaveType = payEffect === 'unpaid' ? 'sans_solde' : 'conge';
        for (const tid of targetTechs) {
          const { error: cErr } = await supabase.from('leave_requests').insert({
            technician_id: tid,
            start_date: startDate,
            end_date: endDate,
            status: 'approved',
            leave_type: leaveType,
            reason: `${kind === 'pont' ? 'Pont' : 'Férié'} : ${trimmedLabel}`,
          });
          if (cErr) leaveFailures += 1;
        }
      }

      if (leaveFailures > 0) {
        toast.warning(
          `Marqueur ajouté, mais ${leaveFailures} congé(s) non créé(s) (chevauchement probable) — à vérifier manuellement.`,
        );
      } else {
        toast.success(kind === 'pont' ? 'Pont ajouté' : 'Férié ajouté');
      }
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ajout impossible');
    } finally {
      setSaving(false);
    }
  };

  const btn = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-lg border ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un férié / pont" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {(['ferie', 'pont'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={btn(kind === k)}>
              {k === 'ferie' ? '🎉 Férié' : '🌉 Pont'}
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Libellé</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. Pont de l’Ascension"
            className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-gray-600">Du</span>
            <input type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); if (!endDate || e.target.value > endDate) setEndDate(e.target.value); }}
              className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Au</span>
            <input type="date" value={endDate} min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
        </div>

        <div>
          <span className="text-sm text-gray-600">Effet sur la paie</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPayEffect('paid')} className={btn(payEffect === 'paid')}>Payé (aucun impact)</button>
            <button type="button" onClick={() => setPayEffect('unpaid')} className={btn(payEffect === 'unpaid')}>Non payé (retenue)</button>
            <button type="button" onClick={() => setPayEffect('leave')} className={btn(payEffect === 'leave')}>Sur congés</button>
          </div>
          {payEffect === 'unpaid' && (
            <p className="text-xs text-amber-700 mt-1.5">Crée un congé sans solde par technicien → retenue à valider avant la paie.</p>
          )}
          {payEffect === 'leave' && (
            <p className="text-xs text-amber-700 mt-1.5">Décompté du solde de congés des techniciens concernés.</p>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allTechs} onChange={(e) => setAllTechs(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-gray-700 font-medium">Tous les techniciens</span>
          </label>
          {!allTechs && (
            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {techs.length === 0 ? (
                <p className="p-3 text-xs text-gray-400">Aucun technicien actif.</p>
              ) : techs.map((t) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleTech(t.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-gray-700">{techName(t)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
          <button type="button" onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PartyPopper className="w-4 h-4" />}
            Ajouter
          </button>
        </div>
      </div>
    </Modal>
  );
}
