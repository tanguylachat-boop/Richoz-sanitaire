'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  FileSignature,
  Loader2,
  Play,
  Pause,
  Trash2,
  Building2,
  User as UserIcon,
  MapPin,
  Wrench,
  Plus,
  Save,
} from 'lucide-react';

type ContractStatus = 'active' | 'paused' | 'terminated' | 'expired';
type Frequency = 'annuel' | 'biannuel' | 'trimestriel' | 'mensuel' | 'custom';

interface Contract {
  id: string;
  contract_number: string;
  title: string;
  description: string | null;
  equipment: string | null;
  address: string | null;
  frequency: Frequency;
  custom_interval_days: number | null;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  last_performed_date: string | null;
  amount_per_visit: number;
  estimated_duration_minutes: number | null;
  reminder_days_before: number | null;
  auto_generate_intervention: boolean;
  status: ContractStatus;
  notes: string | null;
  client_id: string | null;
  regie_id: string | null;
  client?: { id: string; first_name: string | null; last_name: string | null; company_name: string | null; phone: string | null; address: string | null } | null;
  regie?: { id: string; name: string } | null;
}

interface InterventionRow {
  id: string;
  title: string;
  date_planned: string | null;
  date_completed: string | null;
  status: string;
  work_order_number: string | null;
}

const FREQ_LABEL: Record<Frequency, string> = {
  annuel: 'Annuel',
  biannuel: 'Semestriel',
  trimestriel: 'Trimestriel',
  mensuel: 'Mensuel',
  custom: 'Personnalisé',
};

export default function ContractDetailPage() {
  const params = useParams();
  const contractId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [contract, setContract] = useState<Contract | null>(null);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [{ data: c }, { data: ivs }] = await Promise.all([
      supabase
        .from('maintenance_contracts')
        .select('*, client:clients(id, first_name, last_name, company_name, phone, address), regie:regies(id, name)')
        .eq('id', contractId)
        .single(),
      supabase
        .from('interventions')
        .select('id, title, date_planned, date_completed, status, work_order_number')
        .eq('maintenance_contract_id', contractId)
        .order('date_planned', { ascending: false }),
    ]);
    if (c) setContract(c as Contract);
    if (ivs) setInterventions(ivs as InterventionRow[]);
    setIsLoading(false);
  }, [contractId, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleStatus = async () => {
    if (!contract) return;
    setIsProcessing(true);
    const newStatus: ContractStatus = contract.status === 'active' ? 'paused' : 'active';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('maintenance_contracts').update({ status: newStatus }).eq('id', contractId);
      if (error) throw new Error(error.message);
      toast.success(newStatus === 'active' ? 'Contrat réactivé' : 'Contrat suspendu');
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erreur');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateNow = async () => {
    if (!contract) return;
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: iv, error } = await (supabase as any).from('interventions').insert({
        title: contract.title,
        description: contract.description || null,
        address: contract.address || contract.client?.address || '',
        date_planned: new Date(contract.next_due_date + 'T09:00:00').toISOString(),
        estimated_duration_minutes: contract.estimated_duration_minutes || 60,
        status: 'nouveau',
        priority: 0,
        regie_id: contract.regie_id,
        client_id: contract.client_id,
        source_type: 'maintenance_contract',
        intervention_type: 'depannage',
        maintenance_contract_id: contract.id,
      }).select('id').single();
      if (error) throw new Error(error.message);
      toast.success('Intervention générée');
      router.push(`/interventions/${(iv as { id: string }).id}`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la génération');
      setIsProcessing(false);
    }
  };

  const handleMarkPerformed = async () => {
    if (!contract) return;
    setIsProcessing(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    // Compute next due via SQL helper
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: next } = await (supabase as any).rpc('contract_next_due', {
        base_date: today,
        freq: contract.frequency,
        custom_days: contract.custom_interval_days,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('maintenance_contracts').update({
        last_performed_date: today,
        next_due_date: next || contract.next_due_date,
      }).eq('id', contractId);
      if (error) throw new Error(error.message);
      toast.success('Contrat mis à jour — prochaine échéance recalculée');
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erreur');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('maintenance_contracts').delete().eq('id', contractId);
      if (error) throw new Error(error.message);
      toast.success('Contrat supprimé');
      router.push('/contracts');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression');
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /></div>;
  }
  if (!contract) {
    return <div className="p-8 text-center text-gray-500">Contrat introuvable</div>;
  }

  const clientName = contract.client
    ? contract.client.company_name || [contract.client.first_name, contract.client.last_name].filter(Boolean).join(' ')
    : contract.regie?.name || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/contracts" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Retour aux contrats
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStatus}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            {contract.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {contract.status === 'active' ? 'Suspendre' : 'Réactiver'}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-800">Supprimer ce contrat ? Les interventions liées garderont leur historique.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg">Non</button>
            <button onClick={handleDelete} disabled={isProcessing} className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg disabled:opacity-50">Supprimer</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <FileSignature className="w-7 h-7 text-violet-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">{contract.contract_number}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  contract.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  contract.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{contract.status}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
              {contract.equipment && <p className="text-sm text-gray-500">{contract.equipment}</p>}
              {contract.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{contract.description}</p>}

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
                {contract.client ? (
                  <Link href={`/clients/${contract.client.id}`} className="inline-flex items-center gap-1 hover:text-violet-600">
                    <UserIcon className="w-3.5 h-3.5 text-gray-400" />{clientName}
                  </Link>
                ) : contract.regie ? (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />{clientName}
                  </span>
                ) : null}
                {contract.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />{contract.address}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Montant par visite</div>
            <div className="text-2xl font-bold text-gray-900">{Number(contract.amount_per_visit).toFixed(2)} CHF</div>
            <div className="text-xs text-gray-500 mt-1">{FREQ_LABEL[contract.frequency]}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-100 text-sm">
          <div>
            <div className="text-gray-500 text-xs uppercase">Début</div>
            <div className="font-medium text-gray-900">{format(new Date(contract.start_date), 'd MMM yyyy', { locale: fr })}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Fin</div>
            <div className="font-medium text-gray-900">
              {contract.end_date ? format(new Date(contract.end_date), 'd MMM yyyy', { locale: fr }) : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Dernier passage</div>
            <div className="font-medium text-gray-900">
              {contract.last_performed_date ? format(new Date(contract.last_performed_date), 'd MMM yyyy', { locale: fr }) : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500 text-xs uppercase">Prochaine échéance</div>
            <div className="font-semibold text-violet-700">
              {format(new Date(contract.next_due_date), 'd MMM yyyy', { locale: fr })}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={handleMarkPerformed}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" /> Marquer comme effectué aujourd&apos;hui
          </button>
          <button
            onClick={handleGenerateNow}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Générer intervention maintenant
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Historique ({interventions.length})</h3>
        </div>
        {interventions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Aucune intervention générée</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {interventions.map((iv) => (
              <Link key={iv.id} href={`/interventions/${iv.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{iv.title}</p>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {iv.work_order_number && <span>Bon #{iv.work_order_number} · </span>}
                      <span>{iv.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {iv.date_completed
                      ? <>Terminé le {format(new Date(iv.date_completed), 'd MMM yyyy', { locale: fr })}</>
                      : iv.date_planned
                      ? <>Planifié {format(new Date(iv.date_planned), 'd MMM yyyy', { locale: fr })}</>
                      : '—'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
