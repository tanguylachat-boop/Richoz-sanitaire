'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  MapPin,
  Phone,
  Mail,
  Building2,
  Key,
  MessageSquare,
  Send,
  Loader2,
  HardHat,
  User,
  AlertTriangle,
  Droplets,
  Zap,
  Flame,
  FileText,
  Camera,
  Pencil,
  Save,
  X,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChantierIntervention {
  id: string;
  title: string;
  description: string | null;
  address: string;
  date_planned: string | null;
  status: string;
  client_info: { name?: string; phone?: string; email?: string } | null;
  regie?: { id: string; name: string; phone?: string; email_contact?: string } | null;
  technician?: { id: string; first_name: string | null; last_name: string | null; phone?: string | null; email?: string } | null;
}

interface ChantierDetails {
  id: string;
  intervention_id: string;
  architect_name: string | null;
  architect_phone: string | null;
  architect_email: string | null;
  site_manager_name: string | null;
  site_manager_phone: string | null;
  keys_location: string | null;
  access_notes: string | null;
  progress_percent: number;
}

interface ChantierMessage {
  id: string;
  message: string;
  photos: string[] | null;
  created_at: string;
  author?: { id: string; first_name: string; last_name: string } | null;
}

interface CutoffNotice {
  id: string;
  cutoff_type: string;
  start_date: string;
  end_date_estimated: string | null;
  floors_affected: string | null;
  message: string | null;
  created_at: string;
  created_by?: { id: string; first_name: string; last_name: string } | null;
}

interface PhotoEntry {
  url: string;
  caption?: string;
  type?: 'before' | 'after' | null;
}

type TabType = 'infos' | 'journal' | 'cutoffs' | 'photos';

const statusConfig: Record<string, { label: string; className: string }> = {
  nouveau: { label: 'Nouveau', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  planifie: { label: 'Planifié', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_cours: { label: 'En cours', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  termine: { label: 'Terminé', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready_to_bill: { label: 'Prêt à facturer', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  billed: { label: 'Facturé', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  annule: { label: 'Annulé', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChantierDetailAdminPage() {
  const params = useParams();
  const router = useRouter();
  const interventionId = params.id as string;
  const supabase = createClient();

  const [intervention, setIntervention] = useState<ChantierIntervention | null>(null);
  const [details, setDetails] = useState<ChantierDetails | null>(null);
  const [messages, setMessages] = useState<ChantierMessage[]>([]);
  const [cutoffs, setCutoffs] = useState<CutoffNotice[]>([]);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('infos');

  // Journal
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Edit details
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState({
    architect_name: '',
    architect_phone: '',
    architect_email: '',
    site_manager_name: '',
    site_manager_phone: '',
    keys_location: '',
    access_notes: '',
  });
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Photo modal
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const [ivRes, detailsRes, msgRes, cutoffRes] = await Promise.all([
      supabase
        .from('interventions')
        .select(`
          id, title, description, address, date_planned, status, client_info,
          regie:regies(id, name, phone, email_contact),
          technician:users!interventions_technician_id_fkey(id, first_name, last_name, phone, email)
        `)
        .eq('id', interventionId)
        .single(),

      supabase
        .from('chantier_details')
        .select('*')
        .eq('intervention_id', interventionId)
        .maybeSingle(),

      supabase
        .from('chantier_messages')
        .select('id, message, photos, created_at, author:users!chantier_messages_author_id_fkey(id, first_name, last_name)')
        .eq('intervention_id', interventionId)
        .order('created_at', { ascending: false })
        .limit(100),

      supabase
        .from('chantier_cutoff_notices')
        .select('id, cutoff_type, start_date, end_date_estimated, floors_affected, message, created_at, created_by:users!chantier_cutoff_notices_created_by_fkey(id, first_name, last_name)')
        .eq('intervention_id', interventionId)
        .order('created_at', { ascending: false }),
    ]);

    if (!ivRes.data) {
      toast.error('Chantier introuvable');
      router.push('/chantiers');
      return;
    }

    setIntervention(ivRes.data as unknown as ChantierIntervention);

    if (detailsRes.data) {
      const d = detailsRes.data as ChantierDetails;
      setDetails(d);
      setEditForm({
        architect_name: d.architect_name || '',
        architect_phone: d.architect_phone || '',
        architect_email: d.architect_email || '',
        site_manager_name: d.site_manager_name || '',
        site_manager_phone: d.site_manager_phone || '',
        keys_location: d.keys_location || '',
        access_notes: d.access_notes || '',
      });
    }

    if (msgRes.data) setMessages(msgRes.data as ChantierMessage[]);
    if (cutoffRes.data) setCutoffs(cutoffRes.data as unknown as CutoffNotice[]);

    // Fetch photos from reports for this intervention
    const { data: reportData } = await supabase
      .from('reports')
      .select('photos')
      .eq('intervention_id', interventionId);

    if (reportData) {
      const allPhotos: PhotoEntry[] = [];
      reportData.forEach((r) => {
        if (r.photos && Array.isArray(r.photos)) {
          (r.photos as PhotoEntry[]).forEach((p) => {
            if (typeof p === 'string') {
              allPhotos.push({ url: p });
            } else if (p && p.url) {
              allPhotos.push(p);
            }
          });
        }
      });
      setPhotos(allPhotos);
    }

    // Also collect photos from journal messages
    if (msgRes.data) {
      const msgPhotos: PhotoEntry[] = [];
      (msgRes.data as ChantierMessage[]).forEach((m) => {
        if (m.photos && m.photos.length > 0) {
          m.photos.forEach((p) => msgPhotos.push({ url: p, caption: `Journal - ${format(new Date(m.created_at), 'd MMM yyyy', { locale: fr })}` }));
        }
      });
      if (msgPhotos.length > 0) {
        setPhotos((prev) => [...prev, ...msgPhotos]);
      }
    }

    setIsLoading(false);
  }, [interventionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setIsSendingMessage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('chantier_messages')
        .insert({
          intervention_id: interventionId,
          author_id: user.id,
          message: newMessage.trim(),
          photos: [],
        });

      if (error) throw error;
      toast.success('Message envoyé');
      setNewMessage('');
      fetchData();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    try {
      if (details?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('chantier_details')
          .update({
            architect_name: editForm.architect_name || null,
            architect_phone: editForm.architect_phone || null,
            architect_email: editForm.architect_email || null,
            site_manager_name: editForm.site_manager_name || null,
            site_manager_phone: editForm.site_manager_phone || null,
            keys_location: editForm.keys_location || null,
            access_notes: editForm.access_notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', details.id);
        if (error) throw error;
      } else {
        // Create new chantier_details
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('chantier_details')
          .insert({
            intervention_id: interventionId,
            architect_name: editForm.architect_name || null,
            architect_phone: editForm.architect_phone || null,
            architect_email: editForm.architect_email || null,
            site_manager_name: editForm.site_manager_name || null,
            site_manager_phone: editForm.site_manager_phone || null,
            keys_location: editForm.keys_location || null,
            access_notes: editForm.access_notes || null,
          });
        if (error) throw error;
      }
      toast.success('Informations mises à jour');
      setIsEditingDetails(false);
      fetchData();
    } catch (error) {
      console.error('Error saving details:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const getCutoffIcon = (type: string) => {
    switch (type) {
      case 'eau': return <Droplets className="w-5 h-5 text-blue-500" />;
      case 'electricite': return <Zap className="w-5 h-5 text-yellow-500" />;
      case 'gaz': return <Flame className="w-5 h-5 text-orange-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
  };

  const getCutoffLabel = (type: string) => {
    switch (type) {
      case 'eau': return 'Coupure d\'eau';
      case 'electricite': return 'Coupure électricité';
      case 'gaz': return 'Coupure gaz';
      default: return 'Coupure';
    }
  };

  const getCutoffStatus = (cutoff: CutoffNotice) => {
    const now = new Date();
    const start = new Date(cutoff.start_date);
    const end = cutoff.end_date_estimated ? new Date(cutoff.end_date_estimated) : null;

    if (end && isBefore(end, now)) return 'past';
    if (isAfter(start, now)) return 'future';
    return 'active';
  };

  const getCutoffStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'border-red-200 bg-red-50';
      case 'future': return 'border-orange-200 bg-orange-50';
      case 'past': return 'border-gray-200 bg-gray-50';
      default: return 'border-gray-200';
    }
  };

  const getCutoffBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">EN COURS</span>;
      case 'future': return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-orange-100 text-orange-700">À VENIR</span>;
      case 'past': return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">TERMINÉE</span>;
      default: return null;
    }
  };

  const handleNotifyRegie = (cutoff: CutoffNotice) => {
    if (!intervention?.regie?.email_contact) {
      toast.error('Aucun email de régie renseigné');
      return;
    }

    const cutoffLabel = getCutoffLabel(cutoff.cutoff_type);
    const startStr = format(new Date(cutoff.start_date), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
    const endStr = cutoff.end_date_estimated
      ? format(new Date(cutoff.end_date_estimated), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
      : 'non définie';

    const subject = encodeURIComponent(`Avis de ${cutoffLabel.toLowerCase()} - ${intervention.address}`);
    const body = encodeURIComponent(
      `Madame, Monsieur,\n\n` +
      `Nous vous informons d'une ${cutoffLabel.toLowerCase()} prévue à l'adresse suivante :\n\n` +
      `Adresse : ${intervention.address}\n` +
      `Type : ${cutoffLabel}\n` +
      `Début : ${startStr}\n` +
      `Fin estimée : ${endStr}\n` +
      (cutoff.floors_affected ? `Étages concernés : ${cutoff.floors_affected}\n` : '') +
      (cutoff.message ? `\nMessage du technicien :\n${cutoff.message}\n` : '') +
      `\nCordialement,\nRICHOZ Sanitaire`
    );

    window.open(`mailto:${intervention.regie.email_contact}?subject=${subject}&body=${body}`, '_self');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!intervention) return null;

  const status = statusConfig[intervention.status] || statusConfig.nouveau;
  const progress = details?.progress_percent ?? 0;
  const techName = intervention.technician
    ? [intervention.technician.first_name, intervention.technician.last_name].filter(Boolean).join(' ')
    : null;

  const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/chantiers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" />
        Retour aux chantiers
      </Link>

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <HardHat className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{intervention.title}</h1>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{intervention.address}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${status.className}`}>
                {status.label}
              </span>
              {intervention.regie && (
                <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  {intervention.regie.name}
                </span>
              )}
              {techName && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                  <User className="w-3.5 h-3.5" />
                  {techName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Progression</span>
            <span className="text-sm font-bold text-blue-600">{progress}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {([
          { key: 'infos' as TabType, label: 'Infos', icon: Building2 },
          { key: 'journal' as TabType, label: 'Journal', icon: MessageSquare, count: messages.length },
          { key: 'cutoffs' as TabType, label: 'Coupures', icon: AlertTriangle, count: cutoffs.filter(c => getCutoffStatus(c) === 'active').length },
          { key: 'photos' as TabType, label: 'Photos', icon: Camera, count: photos.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                tab.key === 'cutoffs' && tab.count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Infos ═══ */}
      {activeTab === 'infos' && (
        <div className="space-y-4">
          {/* Edit toggle */}
          <div className="flex justify-end">
            {!isEditingDetails ? (
              <button
                onClick={() => setIsEditingDetails(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Modifier
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setIsEditingDetails(false); if (details) setEditForm({ architect_name: details.architect_name || '', architect_phone: details.architect_phone || '', architect_email: details.architect_email || '', site_manager_name: details.site_manager_name || '', site_manager_phone: details.site_manager_phone || '', keys_location: details.keys_location || '', access_notes: details.access_notes || '' }); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  Annuler
                </button>
                <button
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingDetails ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            )}
          </div>

          {/* Contacts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />Contacts
            </h3>

            {isEditingDetails ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Architecte — Nom</label>
                    <input type="text" value={editForm.architect_name} onChange={(e) => setEditForm(f => ({ ...f, architect_name: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
                    <input type="text" value={editForm.architect_phone} onChange={(e) => setEditForm(f => ({ ...f, architect_phone: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input type="email" value={editForm.architect_email} onChange={(e) => setEditForm(f => ({ ...f, architect_email: e.target.value }))} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Chef de chantier — Nom</label>
                    <input type="text" value={editForm.site_manager_name} onChange={(e) => setEditForm(f => ({ ...f, site_manager_name: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
                    <input type="text" value={editForm.site_manager_phone} onChange={(e) => setEditForm(f => ({ ...f, site_manager_phone: e.target.value }))} className={inputClass} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(details?.architect_name || details?.site_manager_name || intervention.regie || intervention.technician || intervention.client_info?.name) ? (
                  <>
                    {details?.architect_name && (
                      <ContactRow role="Architecte" name={details.architect_name} phone={details.architect_phone} email={details.architect_email} />
                    )}
                    {details?.site_manager_name && (
                      <ContactRow role="Chef de chantier" name={details.site_manager_name} phone={details.site_manager_phone} />
                    )}
                    {intervention.regie && (
                      <ContactRow role="Régie" name={intervention.regie.name} phone={intervention.regie.phone} email={intervention.regie.email_contact} />
                    )}
                    {intervention.technician && techName && (
                      <ContactRow role="Technicien" name={techName} phone={intervention.technician.phone} email={intervention.technician.email} />
                    )}
                    {intervention.client_info?.name && (
                      <ContactRow role="Client / Propriétaire" name={intervention.client_info.name} phone={intervention.client_info.phone} email={intervention.client_info.email} />
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">Aucun contact renseigné — cliquez Modifier pour ajouter</p>
                )}
              </div>
            )}
          </div>

          {/* Clés & Accès */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-600" />Clés & Accès
            </h3>
            {isEditingDetails ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Emplacement des clés</label>
                  <input type="text" value={editForm.keys_location} onChange={(e) => setEditForm(f => ({ ...f, keys_location: e.target.value }))} className={inputClass} placeholder="Ex: chez le concierge, boîte à clés..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes d&apos;accès</label>
                  <textarea value={editForm.access_notes} onChange={(e) => setEditForm(f => ({ ...f, access_notes: e.target.value }))} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Informations complémentaires..." />
                </div>
              </div>
            ) : (
              <>
                {details?.keys_location ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm font-medium text-amber-800">{details.keys_location}</p>
                    </div>
                    {details.access_notes && (
                      <p className="text-sm text-gray-600">{details.access_notes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Aucune info d&apos;accès renseignée</p>
                )}
              </>
            )}
          </div>

          {/* Description */}
          {intervention.description && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-600" />Description
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{intervention.description}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Journal ═══ */}
      {activeTab === 'journal' && (
        <div className="space-y-4">
          {/* Secretary can post messages */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex gap-3">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrire un message..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={isSendingMessage || !newMessage.trim()}
                className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Messages list */}
          {messages.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">Aucun message dans le journal</p>
              <p className="text-sm text-gray-400 mt-1">Les messages des techniciens apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const authorName = msg.author ? `${msg.author.first_name} ${msg.author.last_name}` : 'Inconnu';
                const initials = msg.author ? `${msg.author.first_name?.charAt(0) || ''}${msg.author.last_name?.charAt(0) || ''}` : '?';

                return (
                  <div key={msg.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900">{authorName}</span>
                          <span className="text-xs text-gray-400">
                            {format(new Date(msg.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
                        {msg.photos && msg.photos.length > 0 && (
                          <div className="flex gap-2 mt-3 overflow-x-auto">
                            {msg.photos.map((photo, i) => (
                              <button key={i} onClick={() => setSelectedPhoto(photo)} className="flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo} alt="" className="w-20 h-20 rounded-lg object-cover hover:opacity-80 transition-opacity" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Coupures ═══ */}
      {activeTab === 'cutoffs' && (
        <div className="space-y-4">
          {cutoffs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
              <Droplets className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">Aucune coupure déclarée</p>
              <p className="text-sm text-gray-400 mt-1">Les coupures déclarées par les techniciens apparaîtront ici</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cutoffs.map((cutoff) => {
                const cutoffStatus = getCutoffStatus(cutoff);
                const authorName = cutoff.created_by
                  ? `${cutoff.created_by.first_name} ${cutoff.created_by.last_name}`
                  : null;

                return (
                  <div key={cutoff.id} className={`bg-white rounded-xl border p-5 shadow-sm ${getCutoffStatusStyle(cutoffStatus)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {getCutoffIcon(cutoff.cutoff_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">{getCutoffLabel(cutoff.cutoff_type)}</h4>
                            {getCutoffBadge(cutoffStatus)}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {format(new Date(cutoff.start_date), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                            {cutoff.end_date_estimated && (
                              <> → {format(new Date(cutoff.end_date_estimated), "d MMM yyyy 'à' HH:mm", { locale: fr })}</>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Notify régie button */}
                      {cutoffStatus !== 'past' && intervention.regie?.email_contact && (
                        <button
                          onClick={() => handleNotifyRegie(cutoff)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Notifier la régie
                        </button>
                      )}
                    </div>

                    {cutoff.floors_affected && (
                      <p className="text-sm text-gray-600 mt-2">
                        <span className="font-medium">Étages :</span> {cutoff.floors_affected}
                      </p>
                    )}
                    {cutoff.message && (
                      <p className="text-sm text-gray-700 bg-white/60 rounded-lg p-3 mt-2 border border-gray-100">
                        {cutoff.message}
                      </p>
                    )}
                    {authorName && (
                      <p className="text-xs text-gray-400 mt-2">
                        Déclarée par {authorName} le {format(new Date(cutoff.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Photos ═══ */}
      {activeTab === 'photos' && (
        <div className="space-y-4">
          {photos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
              <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 font-medium">Aucune photo</p>
              <p className="text-sm text-gray-400 mt-1">Les photos uploadées par les techniciens apparaîtront ici</p>
            </div>
          ) : (
            <>
              {/* Group by type if tagged */}
              {(() => {
                const beforePhotos = photos.filter(p => p.type === 'before');
                const afterPhotos = photos.filter(p => p.type === 'after');
                const otherPhotos = photos.filter(p => !p.type);

                return (
                  <div className="space-y-6">
                    {beforePhotos.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Photos Avant</h3>
                        <PhotoGrid photos={beforePhotos} onPhotoClick={setSelectedPhoto} />
                      </div>
                    )}
                    {afterPhotos.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Photos Après</h3>
                        <PhotoGrid photos={afterPhotos} onPhotoClick={setSelectedPhoto} />
                      </div>
                    )}
                    {otherPhotos.length > 0 && (
                      <div>
                        {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">Autres photos</h3>
                        )}
                        <PhotoGrid photos={otherPhotos} onPhotoClick={setSelectedPhoto} />
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedPhoto}
            alt=""
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─── Contact Row ─────────────────────────────────────────────────────────────

function ContactRow({ role, name, phone, email }: { role: string; name: string; phone?: string | null; email?: string | null }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide">{role}</p>
        <p className="text-sm font-medium text-gray-900">{name}</p>
        <div className="flex items-center gap-3 mt-1">
          {phone && (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Phone className="w-3 h-3" />{phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Mail className="w-3 h-3" />{email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Photo Grid ──────────────────────────────────────────────────────────────

function PhotoGrid({ photos, onPhotoClick }: { photos: PhotoEntry[]; onPhotoClick: (url: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {photos.map((photo, i) => (
        <button
          key={i}
          onClick={() => onPhotoClick(photo.url)}
          className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
          {photo.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
              <p className="text-xs text-white truncate">{photo.caption}</p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
