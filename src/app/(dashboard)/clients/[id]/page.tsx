'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Pencil,
  Save,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Building2,
  User as UserIcon,
  Wrench,
  FileText,
  FileSignature,
  Receipt,
  Plus,
  Trash2,
} from 'lucide-react';

type ClientType = 'locataire' | 'proprietaire' | 'particulier' | 'entreprise';

interface ClientDetail {
  id: string;
  client_type: ClientType;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  apartment: string | null;
  city: string | null;
  postal_code: string | null;
  regie_id: string | null;
  owner_name: string | null;
  notes: string | null;
  tags: string[];
  regie?: { id: string; name: string } | null;
}

interface InterventionRow {
  id: string;
  title: string;
  address: string;
  date_planned: string | null;
  status: string;
  work_order_number: string | null;
  intervention_type: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total_ttc: number;
  status: string;
  created_at: string;
}

interface QuoteRow {
  id: string;
  quote_number: string;
  total_ttc: number;
  status: string;
  created_at: string;
}

interface Regie {
  id: string;
  name: string;
}

function getClientName(c: ClientDetail | null): string {
  if (!c) return '';
  if (c.company_name) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sans nom';
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ClientDetail>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [{ data: cData }, { data: iData }, { data: rData }] = await Promise.all([
      supabase.from('clients').select('*, regie:regies(id, name)').eq('id', clientId).single(),
      supabase
        .from('interventions')
        .select('id, title, address, date_planned, status, work_order_number, intervention_type')
        .eq('client_id', clientId)
        .order('date_planned', { ascending: false }),
      supabase.from('regies').select('id, name').eq('is_active', true).order('name'),
    ]);

    if (cData) {
      setClient(cData as ClientDetail);
      setEditForm(cData as ClientDetail);
    }
    if (iData) setInterventions(iData as InterventionRow[]);
    if (rData) setRegies(rData as Regie[]);

    // Fetch invoices/quotes by searching client_name match on the normalized fields
    if (cData) {
      const clientName = getClientName(cData as ClientDetail);
      const [{ data: invData }, { data: qData }] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, total_ttc, status, created_at')
          .or(`client_name.ilike.%${clientName}%`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('quotes')
          .select('id, quote_number, total_ttc, status, created_at')
          .or(`client_name.ilike.%${clientName}%`)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (invData) setInvoices(invData as InvoiceRow[]);
      if (qData) setQuotes(qData as QuoteRow[]);
    }
    setIsLoading(false);
  }, [clientId, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('clients')
        .update({
          client_type: editForm.client_type,
          first_name: editForm.first_name || null,
          last_name: editForm.last_name || null,
          company_name: editForm.company_name || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          mobile: editForm.mobile || null,
          address: editForm.address || null,
          apartment: editForm.apartment || null,
          city: editForm.city || null,
          postal_code: editForm.postal_code || null,
          regie_id: editForm.regie_id || null,
          owner_name: editForm.owner_name || null,
          notes: editForm.notes || null,
        })
        .eq('id', clientId);
      if (error) throw new Error(error.message);
      toast.success('Client mis à jour');
      setIsEditing(false);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('clients').delete().eq('id', clientId);
      if (error) throw new Error(error.message);
      toast.success('Client supprimé');
      router.push('/clients');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression');
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 text-gray-400 animate-spin" /></div>;
  }
  if (!client) {
    return <div className="p-8 text-center text-gray-500">Client introuvable</div>;
  }

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total_ttc || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Retour aux clients
        </Link>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                <Pencil className="w-3.5 h-3.5" /> Modifier
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setIsEditing(false); setEditForm(client); }} className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Enregistrer
              </button>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-800">Supprimer ce client ? Les interventions liées garderont leur historique.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg">Non</button>
            <button onClick={handleDelete} disabled={isSaving} className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">Supprimer</button>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {!isEditing ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{getClientName(client)}</h1>
                <p className="text-sm text-gray-500">{client.client_type}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700">
                  {client.phone && <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone className="w-3.5 h-3.5 text-gray-400" />{client.phone}</a>}
                  {client.mobile && client.mobile !== client.phone && <a href={`tel:${client.mobile}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Phone className="w-3.5 h-3.5 text-gray-400" />{client.mobile}</a>}
                  {client.email && <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 hover:text-blue-600"><Mail className="w-3.5 h-3.5 text-gray-400" />{client.email}</a>}
                  {client.address && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-gray-400" />{client.address}{client.apartment ? ` — ${client.apartment}` : ''}</span>}
                  {client.regie && <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-gray-400" />{client.regie.name}</span>}
                </div>
                {client.notes && <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 px-3 py-2 rounded-lg">{client.notes}</p>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total facturé</div>
              <div className="text-2xl font-bold text-gray-900">{totalInvoiced.toFixed(2)} CHF</div>
              <div className="mt-2 text-xs text-gray-500">{interventions.length} intervention{interventions.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={editForm.client_type || 'locataire'}
                onChange={(e) => setEditForm({ ...editForm, client_type: e.target.value as ClientType })}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg"
              >
                <option value="locataire">Locataire</option>
                <option value="proprietaire">Propriétaire</option>
                <option value="particulier">Particulier</option>
                <option value="entreprise">Entreprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Régie</label>
              <select
                value={editForm.regie_id || ''}
                onChange={(e) => setEditForm({ ...editForm, regie_id: e.target.value || null })}
                className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg"
              >
                <option value="">— Aucune —</option>
                {regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
              <input type="text" value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input type="text" value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Société (si entreprise)</label>
              <input type="text" value={editForm.company_name || ''} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="tel" value={editForm.mobile || ''} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input type="text" value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appartement</label>
              <input type="text" value={editForm.apartment || ''} onChange={(e) => setEditForm({ ...editForm, apartment: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NPA / Ville</label>
              <div className="flex gap-2">
                <input type="text" value={editForm.postal_code || ''} onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })} placeholder="1200" className="w-24 h-10 px-3 text-sm border border-gray-200 rounded-lg" />
                <input type="text" value={editForm.city || ''} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} placeholder="Genève" className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-lg" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire (si locataire)</label>
              <input type="text" value={editForm.owner_name || ''} onChange={(e) => setEditForm({ ...editForm, owner_name: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={3} value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
          </div>
        )}
      </div>

      {/* Interventions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Interventions ({interventions.length})</h3>
          </div>
          <Link
            href={`/calendar?new_client_id=${client.id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Nouvelle
          </Link>
        </div>
        {interventions.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Aucune intervention</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {interventions.map((iv) => (
              <Link key={iv.id} href={`/interventions/${iv.id}`} className="block p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{iv.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {iv.work_order_number && <span>Bon #{iv.work_order_number}</span>}
                      {iv.intervention_type && <span>{iv.intervention_type === 'chantier' ? '🏗️ Chantier' : '🔧 Dépannage'}</span>}
                      <span>{iv.status}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {iv.date_planned ? format(new Date(iv.date_planned), "d MMM yyyy 'à' HH:mm", { locale: fr }) : '—'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Factures */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Factures ({invoices.length})</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Aucune facture</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">#{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">{format(new Date(inv.created_at), 'd MMM yyyy', { locale: fr })}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{Number(inv.total_ttc).toFixed(2)} CHF</div>
                    <div className="text-xs text-gray-500">{inv.status}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Devis */}
      {quotes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Devis ({quotes.length})</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {quotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">#{q.quote_number}</p>
                    <p className="text-xs text-gray-500">{format(new Date(q.created_at), 'd MMM yyyy', { locale: fr })}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{Number(q.total_ttc).toFixed(2)} CHF</div>
                    <div className="text-xs text-gray-500">{q.status}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Hidden icon fillers to avoid unused import warnings when no content */}
      <FileText className="hidden" />
    </div>
  );
}
