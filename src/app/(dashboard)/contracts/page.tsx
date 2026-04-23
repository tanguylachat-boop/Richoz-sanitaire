'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileSignature, Plus, Search, Loader2, AlertTriangle, Building2, User as UserIcon } from 'lucide-react';

type ContractStatus = 'active' | 'paused' | 'terminated' | 'expired';
type Frequency = 'annuel' | 'biannuel' | 'trimestriel' | 'mensuel' | 'custom';

interface ContractRow {
  id: string;
  contract_number: string;
  title: string;
  equipment: string | null;
  address: string | null;
  frequency: Frequency;
  next_due_date: string;
  last_performed_date: string | null;
  amount_per_visit: number;
  status: ContractStatus;
  client_id: string | null;
  regie_id: string | null;
  client?: { id: string; first_name: string | null; last_name: string | null; company_name: string | null } | null;
  regie?: { id: string; name: string } | null;
}

const STATUS_BADGE: Record<ContractStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  terminated: 'bg-gray-100 text-gray-600 border-gray-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
};

const FREQ_LABEL: Record<Frequency, string> = {
  annuel: 'Annuel',
  biannuel: 'Semestriel',
  trimestriel: 'Trimestriel',
  mensuel: 'Mensuel',
  custom: 'Personnalisé',
};

function getClientName(c: ContractRow): string {
  if (c.client) {
    if (c.client.company_name) return c.client.company_name;
    return [c.client.first_name, c.client.last_name].filter(Boolean).join(' ') || '—';
  }
  if (c.regie) return c.regie.name;
  return '—';
}

export default function ContractsListPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'all' | 'due_soon'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const fetchContracts = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('maintenance_contracts')
      .select('*, client:clients(id, first_name, last_name, company_name), regie:regies(id, name)')
      .order('next_due_date');
    if (error) {
      toast.error('Erreur chargement');
      setIsLoading(false);
      return;
    }
    setContracts((data as ContractRow[]) || []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const filtered = useMemo(() => {
    let result = contracts;
    if (statusFilter === 'due_soon') {
      result = result.filter((c) => {
        if (c.status !== 'active') return false;
        const days = differenceInDays(new Date(c.next_due_date), new Date());
        return days <= 30;
      });
    } else if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        c.contract_number.toLowerCase().includes(q) ||
        (c.equipment || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        getClientName(c).toLowerCase().includes(q)
      );
    }
    return result;
  }, [contracts, search, statusFilter]);

  const dueSoonCount = contracts.filter((c) => {
    if (c.status !== 'active') return false;
    const days = differenceInDays(new Date(c.next_due_date), new Date());
    return days <= 30;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <FileSignature className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contrats de maintenance</h1>
            <p className="text-sm text-gray-500">
              {contracts.length} contrat{contracts.length > 1 ? 's' : ''}
              {dueSoonCount > 0 && <span className="text-red-600 font-medium"> · {dueSoonCount} échéance{dueSoonCount > 1 ? 's' : ''} ≤ 30j</span>}
            </p>
          </div>
        </div>
        <Link
          href="/contracts/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouveau contrat
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="N° contrat, titre, équipement, client, adresse..."
            className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ContractStatus | 'all' | 'due_soon')}
          className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">Tous</option>
          <option value="due_soon">Échéance ≤ 30 jours</option>
          <option value="active">Actifs</option>
          <option value="paused">Suspendus</option>
          <option value="terminated">Terminés</option>
          <option value="expired">Expirés</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileSignature className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun contrat trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">N°</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Titre / Équipement</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fréquence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Prochaine</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const daysToDue = differenceInDays(new Date(c.next_due_date), new Date());
                  const isDueSoon = c.status === 'active' && daysToDue <= 14 && daysToDue >= 0;
                  const isLate = c.status === 'active' && daysToDue < 0;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${c.id}`} className="font-medium text-violet-600 hover:underline">
                          {c.contract_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/contracts/${c.id}`} className="font-medium text-gray-900 hover:text-violet-600">{c.title}</Link>
                        {c.equipment && <p className="text-xs text-gray-500">{c.equipment}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex items-center gap-1">
                          {c.regie_id ? <Building2 className="w-3.5 h-3.5 text-gray-400" /> : <UserIcon className="w-3.5 h-3.5 text-gray-400" />}
                          {getClientName(c)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{FREQ_LABEL[c.frequency]}</td>
                      <td className="px-4 py-3">
                        <div className={`font-medium ${isLate ? 'text-red-700' : isDueSoon ? 'text-amber-700' : 'text-gray-700'}`}>
                          {format(new Date(c.next_due_date), 'd MMM yyyy', { locale: fr })}
                          {isLate && <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1" />}
                        </div>
                        {(isLate || isDueSoon) && (
                          <p className="text-xs text-gray-500">
                            {isLate ? `En retard de ${-daysToDue}j` : `Dans ${daysToDue}j`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(c.amount_per_visit).toFixed(2)} CHF</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_BADGE[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
