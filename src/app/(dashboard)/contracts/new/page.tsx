'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, FileSignature, Search } from 'lucide-react';
import { format, addDays, addMonths, addYears } from 'date-fns';

type Frequency = 'annuel' | 'biannuel' | 'trimestriel' | 'mensuel' | 'custom';

interface Regie { id: string; name: string; }
interface ClientOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  address: string | null;
}

function nextDueFrom(startDate: string, frequency: Frequency, customDays: number): string {
  const d = new Date(startDate + 'T00:00:00');
  let next: Date;
  switch (frequency) {
    case 'annuel': next = addYears(d, 1); break;
    case 'biannuel': next = addMonths(d, 6); break;
    case 'trimestriel': next = addMonths(d, 3); break;
    case 'mensuel': next = addMonths(d, 1); break;
    case 'custom': next = addDays(d, customDays); break;
  }
  return format(next, 'yyyy-MM-dd');
}

export default function NewContractPage() {
  const router = useRouter();
  const supabase = createClient();

  const [regies, setRegies] = useState<Regie[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    equipment: '',
    address: '',
    regie_id: '',
    frequency: 'annuel' as Frequency,
    custom_interval_days: 90,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    amount_per_visit: 0,
    estimated_duration_minutes: 60,
    reminder_days_before: 14,
    auto_generate_intervention: true,
    notes: '',
  });

  useEffect(() => {
    supabase.from('regies').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setRegies(data as Regie[]);
    });
  }, [supabase]);

  useEffect(() => {
    if (!clientQuery || clientQuery.length < 2 || selectedClient) {
      setClientSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const q = clientQuery.trim();
      const filters = [`last_name.ilike.%${q}%`, `first_name.ilike.%${q}%`, `company_name.ilike.%${q}%`];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('clients')
        .select('id, first_name, last_name, company_name, phone, address')
        .or(filters.join(','))
        .limit(6);
      setClientSuggestions((data as ClientOption[]) || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [clientQuery, selectedClient, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      toast.error('Titre obligatoire');
      return;
    }
    if (!form.amount_per_visit || form.amount_per_visit <= 0) {
      toast.error('Montant par visite obligatoire (> 0 CHF)');
      return;
    }
    setIsSaving(true);
    try {
      // Auto-create client if a name was typed but none selected
      let finalClientId: string | null = selectedClient?.id || null;
      if (!finalClientId && !form.regie_id && clientQuery.trim().length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cid, error: rpcErr } = await (supabase as any).rpc('match_or_create_client', {
          p_phone: null,
          p_name: clientQuery.trim(),
          p_address: form.address || null,
          p_email: null,
          p_regie_id: null,
          p_client_type: 'particulier',
        });
        if (rpcErr) {
          console.error('match_or_create_client error:', rpcErr);
          toast.error(`Impossible de créer le client : ${rpcErr.message}`);
          setIsSaving(false);
          return;
        }
        if (cid) finalClientId = cid as string;
      }

      const nextDue = nextDueFrom(form.start_date, form.frequency, form.custom_interval_days);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('maintenance_contracts')
        .insert({
          title: form.title,
          description: form.description || null,
          equipment: form.equipment || null,
          address: form.address || selectedClient?.address || null,
          client_id: finalClientId,
          regie_id: form.regie_id || null,
          frequency: form.frequency,
          custom_interval_days: form.frequency === 'custom' ? form.custom_interval_days : null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          next_due_date: nextDue,
          amount_per_visit: form.amount_per_visit,
          estimated_duration_minutes: form.estimated_duration_minutes,
          reminder_days_before: form.reminder_days_before,
          auto_generate_intervention: form.auto_generate_intervention,
          notes: form.notes || null,
          status: 'active',
        })
        .select('id')
        .single();
      if (error) {
        console.error('Contract insert error:', error);
        toast.error(`Erreur création : ${error.message}`);
        setIsSaving(false);
        return;
      }

      const newContractId = (data as { id: string }).id;

      // Immediately generate the first intervention so it shows up in the calendar
      if (form.auto_generate_intervention) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: ivErr } = await (supabase as any).from('interventions').insert({
          title: form.title,
          description: form.description || null,
          address: form.address || selectedClient?.address || '',
          date_planned: new Date(nextDue + 'T09:00:00').toISOString(),
          estimated_duration_minutes: form.estimated_duration_minutes,
          status: 'nouveau',
          priority: 0,
          regie_id: form.regie_id || null,
          client_id: finalClientId,
          source_type: 'maintenance_contract',
          intervention_type: 'depannage',
          maintenance_contract_id: newContractId,
        });
        if (ivErr) {
          console.warn('Could not auto-generate intervention:', ivErr);
          toast.success('Contrat créé (génération intervention échouée — génère manuellement)');
        } else {
          toast.success(`Contrat créé — intervention planifiée le ${nextDue}`);
        }
      } else {
        toast.success('Contrat créé');
      }

      router.push(`/contracts/${newContractId}`);
    } catch (err) {
      console.error(err);
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
      setIsSaving(false);
    }
  };

  const ic = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/contracts" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Retour aux contrats
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <FileSignature className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Nouveau contrat de maintenance</h1>
            <p className="text-sm text-gray-500">Génération automatique des interventions récurrentes</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={ic} placeholder="Ex: Entretien adoucisseur annuel" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Équipement</label>
            <input type="text" value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} className={ic} placeholder="Ex: Adoucisseur BWT Perla, Chauffe-eau Cipag 200L" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Client (optionnel — tape un nom pour créer)</label>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {selectedClient.company_name || [selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(' ')}
                    </div>
                    <div className="text-xs text-gray-500">{selectedClient.phone || ''} · {selectedClient.address || ''}</div>
                  </div>
                  <button type="button" onClick={() => { setSelectedClient(null); setClientQuery(''); }} className="text-xs text-red-600 hover:underline">Changer</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} className={`${ic} pl-9`} placeholder="Rechercher un client..." />
                  {clientSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                      {clientSuggestions.map((c) => {
                        const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ');
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => { setSelectedClient(c); setClientQuery(name); }}
                            className="w-full text-left px-3 py-2 hover:bg-violet-50 border-b border-gray-100 last:border-0"
                          >
                            <div className="font-medium text-sm text-gray-900">{name}</div>
                            <div className="text-xs text-gray-500">{c.phone || '—'} · {c.address || '—'}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">OU Régie (facturation régie)</label>
              <select value={form.regie_id} onChange={(e) => setForm({ ...form, regie_id: e.target.value })} className={`${ic} bg-white`}>
                <option value="">— Aucune —</option>
                {regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse d&apos;intervention</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={ic} placeholder="Si différent du client" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fréquence *</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })} className={`${ic} bg-white`}>
                <option value="annuel">Annuel</option>
                <option value="biannuel">Semestriel</option>
                <option value="trimestriel">Trimestriel</option>
                <option value="mensuel">Mensuel</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
            {form.frequency === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intervalle (jours)</label>
                <input type="number" min="1" value={form.custom_interval_days} onChange={(e) => setForm({ ...form, custom_interval_days: parseInt(e.target.value) || 90 })} className={ic} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
              <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin (optionnel)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant par visite (CHF) *</label>
              <input type="number" required min="0" step="0.01" value={form.amount_per_visit} onChange={(e) => setForm({ ...form, amount_per_visit: parseFloat(e.target.value) || 0 })} className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée estimée (min)</label>
              <input type="number" min="15" step="15" value={form.estimated_duration_minutes} onChange={(e) => setForm({ ...form, estimated_duration_minutes: parseInt(e.target.value) || 60 })} className={ic} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rappel anticipé (jours avant)</label>
              <input type="number" min="0" value={form.reminder_days_before} onChange={(e) => setForm({ ...form, reminder_days_before: parseInt(e.target.value) || 0 })} className={ic} />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 cursor-pointer h-10">
                <input
                  type="checkbox"
                  checked={form.auto_generate_intervention}
                  onChange={(e) => setForm({ ...form, auto_generate_intervention: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-gray-700">Générer automatiquement l&apos;intervention</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description / notes internes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
          </div>

          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">
            📅 Prochaine échéance calculée : <strong>{nextDueFrom(form.start_date, form.frequency, form.custom_interval_days)}</strong>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Link href="/contracts" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</Link>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Créer le contrat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
