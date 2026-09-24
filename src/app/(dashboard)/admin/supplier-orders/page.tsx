'use client';

// Vue admin/secrétaire : tous les bons de commande fournisseur, tous techniciens
// et interventions confondus, pour la facturation. Filtre à traiter / traités.
// Le détail par intervention reste accessible via la fiche intervention.

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Package, Loader2, Check, RotateCcw, ExternalLink } from 'lucide-react';

interface OrderRow {
  id: string;
  intervention_id: string;
  supplier: string | null;
  note: string | null;
  photos: { url: string }[] | null;
  is_processed: boolean;
  created_at: string;
  technician?: { first_name: string | null; last_name: string | null; email: string } | null;
  intervention?: { title: string | null; intervention_type: string | null } | null;
}

type Filter = 'todo' | 'done' | 'all';

const techName = (t: OrderRow['technician']) =>
  !t ? '—' : (t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email);

export default function AdminSupplierOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todo');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, [supabase]);

  const fetchOrders = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from('supplier_orders')
      .select('*, technician:users!supplier_orders_technician_id_fkey(first_name, last_name, email), intervention:interventions!supplier_orders_intervention_id_fkey(title, intervention_type)')
      .order('created_at', { ascending: false });
    if (error) {
      setError(`Chargement impossible : ${error.message} (${error.code ?? '—'})`);
    } else {
      setOrders((data || []) as unknown as OrderRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleProcessed = async (order: OrderRow) => {
    if (!userId) return;
    setProcessingId(order.id);
    try {
      const { error } = await supabase.from('supplier_orders').update({
        is_processed: !order.is_processed,
        processed_by: !order.is_processed ? userId : null,
        processed_at: !order.is_processed ? new Date().toISOString() : null,
      }).eq('id', order.id);
      if (error) throw new Error(error.message);
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = orders.filter((o) => filter === 'all' ? true : filter === 'todo' ? !o.is_processed : o.is_processed);
  const todoCount = orders.filter((o) => !o.is_processed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-blue-600" />
          Bons de commande fournisseur
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ce que les techniciens ont pris chez les fournisseurs, pour la facturation. « Marquer traité » une fois facturé.
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['todo', `À traiter${todoCount ? ` (${todoCount})` : ''}`], ['done', 'Traités'], ['all', 'Tous']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${filter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{error}</p>
          <button onClick={fetchOrders} className="mt-2 underline">Réessayer</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{filter === 'todo' ? 'Aucun bon de commande à traiter.' : 'Aucun bon de commande.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <div key={order.id} className={`bg-white rounded-xl border shadow-sm p-4 ${order.is_processed ? 'border-emerald-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{order.supplier || 'Fournisseur non précisé'}</p>
                  {order.note && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{order.note}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(order.created_at).toLocaleDateString('fr-CH')} · {techName(order.technician)}
                    {order.intervention?.title ? (
                      <> · <Link href={`/interventions/${order.intervention_id}`} className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                        {order.intervention.intervention_type === 'chantier' ? '🏗️' : '🔧'} {order.intervention.title}<ExternalLink className="w-3 h-3" />
                      </Link></>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {order.is_processed && <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">Traité</span>}
                  <button onClick={() => toggleProcessed(order)} disabled={processingId === order.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                    {processingId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : order.is_processed ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    {order.is_processed ? 'Rétablir' : 'Marquer traité'}
                  </button>
                </div>
              </div>
              {Array.isArray(order.photos) && order.photos.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
                  {order.photos.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100">
                      <img src={p.url} alt={`Bon ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
