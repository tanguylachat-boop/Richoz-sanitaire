'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Clock,
  Plus,
  Loader2,
  MapPin,
  Phone,
  Camera,
  Send,
  X,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { normalizeImage } from '@/lib/normalize-image';

interface PiquetReport {
  id: string;
  call_received_at: string;
  address: string;
  client_name: string | null;
  status: string;
  created_at: string;
  problem_description: string | null;
}

interface Schedule {
  id: string;
  start_date: string;
  end_date: string;
}

export default function TechnicianPiquetPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<Schedule | null>(null);
  const [reports, setReports] = useState<PiquetReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [form, setForm] = useState({
    call_received_at: '',
    intervention_ended_at: '',
    address: '',
    client_name: '',
    client_phone: '',
    problem_description: '',
    actions_taken: '',
    supplies_used: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [supabase]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const [{ data: sched }, { data: reps }] = await Promise.all([
      supabase
        .from('piquet_schedule')
        .select('id, start_date, end_date')
        .eq('technician_id', userId)
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle(),
      supabase
        .from('piquet_reports')
        .select('id, call_received_at, address, client_name, status, created_at, problem_description')
        .eq('technician_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setCurrentSchedule(sched as Schedule | null);
    if (reps) setReports(reps as PiquetReport[]);
    setIsLoading(false);
  }, [userId, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openForm = () => {
    const now = new Date();
    // datetime-local expects YYYY-MM-DDTHH:mm local time
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setForm({
      call_received_at: local,
      intervention_ended_at: '',
      address: '',
      client_name: '',
      client_phone: '',
      problem_description: '',
      actions_taken: '',
      supplies_used: '',
    });
    setPhotos([]);
    setShowForm(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !userId) return;
    setUploadingPhotos(true);
    try {
      const files = Array.from(e.target.files);
      const uploads = await Promise.all(
        files.map(async (file) => {
          const normalized = await normalizeImage(file);
          const ext = normalized.name.split('.').pop() || 'jpg';
          const path = `piquet/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error } = await supabase.storage.from('photos').upload(path, normalized, {
            contentType: normalized.type || 'image/jpeg',
            upsert: false,
          });
          if (error) throw new Error(error.message);
          const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
          return urlData.publicUrl;
        })
      );
      setPhotos((prev) => [...prev, ...uploads]);
      toast.success(`${uploads.length} photo${uploads.length > 1 ? 's' : ''} ajoutée${uploads.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'upload');
    } finally {
      setUploadingPhotos(false);
      e.target.value = '';
    }
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((p) => p !== url));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!form.address) {
      toast.error('Adresse obligatoire');
      return;
    }
    setIsSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('piquet_reports').insert({
        technician_id: userId,
        call_received_at: new Date(form.call_received_at).toISOString(),
        intervention_ended_at: form.intervention_ended_at
          ? new Date(form.intervention_ended_at).toISOString()
          : null,
        address: form.address,
        client_name: form.client_name || null,
        client_phone: form.client_phone || null,
        problem_description: form.problem_description || null,
        actions_taken: form.actions_taken || null,
        supplies_used: form.supplies_used || null,
        photos,
        status: 'submitted',
        is_billable: true,
      });
      if (error) throw new Error(error.message);

      // Notify secretaries (send a generic notification)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: secretaries } = await (supabase as any)
        .from('users')
        .select('id')
        .in('role', ['secretary', 'admin'])
        .eq('is_active', true);
      if (secretaries) {
        for (const s of secretaries as { id: string }[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('notifications').insert({
            recipient_id: s.id,
            sender_id: userId,
            title: 'Nouveau rapport de piquet',
            message: `Urgence nocturne à ${form.address}`,
            type: 'piquet_report',
          });
        }
      }

      toast.success('Rapport envoyé à la secrétaire');
      setShowForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const ic = 'w-full h-12 px-3 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Clock className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Piquet / Urgence</h1>
          <p className="text-sm text-gray-500">Interventions de nuit et week-end</p>
        </div>
      </div>

      {currentSchedule ? (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-900">Tu es de garde cette semaine</p>
            <p className="text-xs text-orange-800 mt-1">
              Du {format(new Date(currentSchedule.start_date + 'T00:00:00'), 'd MMM', { locale: fr })}
              {' '}au {format(new Date(currentSchedule.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: fr })}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
          Tu n&apos;es pas de garde cette semaine. Tu peux quand même saisir une intervention d&apos;urgence si ça arrive.
        </div>
      )}

      {!showForm && (
        <button
          onClick={openForm}
          className="w-full flex items-center justify-center gap-2 py-5 px-6 bg-orange-600 text-white text-lg font-semibold rounded-xl hover:bg-orange-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nouvelle intervention urgence
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">Rapport d&apos;urgence</h2>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Appel reçu à *</label>
            <input
              type="datetime-local"
              required
              value={form.call_received_at}
              onChange={(e) => setForm({ ...form, call_received_at: e.target.value })}
              className={ic}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fin intervention</label>
            <input
              type="datetime-local"
              value={form.intervention_ended_at}
              onChange={(e) => setForm({ ...form, intervention_ended_at: e.target.value })}
              className={ic}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <MapPin className="w-4 h-4 inline-block mr-1" />
              Adresse *
            </label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={ic}
              placeholder="Rue + numéro + étage"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom client</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                className={ic}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Phone className="w-4 h-4 inline-block mr-1" />
                Téléphone
              </label>
              <input
                type="tel"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                className={ic}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Problème rencontré *</label>
            <textarea
              required
              rows={3}
              value={form.problem_description}
              onChange={(e) => setForm({ ...form, problem_description: e.target.value })}
              className="w-full px-3 py-2 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Ex: Fuite d'eau sous évier, robinet bloqué..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actions réalisées</label>
            <textarea
              rows={3}
              value={form.actions_taken}
              onChange={(e) => setForm({ ...form, actions_taken: e.target.value })}
              className="w-full px-3 py-2 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Ex: Remplacement flexible, fermeture arrivée eau..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Matériel utilisé</label>
            <textarea
              rows={2}
              value={form.supplies_used}
              onChange={(e) => setForm({ ...form, supplies_used: e.target.value })}
              className="w-full px-3 py-2 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="1× flexible 50cm, 2× joint..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <ImageIcon className="w-4 h-4 inline-block mr-1" />
              Photos
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {photos.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-600 hover:border-orange-400 cursor-pointer">
                {uploadingPhotos ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhotos}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
              className="flex-1 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploadingPhotos}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer à la secrétaire
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Mes derniers rapports</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Aucun rapport pour l&apos;instant</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{r.address}</p>
                    {r.client_name && <p className="text-xs text-gray-500 mt-0.5">👤 {r.client_name}</p>}
                    {r.problem_description && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.problem_description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      r.status === 'billed' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'validated' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status === 'billed' ? 'Facturé' : r.status === 'validated' ? 'Validé' : 'Envoyé'}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(r.call_received_at), "d MMM 'à' HH:mm", { locale: fr })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
