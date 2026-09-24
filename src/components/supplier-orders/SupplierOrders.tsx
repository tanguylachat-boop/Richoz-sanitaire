'use client';

// Bons de commande fournisseur rattachés à une intervention (dépannage/chantier).
// Technicien : saisit fournisseur + note + photos du bon/ticket. Staff : lit pour
// la facturation et coche « traité » (fige le BC côté technicien). Réutilise
// PhotoUploader + le bucket 'photos' (route privée /api/supplier-order-photos).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { PhotoUploader } from '@/components/reports/PhotoUploader';
import { uploadOrderPhotos } from '@/lib/supplier-order-photos';
import type { ReportPhoto } from '@/lib/report-photos';
import { Package, Loader2, Save, Trash2, Check, RotateCcw, Plus } from 'lucide-react';

interface OrderRow {
  id: string;
  technician_id: string;
  supplier: string | null;
  note: string | null;
  photos: { url: string }[] | null;
  is_processed: boolean;
  created_at: string;
  technician?: { first_name: string | null; last_name: string | null; email: string } | null;
}

const techName = (t: OrderRow['technician']) =>
  !t ? '' : (t.first_name && t.last_name ? `${t.first_name} ${t.last_name}` : t.first_name || t.last_name || t.email);

export function SupplierOrders({ interventionId }: { interventionId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single<{ role: string }>();
      setIsStaff(!!profile && ['admin', 'secretary'].includes(profile.role));
    })();
  }, [supabase]);

  // Formulaire d'ajout (technicien)
  const [adding, setAdding] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const storage = useMemo(() => ({
    upload: (path: string, file: File, opts: unknown) => supabase.storage.from('photos').upload(path, file, opts as never),
    download: (path: string) => supabase.storage.from('photos').download(path),
  }), [supabase]);

  const fetchOrders = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from('supplier_orders')
      .select('*, technician:users!supplier_orders_technician_id_fkey(first_name, last_name, email)')
      .eq('intervention_id', interventionId)
      .order('created_at', { ascending: false });
    if (error) {
      setError(`Chargement impossible : ${error.message}`);
    } else {
      setOrders((data || []) as unknown as OrderRow[]);
    }
    setLoading(false);
  }, [supabase, interventionId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const resetForm = () => { setSupplier(''); setNote(''); setPhotos([]); setAdding(false); };

  const handleSave = async () => {
    if (!currentUserId) return;
    if (!supplier.trim() && !note.trim() && photos.length === 0) {
      toast.error('Ajoutez au moins un fournisseur, une note ou une photo.');
      return;
    }
    setSaving(true);
    try {
      const uploaded = await uploadOrderPhotos(photos, currentUserId, interventionId, storage, setPhotos);
      if (uploaded.failed > 0) throw new Error(`${uploaded.failed} photo(s) non envoyée(s)`);
      const { error } = await supabase.from('supplier_orders').insert({
        intervention_id: interventionId,
        technician_id: currentUserId,
        supplier: supplier.trim() || null,
        note: note.trim() || null,
        photos: uploaded.photos,
      });
      if (error) throw new Error(error.message);
      toast.success('Bon de commande enregistré');
      resetForm();
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const toggleProcessed = async (order: OrderRow) => {
    if (!currentUserId) return;
    setProcessingId(order.id);
    try {
      const { error } = await supabase.from('supplier_orders').update({
        is_processed: !order.is_processed,
        processed_by: !order.is_processed ? currentUserId : null,
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

  const deleteOrder = async (order: OrderRow) => {
    setProcessingId(order.id);
    try {
      const { error } = await supabase.from('supplier_orders').delete().eq('id', order.id);
      if (error) throw new Error(error.message);
      toast.success('Bon de commande supprimé');
      fetchOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suppression impossible');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          Bons de commande fournisseur
        </h2>
        {!isStaff && !adding && currentUserId && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        )}
      </div>

      {!isStaff && adding && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <label className="block text-sm">
            <span className="text-gray-600">Fournisseur</span>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Sanitas Troesch, Richner…"
              className="mt-1 w-full h-10 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Ce que j&apos;ai pris</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="2× flexibles douche, 1× mitigeur…"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <div>
            <span className="text-sm text-gray-600">Photo(s) du bon / ticket</span>
            <div className="mt-1">
              <PhotoUploader interventionId={interventionId} photos={photos} onPhotosChange={setPhotos} maxPhotos={5} disabled={saving} onProcessingChange={setUploading} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving || uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
            </button>
            <button onClick={resetForm} disabled={saving} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} <button onClick={fetchOrders} className="underline ml-1">Réessayer</button>
        </div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun bon de commande pour cette intervention.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const canEditOwn = !isStaff && order.technician_id === currentUserId && !order.is_processed;
            return (
              <li key={order.id} className={`border rounded-xl p-4 ${order.is_processed ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{order.supplier || 'Fournisseur non précisé'}</p>
                    {order.note && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{order.note}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(order.created_at).toLocaleDateString('fr-CH')}
                      {isStaff && techName(order.technician) ? ` · ${techName(order.technician)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.is_processed && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">Traité</span>
                    )}
                    {isStaff && (
                      <button onClick={() => toggleProcessed(order)} disabled={processingId === order.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                        {processingId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : order.is_processed ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        {order.is_processed ? 'Rétablir' : 'Marquer traité'}
                      </button>
                    )}
                    {canEditOwn && (
                      <button onClick={() => deleteOrder(order)} disabled={processingId === order.id}
                        className="text-gray-300 hover:text-red-600 disabled:opacity-40" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {Array.isArray(order.photos) && order.photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                    {order.photos.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img src={p.url} alt={`Bon ${i + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
