'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, UserPlus } from 'lucide-react';

type ClientType = 'locataire' | 'proprietaire' | 'particulier' | 'entreprise';

interface Regie { id: string; name: string; }

export default function NewClientPage() {
  const router = useRouter();
  const supabase = createClient();
  const [regies, setRegies] = useState<Regie[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<{
    client_type: ClientType;
    first_name: string;
    last_name: string;
    company_name: string;
    email: string;
    phone: string;
    mobile: string;
    address: string;
    apartment: string;
    postal_code: string;
    city: string;
    regie_id: string;
    owner_name: string;
    notes: string;
  }>({
    client_type: 'locataire',
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    phone: '',
    mobile: '',
    address: '',
    apartment: '',
    postal_code: '',
    city: '',
    regie_id: '',
    owner_name: '',
    notes: '',
  });

  useEffect(() => {
    supabase.from('regies').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setRegies(data as Regie[]);
    });
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.client_type === 'entreprise' && !form.company_name) {
      toast.error('Nom de société obligatoire');
      return;
    }
    if (form.client_type !== 'entreprise' && !form.last_name) {
      toast.error('Nom de famille obligatoire');
      return;
    }
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('clients')
        .insert({
          client_type: form.client_type,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          company_name: form.company_name || null,
          email: form.email || null,
          phone: form.phone || null,
          mobile: form.mobile || null,
          address: form.address || null,
          apartment: form.apartment || null,
          postal_code: form.postal_code || null,
          city: form.city || null,
          regie_id: form.regie_id || null,
          owner_name: form.owner_name || null,
          notes: form.notes || null,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      toast.success('Client créé');
      router.push(`/clients/${(data as { id: string }).id}`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la création');
      setIsSaving(false);
    }
  };

  const ic = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Retour aux clients
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Nouveau client</h1>
            <p className="text-sm text-gray-500">Ajouter une fiche client</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                value={form.client_type}
                onChange={(e) => setForm({ ...form, client_type: e.target.value as ClientType })}
                className={`${ic} bg-white`}
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
                value={form.regie_id}
                onChange={(e) => setForm({ ...form, regie_id: e.target.value })}
                className={`${ic} bg-white`}
              >
                <option value="">— Aucune —</option>
                {regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            {form.client_type === 'entreprise' ? (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la société *</label>
                <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={ic} required />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                  <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={ic} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={ic} required />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={ic} placeholder="+41 22 XXX XX XX" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
              <input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className={ic} placeholder="+41 79 XXX XX XX" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={ic} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={ic} placeholder="Rue + numéro" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appartement / étage</label>
              <input type="text" value={form.apartment} onChange={(e) => setForm({ ...form, apartment: e.target.value })} className={ic} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NPA / Ville</label>
              <div className="flex gap-2">
                <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="1200" className="w-24 h-10 px-3 text-sm border border-gray-200 rounded-lg" />
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Genève" className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-lg" />
              </div>
            </div>
            {form.client_type === 'locataire' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Propriétaire</label>
                <input type="text" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} className={ic} />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Link href="/clients" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</Link>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Créer le client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
