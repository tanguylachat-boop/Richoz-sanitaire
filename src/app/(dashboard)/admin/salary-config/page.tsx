'use client';

// LOT 8 — Config de rémunération par employé (saisie secrétaire/admin).
// Modèle mixte : mensualisé (salaire fixe) ou horaire (taux × heures). Le taux
// horaire est toujours saisi (il chiffre les éléments variables). Cotisations /
// retenues / ajouts = liste flexible de composants (% du brut OU montant fixe).
// L'app ne connaît AUCUN taux légal : tout est saisi ici.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Wallet, Loader2, Plus, Trash2, Save, Pencil, X } from 'lucide-react';

interface Component {
  id: string;
  label: string;
  direction: string;
  basis: string;
  pct: number | null;
  amount_chf: number | null;
  sort_order: number;
}
interface Config {
  id: string;
  technician_id: string;
  pay_type: string;
  monthly_base_chf: number | null;
  hourly_rate_chf: number;
  overtime_supplement_pct: number;
  components: Component[];
}
interface Tech {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

const techName = (t: Tech) =>
  t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email;

interface FormState {
  pay_type: 'monthly' | 'hourly';
  monthly_base_chf: string;
  hourly_rate_chf: string;
  overtime_supplement_pct: string;
}
const emptyForm: FormState = { pay_type: 'monthly', monthly_base_chf: '', hourly_rate_chf: '', overtime_supplement_pct: '25' };

export default function SalaryConfigPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, [supabase]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const [techRes, cfgRes] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name, email').eq('role', 'technician').eq('is_active', true).order('last_name'),
      supabase.from('employee_salary_config').select('*, components:salary_config_component(*)').eq('is_active', true),
    ]);
    if (techRes.error || cfgRes.error) {
      const e = techRes.error || cfgRes.error;
      console.error('Error loading salary config:', e);
      setLoadError(`Chargement impossible : ${e?.message ?? 'erreur inconnue'} (${e?.code ?? '—'})`);
      setIsLoading(false);
      return;
    }
    setTechs((techRes.data || []) as Tech[]);
    const map: Record<string, Config> = {};
    for (const c of (cfgRes.data || []) as unknown as Config[]) {
      c.components = [...(c.components || [])].sort((a, b) => a.sort_order - b.sort_order);
      map[c.technician_id] = c;
    }
    setConfigs(map);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEditor = (tech: Tech) => {
    const c = configs[tech.id];
    setForm(c
      ? {
          pay_type: c.pay_type === 'hourly' ? 'hourly' : 'monthly',
          monthly_base_chf: c.monthly_base_chf != null ? String(c.monthly_base_chf) : '',
          hourly_rate_chf: String(c.hourly_rate_chf),
          overtime_supplement_pct: String(c.overtime_supplement_pct),
        }
      : emptyForm);
    setEditing(tech.id);
  };

  const saveConfig = async (techId: string) => {
    const rate = Number(form.hourly_rate_chf);
    if (!Number.isFinite(rate) || rate <= 0) { toast.error('Taux horaire requis (> 0), même pour un mensualisé.'); return; }
    const monthly = form.pay_type === 'monthly' ? Number(form.monthly_base_chf) : null;
    if (form.pay_type === 'monthly' && (!Number.isFinite(monthly as number) || (monthly as number) < 0)) {
      toast.error('Salaire mensuel requis pour un mensualisé.'); return;
    }
    const suppl = Number(form.overtime_supplement_pct);
    if (!Number.isFinite(suppl) || suppl < 0) { toast.error('Supplément heures sup. invalide.'); return; }

    setSaving(true);
    try {
      const existing = configs[techId];
      const payload = {
        pay_type: form.pay_type,
        monthly_base_chf: monthly,
        hourly_rate_chf: rate,
        overtime_supplement_pct: suppl,
      };
      const { error } = existing
        ? await supabase.from('employee_salary_config').update(payload).eq('id', existing.id)
        : await supabase.from('employee_salary_config').insert({ technician_id: techId, created_by: userId, ...payload });
      if (error) throw new Error(error.message);
      toast.success('Rémunération enregistrée');
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-blue-600" />
          Configuration de la rémunération
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Par employé : mensualisé ou horaire, taux horaire (chiffre les éléments variables), cotisations et ajouts.
          L&apos;application n&apos;applique que ce qui est saisi ici — aucun taux légal en dur.
        </p>
      </div>

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
      ) : techs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Aucun technicien actif.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {techs.map((tech) => {
            const c = configs[tech.id];
            const isEditing = editing === tech.id;
            return (
              <div key={tech.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{techName(tech)}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {c
                        ? c.pay_type === 'monthly'
                          ? `Mensualisé · ${Number(c.monthly_base_chf).toFixed(2)} CHF/mois · taux ${Number(c.hourly_rate_chf).toFixed(2)} CHF/h · heures sup +${Number(c.overtime_supplement_pct)}%`
                          : `Horaire · ${Number(c.hourly_rate_chf).toFixed(2)} CHF/h · heures sup +${Number(c.overtime_supplement_pct)}%`
                        : 'Non configuré — la paie restera « à configurer »'}
                    </p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => openEditor(tech)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                    >
                      <Pencil className="w-4 h-4" /> {c ? 'Modifier' : 'Configurer'}
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
                    <div className="flex gap-2">
                      {(['monthly', 'hourly'] as const).map((pt) => (
                        <button
                          key={pt}
                          onClick={() => setForm((f) => ({ ...f, pay_type: pt }))}
                          className={`px-3 py-1.5 text-sm rounded-lg border ${form.pay_type === pt ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                        >
                          {pt === 'monthly' ? 'Mensualisé' : 'Horaire'}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {form.pay_type === 'monthly' && (
                        <label className="text-sm">
                          <span className="text-gray-600">Salaire mensuel (CHF)</span>
                          <input type="number" step="0.01" min="0" value={form.monthly_base_chf}
                            onChange={(e) => setForm((f) => ({ ...f, monthly_base_chf: e.target.value }))}
                            className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </label>
                      )}
                      <label className="text-sm">
                        <span className="text-gray-600">Taux horaire (CHF/h)</span>
                        <input type="number" step="0.01" min="0" value={form.hourly_rate_chf}
                          onChange={(e) => setForm((f) => ({ ...f, hourly_rate_chf: e.target.value }))}
                          className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="text-sm">
                        <span className="text-gray-600">Heures sup. supplément (%)</span>
                        <input type="number" step="0.01" min="0" value={form.overtime_supplement_pct}
                          onChange={(e) => setForm((f) => ({ ...f, overtime_supplement_pct: e.target.value }))}
                          className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveConfig(tech.id)} disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                        <X className="w-4 h-4" /> Fermer
                      </button>
                    </div>

                    {c
                      ? <ComponentsEditor supabase={supabase} config={c} onChange={fetchAll} />
                      : <p className="text-xs text-gray-400">Enregistrez la rémunération pour ajouter des cotisations / ajouts.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Éditeur de composants (cotisations / retenues / ajouts) ----
interface ComponentDraft { label: string; direction: 'deduction' | 'addition'; basis: 'pct_gross' | 'fixed'; value: string; }
const emptyComponent: ComponentDraft = { label: '', direction: 'deduction', basis: 'pct_gross', value: '' };

function ComponentsEditor({ supabase, config, onChange }: {
  supabase: ReturnType<typeof createClient>;
  config: Config;
  onChange: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ComponentDraft>(emptyComponent);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const label = draft.label.trim();
    const value = Number(draft.value);
    if (!label) { toast.error('Libellé requis.'); return; }
    if (!Number.isFinite(value) || value < 0) { toast.error('Valeur invalide.'); return; }
    if (draft.basis === 'pct_gross' && value > 100) { toast.error('Un pourcentage ne peut dépasser 100.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('salary_config_component').insert({
        config_id: config.id,
        label,
        direction: draft.direction,
        basis: draft.basis,
        pct: draft.basis === 'pct_gross' ? value : null,
        amount_chf: draft.basis === 'fixed' ? value : null,
        sort_order: (config.components.at(-1)?.sort_order ?? 0) + 1,
      });
      if (error) throw new Error(error.message);
      setDraft(emptyComponent);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ajout impossible');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('salary_config_component').delete().eq('id', id);
      if (error) throw new Error(error.message);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suppression impossible');
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Cotisations / retenues / ajouts</p>
      {config.components.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">Aucun composant. Ajoutez AVS/AC, LPP, LAA, allocations, 13e salaire…</p>
      ) : (
        <ul className="mb-3 divide-y divide-gray-100">
          {config.components.map((comp) => (
            <li key={comp.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">
                <span className={`inline-block w-16 text-xs font-medium ${comp.direction === 'deduction' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {comp.direction === 'deduction' ? 'Retenue' : 'Ajout'}
                </span>
                {comp.label}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-gray-500">
                  {comp.basis === 'pct_gross' ? `${Number(comp.pct)} % du brut` : `${Number(comp.amount_chf).toFixed(2)} CHF`}
                </span>
                <button onClick={() => remove(comp.id)} disabled={busy} className="text-gray-400 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
        <label className="text-xs sm:col-span-2">
          <span className="text-gray-600">Libellé</span>
          <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="AVS/AC, LPP, Allocation…"
            className="mt-1 w-full h-9 px-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="text-xs">
          <span className="text-gray-600">Sens</span>
          <select value={draft.direction} onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value as ComponentDraft['direction'] }))}
            className="mt-1 w-full h-9 px-2 border border-gray-200 rounded-lg bg-white">
            <option value="deduction">Retenue</option>
            <option value="addition">Ajout</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-gray-600">Base</span>
          <select value={draft.basis} onChange={(e) => setDraft((d) => ({ ...d, basis: e.target.value as ComponentDraft['basis'] }))}
            className="mt-1 w-full h-9 px-2 border border-gray-200 rounded-lg bg-white">
            <option value="pct_gross">% du brut</option>
            <option value="fixed">Montant fixe</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-gray-600">{draft.basis === 'pct_gross' ? 'Pourcentage' : 'Montant (CHF)'}</span>
          <div className="flex gap-1">
            <input type="number" step="0.01" min="0" value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              className="mt-1 w-full h-9 px-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={add} disabled={busy} title="Ajouter"
              className="mt-1 inline-flex items-center justify-center h-9 w-9 text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </label>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Le % s&apos;applique au brut déterminant (salaire de base + heures sup + piquet). Le net se recalcule sur les brouillons.
      </p>
    </div>
  );
}
