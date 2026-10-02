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
  included_in_gross: boolean;
  sort_order: number;
}
interface Config {
  id: string;
  technician_id: string;
  pay_type: string;
  monthly_base_chf: number | null;
  hourly_rate_chf: number | null;
  overtime_supplement_pct: number;
  is_source_tax: boolean;
  source_tax_rate: number | null;
  components: Component[];
}
interface Template {
  id: string;
  label: string;
  direction: string;
  basis: string;
  pct: number | null;
  amount_chf: number | null;
  included_in_gross: boolean;
  sort_order: number;
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
  is_source_tax: boolean;
  source_tax_rate: string;
}
const emptyForm: FormState = { pay_type: 'monthly', monthly_base_chf: '', hourly_rate_chf: '', overtime_supplement_pct: '25', is_source_tax: false, source_tax_rate: '' };

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
          hourly_rate_chf: c.hourly_rate_chf != null ? String(c.hourly_rate_chf) : '',
          overtime_supplement_pct: String(c.overtime_supplement_pct),
          is_source_tax: !!c.is_source_tax,
          source_tax_rate: c.source_tax_rate != null ? String(c.source_tax_rate) : '',
        }
      : emptyForm);
    setEditing(tech.id);
  };

  const saveConfig = async (techId: string) => {
    // Taux horaire : requis pour un employé HORAIRE (base = heures × taux) ;
    // optionnel pour un MENSUALISÉ (sert seulement à valoriser heures sup / retards /
    // ponts non payés — laissé vide, ces lignes resteront « à configurer »).
    let rate: number | null = null;
    if (form.hourly_rate_chf.trim() !== '') {
      rate = Number(form.hourly_rate_chf);
      if (!Number.isFinite(rate) || rate <= 0) { toast.error('Taux horaire invalide (doit être > 0).'); return; }
    }
    if (form.pay_type === 'hourly' && rate === null) { toast.error('Taux horaire requis pour un employé payé à l’heure.'); return; }
    const monthly = form.pay_type === 'monthly' ? Number(form.monthly_base_chf) : null;
    if (form.pay_type === 'monthly' && (!Number.isFinite(monthly as number) || (monthly as number) < 0)) {
      toast.error('Salaire mensuel requis pour un mensualisé.'); return;
    }
    const suppl = Number(form.overtime_supplement_pct);
    if (!Number.isFinite(suppl) || suppl < 0) { toast.error('Supplément heures sup. invalide.'); return; }

    let sourceTaxRate: number | null = null;
    if (form.is_source_tax) {
      sourceTaxRate = Number(form.source_tax_rate);
      if (!Number.isFinite(sourceTaxRate) || sourceTaxRate < 0 || sourceTaxRate > 100) {
        toast.error("Taux d'impôt à la source requis (entre 0 et 100 %)."); return;
      }
    }

    setSaving(true);
    try {
      const existing = configs[techId];
      const payload = {
        pay_type: form.pay_type,
        monthly_base_chf: monthly,
        hourly_rate_chf: rate,
        overtime_supplement_pct: suppl,
        is_source_tax: form.is_source_tax,
        source_tax_rate: sourceTaxRate,
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
                        ? (c.pay_type === 'monthly'
                            ? `Mensualisé · ${Number(c.monthly_base_chf).toFixed(2)} CHF/mois${c.hourly_rate_chf != null ? ` · taux ${Number(c.hourly_rate_chf).toFixed(2)} CHF/h` : ''} · heures sup +${Number(c.overtime_supplement_pct)}%`
                            : `Horaire · ${Number(c.hourly_rate_chf).toFixed(2)} CHF/h · heures sup +${Number(c.overtime_supplement_pct)}%`)
                          + (c.is_source_tax ? ` · IS ${Number(c.source_tax_rate)}%` : '')
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Étape 1 — Rémunération</p>
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
                        <span className="text-gray-600">
                          Taux horaire (CHF/h) {form.pay_type === 'monthly' ? <span className="text-gray-400">— optionnel</span> : <span className="text-red-500">*</span>}
                        </span>
                        <input type="number" step="0.01" min="0" value={form.hourly_rate_chf}
                          onChange={(e) => setForm((f) => ({ ...f, hourly_rate_chf: e.target.value }))}
                          placeholder={form.pay_type === 'monthly' ? 'Laisser vide si non utilisé' : ''}
                          className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="text-sm">
                        <span className="text-gray-600">Heures sup. supplément (%)</span>
                        <input type="number" step="0.01" min="0" value={form.overtime_supplement_pct}
                          onChange={(e) => setForm((f) => ({ ...f, overtime_supplement_pct: e.target.value }))}
                          className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    {/* Impôt à la source : soumis (frontalier, etc.) ou non. Retenue calculée
                        sur le brut déterminant, comme les cotisations. */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={form.is_source_tax}
                          onChange={(e) => setForm((f) => ({ ...f, is_source_tax: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm font-medium text-gray-700">Soumis à l&apos;impôt à la source</span>
                      </label>
                      {form.is_source_tax && (
                        <label className="text-sm block max-w-[220px]">
                          <span className="text-gray-600">Taux d&apos;impôt à la source (%)</span>
                          <input type="number" step="0.01" min="0" max="100" value={form.source_tax_rate}
                            onChange={(e) => setForm((f) => ({ ...f, source_tax_rate: e.target.value }))}
                            placeholder="ex. 5.93"
                            className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <span className="text-xs text-gray-400 mt-1 block">Retenue sur le brut déterminant (base + heures sup + piquet + 13e inclus).</span>
                        </label>
                      )}
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
                      : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-semibold text-amber-900">Étape 2 — Déductions de salaire</p>
                          <p className="mt-1 text-sm text-amber-800">
                            Cliquez d&apos;abord sur <strong>« Enregistrer »</strong> ci-dessus. Le bloc des cotisations / retenues
                            et le bouton <strong>« Charger le modèle standard »</strong> (AVS, AC, LPP, LAA…) apparaîtront ici —
                            vous pourrez y ajouter la retenue véhicule, le 13e, etc. (L&apos;impôt à la source est géré par la case ci-dessus.)
                          </p>
                        </div>
                      )}
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
interface ComponentDraft { label: string; direction: 'deduction' | 'addition'; basis: 'pct_gross' | 'fixed'; value: string; included_in_gross: boolean; }
const emptyComponent: ComponentDraft = { label: '', direction: 'deduction', basis: 'pct_gross', value: '', included_in_gross: false };

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
        // « compte dans le brut » n'a de sens que pour une addition fixe (13e).
        included_in_gross: draft.direction === 'addition' && draft.basis === 'fixed' ? draft.included_in_gross : false,
        sort_order: (config.components.at(-1)?.sort_order ?? 0) + 1,
      });
      if (error) throw new Error(error.message);
      setDraft(emptyComponent);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ajout impossible');
    } finally { setBusy(false); }
  };

  // Charge le modèle de cotisations standard → insère les lignes manquantes
  // (par libellé), sans écraser ce que la secrétaire a déjà saisi/modifié.
  const loadTemplate = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from('salary_component_template')
        .select('label, direction, basis, pct, amount_chf, included_in_gross, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      const templates = (data || []) as Template[];
      const existingLabels = new Set(config.components.map((c) => c.label.trim().toLowerCase()));
      const toInsert = templates
        .filter((t) => !existingLabels.has(t.label.trim().toLowerCase()))
        .map((t, i) => ({
          config_id: config.id,
          label: t.label,
          direction: t.direction,
          basis: t.basis,
          pct: t.basis === 'pct_gross' ? t.pct : null,
          amount_chf: t.basis === 'fixed' ? t.amount_chf : null,
          included_in_gross: t.included_in_gross,
          sort_order: (config.components.at(-1)?.sort_order ?? 0) + 1 + i,
        }));
      if (toInsert.length === 0) { toast.info('Le modèle est déjà appliqué (aucune ligne manquante).'); return; }
      const { error: insErr } = await supabase.from('salary_config_component').insert(toInsert);
      if (insErr) throw new Error(insErr.message);
      toast.success(`${toInsert.length} ligne(s) ajoutée(s) depuis le modèle`);
      await onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement du modèle impossible');
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
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <p className="text-sm font-semibold text-gray-800">Étape 2 — Déductions (cotisations / retenues / ajouts)</p>
        <button onClick={loadTemplate} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 shadow-sm">
          <Plus className="w-4 h-4" /> Charger le modèle standard
        </button>
      </div>
      {config.components.length === 0 ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 mb-3">
          <p className="text-sm text-blue-900">
            Aucune déduction pour l&apos;instant. Commence par <strong>« Charger le modèle standard »</strong> (AVS/AI/APG, AC, LPP, LAA, maternité, AANP),
            puis ajuste les taux et ajoute ci-dessous la <strong>retenue véhicule</strong> (montant fixe) ou le <strong>13e</strong> (ajout fixe « dans le brut »).
          </p>
        </div>
      ) : (
        <ul className="mb-3 divide-y divide-gray-100">
          {config.components.map((comp) => (
            <li key={comp.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">
                <span className={`inline-block w-16 text-xs font-medium ${comp.direction === 'deduction' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {comp.direction === 'deduction' ? 'Retenue' : 'Ajout'}
                </span>
                {comp.label}
                {comp.included_in_gross && (
                  <span className="ml-2 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">dans le brut</span>
                )}
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
            <input type="number" step={draft.basis === 'pct_gross' ? '0.001' : '0.01'} min="0" value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              className="mt-1 w-full h-9 px-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={add} disabled={busy} title="Ajouter"
              className="mt-1 inline-flex items-center justify-center h-9 w-9 text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </label>
      </div>
      {/* 13e mensualisé : addition FIXE à inclure dans le brut déterminant pour que
          les cotisations (AVS, IS…) tombent juste, comme sur le vrai bulletin. */}
      {draft.direction === 'addition' && draft.basis === 'fixed' && (
        <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
          <input type="checkbox" checked={draft.included_in_gross}
            onChange={(e) => setDraft((d) => ({ ...d, included_in_gross: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-gray-600">Compte dans le brut déterminant des cotisations (ex. 13e salaire)</span>
        </label>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Le % s&apos;applique au brut déterminant (salaire de base + heures sup + piquet + additions marquées « dans le brut »). Le net se recalcule sur les brouillons.
      </p>
    </div>
  );
}
