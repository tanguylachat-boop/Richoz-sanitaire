'use client';

// LOTS 6B/6C — consultation et validation des brouillons de paie.
// Le brouillon liste les éléments variables approuvés (fenêtre 26 → 25,
// interprétation à confirmer) ; tout paramètre absent apparaît « à
// configurer » et la clôture est refusée tant qu'il en reste. Aucune
// génération automatique n'est planifiée : le déclenchement se fait ici ou
// par la route cron (non activée).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText, Loader2, PlayCircle, CheckCircle, AlertTriangle, Lock } from 'lucide-react';

interface DraftLine {
  id: string;
  line_type: string;
  salary_item_id: string | null;
  label: string;
  minutes: number | null;
  amount_chf: number | null;
  amount_state: string;
}

interface Draft {
  id: string;
  technician_id: string;
  period_start: string;
  period_end: string;
  version: number;
  status: string;
  is_regularization: boolean;
  generated_at: string;
  notes: string | null;
  technician?: { first_name: string | null; last_name: string | null; email: string } | null;
  lines: DraftLine[];
}

function techName(t: Draft['technician']): string {
  if (!t) return 'Inconnu';
  return t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email;
}

// Fiche du 25 : pour un mois M sélectionné, fenêtre 26 (M-1) → 25 (M).
function periodForMonth(month: string): { reference: string; start: string; end: string } {
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const end = `${month}-25`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  return { reference: end, start: `${prev}-26`, end };
}

export default function PayrollDraftsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, [supabase]);

  const period = useMemo(() => periodForMonth(month), [month]);

  const fetchDrafts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('payroll_drafts')
      .select('*, technician:users!payroll_drafts_technician_id_fkey(first_name, last_name, email), lines:payroll_draft_lines(*)')
      .eq('period_start', period.start)
      .eq('period_end', period.end)
      .order('generated_at', { ascending: false });
    if (error) {
      console.error('Error loading payroll drafts:', error);
      setLoadError('Impossible de charger les brouillons. Vérifiez vos droits puis réessayez.');
    } else {
      setDrafts((data || []) as unknown as Draft[]);
    }
    setIsLoading(false);
  }, [supabase, period]);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_payroll_drafts', {
        p_reference: period.reference, p_dry: false,
      });
      if (error) throw new Error(error.message);
      const summary = data as { drafts_created?: number; drafts_refreshed?: number; regularizations?: number };
      toast.success(`Génération : ${summary.drafts_created || 0} créée(s), ${summary.drafts_refreshed || 0} actualisée(s), ${summary.regularizations || 0} régularisation(s)`);
      fetchDrafts();
    } catch (error) {
      console.error('Error generating payroll drafts:', error);
      toast.error('Génération refusée ou impossible');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleValidate = async (draft: Draft) => {
    if (!userId) return;
    setProcessingId(draft.id);
    try {
      const { error } = await supabase.from('payroll_drafts').update({
        status: 'validated', validated_by: userId,
      }).eq('id', draft.id);
      if (error) throw new Error(error.message);
      toast.success('Fiche validée et figée');
      fetchDrafts();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('VALIDATION_INCOMPLETE')
          ? 'Clôture refusée : des lignes « à configurer » restent non résolues'
          : 'Validation impossible'
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            Brouillons de paie
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Fenêtre {format(new Date(period.start + 'T00:00:00'), 'd MMM', { locale: fr })} → {format(new Date(period.end + 'T00:00:00'), 'd MMM yyyy', { locale: fr })} · interprétation 26→25 à confirmer · aucune génération automatique planifiée
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Générer / actualiser
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{loadError}</p>
          <button onClick={fetchDrafts} className="mt-2 underline">Réessayer</button>
        </div>
      ) : drafts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Aucun brouillon pour cette période. Utilisez « Générer / actualiser ».</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const unresolved = draft.lines.filter((l) => l.amount_state === 'requires_rule').length;
            const totalChf = draft.lines
              .filter((l) => l.amount_state === 'amount_set')
              .reduce((s, l) => s + Number(l.amount_chf || 0), 0);
            const isValidated = draft.status === 'validated';
            return (
              <div key={draft.id} className={`bg-white rounded-xl border shadow-sm p-5 ${isValidated ? 'border-emerald-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {techName(draft.technician)}
                      <span className="text-xs font-normal text-gray-400">v{draft.version}</span>
                      {draft.is_regularization && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">Régularisation</span>
                      )}
                      {isValidated ? (
                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Validée / figée
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Brouillon</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Générée {format(new Date(draft.generated_at), 'd MMM yyyy HH:mm', { locale: fr })}
                      {draft.notes ? ` · ${draft.notes}` : ''}
                    </p>
                  </div>
                  {!isValidated && (
                    <button
                      onClick={() => handleValidate(draft)}
                      disabled={processingId === draft.id || unresolved > 0}
                      title={unresolved > 0 ? `${unresolved} ligne(s) à configurer — clôture impossible` : 'Valider et figer la fiche'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40"
                    >
                      {processingId === draft.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Valider
                    </button>
                  )}
                </div>

                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {draft.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 pr-3 text-gray-700">{line.label}</td>
                        <td className="py-2 px-3 text-right text-gray-500 whitespace-nowrap">
                          {line.minutes != null ? `${line.minutes} min` : ''}
                        </td>
                        <td className="py-2 pl-3 text-right whitespace-nowrap">
                          {line.amount_state === 'amount_set' ? (
                            <span className="font-medium text-gray-900">{Number(line.amount_chf).toFixed(2)} CHF</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              <AlertTriangle className="w-3 h-3" /> À configurer
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="py-2 pr-3 text-gray-500 text-xs">
                        {unresolved > 0
                          ? `${unresolved} ligne(s) en attente de règle validée — la clôture reste impossible`
                          : 'Toutes les lignes sont résolues'}
                      </td>
                      <td />
                      <td className="py-2 pl-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {totalChf.toFixed(2)} CHF <span className="text-xs font-normal text-gray-400">(montants résolus)</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
