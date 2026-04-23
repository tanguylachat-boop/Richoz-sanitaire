'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Plus, Search, Users as UsersIcon, Loader2, Phone, MapPin, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type ClientType = 'locataire' | 'proprietaire' | 'particulier' | 'entreprise';

interface ClientRow {
  id: string;
  client_type: ClientType;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  regie_id: string | null;
  tags: string[];
  created_at: string;
  regie?: { id: string; name: string } | null;
  interventions_count?: number;
  last_intervention_at?: string | null;
}

const TYPE_LABELS: Record<ClientType, { label: string; badgeClass: string }> = {
  locataire: { label: 'Locataire', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  proprietaire: { label: 'Propriétaire', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  particulier: { label: 'Particulier', badgeClass: 'bg-violet-100 text-violet-700 border-violet-200' },
  entreprise: { label: 'Entreprise', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function getClientName(c: ClientRow): string {
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sans nom';
}

export default function ClientsListPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ClientType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*, regie:regies(id, name)')
      .order('last_name', { ascending: true, nullsFirst: false })
      .limit(500);

    if (error) {
      console.error(error);
      toast.error('Erreur lors du chargement');
      setIsLoading(false);
      return;
    }

    // Fetch intervention counts separately
    const rows = (data || []) as ClientRow[];
    if (rows.length > 0) {
      const ids = rows.map((c) => c.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ivs } = await (supabase as any)
        .from('interventions')
        .select('client_id, date_planned')
        .in('client_id', ids);
      const countMap: Record<string, { count: number; last: string | null }> = {};
      if (ivs) {
        for (const iv of ivs as { client_id: string; date_planned: string | null }[]) {
          if (!countMap[iv.client_id]) countMap[iv.client_id] = { count: 0, last: null };
          countMap[iv.client_id].count++;
          if (iv.date_planned && (!countMap[iv.client_id].last || iv.date_planned > countMap[iv.client_id].last!)) {
            countMap[iv.client_id].last = iv.date_planned;
          }
        }
      }
      rows.forEach((c) => {
        c.interventions_count = countMap[c.id]?.count || 0;
        c.last_intervention_at = countMap[c.id]?.last || null;
      });
    }
    setClients(rows);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = useMemo(() => {
    let result = clients;
    if (typeFilter !== 'all') result = result.filter((c) => c.client_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((c) => {
        const name = getClientName(c).toLowerCase();
        return (
          name.includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.mobile || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.address || '').toLowerCase().includes(q) ||
          (c.regie?.name || '').toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [clients, search, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <UsersIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500">{clients.length} fiche{clients.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouveau client
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, téléphone, adresse, régie..."
            className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ClientType | 'all')}
          className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Tous les types</option>
          <option value="locataire">Locataires</option>
          <option value="proprietaire">Propriétaires</option>
          <option value="particulier">Particuliers</option>
          <option value="entreprise">Entreprises</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <UsersIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Aucun client trouvé</h3>
            <p className="text-gray-500 text-sm">{search || typeFilter !== 'all' ? 'Essaie un autre filtre.' : 'Crée ton premier client.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Adresse</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Régie</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Interv.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dernière</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/clients/${c.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{getClientName(c)}</div>
                      <div className="mt-0.5">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${TYPE_LABELS[c.client_type].badgeClass}`}>
                          {TYPE_LABELS[c.client_type].label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-sm hover:text-blue-600">
                          <Phone className="w-3 h-3 text-gray-400" />{c.phone}
                        </a>
                      )}
                      {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.address && (
                        <div className="flex items-start gap-1 text-sm">
                          <MapPin className="w-3 h-3 text-gray-400 mt-1 flex-shrink-0" />
                          <span className="truncate max-w-[240px]">{c.address}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.regie && (
                        <div className="flex items-center gap-1 text-sm">
                          <Building2 className="w-3 h-3 text-gray-400" />{c.regie.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900">{c.interventions_count || 0}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {c.last_intervention_at ? format(new Date(c.last_intervention_at), 'd MMM yyyy', { locale: fr }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
