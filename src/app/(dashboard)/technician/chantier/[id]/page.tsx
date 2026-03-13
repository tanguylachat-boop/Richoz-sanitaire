'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  BarChart3,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';

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
}

type TabType = 'overview' | 'journal' | 'cutoffs';

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChantierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const interventionId = params.id as string;
  const supabase = createClient();

  const [intervention, setIntervention] = useState<ChantierIntervention | null>(null);
  const [details, setDetails] = useState<ChantierDetails | null>(null);
  const [messages, setMessages] = useState<ChantierMessage[]>([]);
  const [cutoffs, setCutoffs] = useState<CutoffNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Journal form
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Cutoff form
  const [showCutoffForm, setShowCutoffForm] = useState(false);
  const [cutoffForm, setCutoffForm] = useState({
    cutoff_type: 'eau',
    start_date: '',
    end_date_estimated: '',
    floors_affected: '',
    message: '',
  });
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);

  // Progress
  const [editProgress, setEditProgress] = useState(0);
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    // Fetch intervention
    const { data: ivData } = await supabase
      .from('interventions')
      .select('id, title, description, address, date_planned, status, client_info, regie:regies(id, name, phone, email_contact)')
      .eq('id', interventionId)
      .single();

    if (!ivData) {
      toast.error('Chantier introuvable');
      router.push('/technician/chantier');
      return;
    }
    setIntervention(ivData as ChantierIntervention);

    // Fetch chantier_details (may not exist yet)
    try {
      const { data: detailsData } = await supabase
        .from('chantier_details')
        .select('*')
        .eq('intervention_id', interventionId)
        .maybeSingle();
      if (detailsData) {
        setDetails(detailsData as ChantierDetails);
        setEditProgress(detailsData.progress_percent || 0);
      }
    } catch {
      // Table may not exist yet
    }

    // Fetch messages
    try {
      const { data: msgData } = await supabase
        .from('chantier_messages')
        .select('id, message, photos, created_at, author:users!chantier_messages_author_id_fkey(id, first_name, last_name)')
        .eq('intervention_id', interventionId)
        .order('created_at', { ascending: false });
      if (msgData) setMessages(msgData as ChantierMessage[]);
    } catch {
      // Table may not exist yet
    }

    // Fetch cutoff notices
    try {
      const { data: cutoffData } = await supabase
        .from('chantier_cutoff_notices')
        .select('id, cutoff_type, start_date, end_date_estimated, floors_affected, message, created_at')
        .eq('intervention_id', interventionId)
        .order('created_at', { ascending: false });
      if (cutoffData) setCutoffs(cutoffData as CutoffNotice[]);
    } catch {
      // Table may not exist yet
    }

    setIsLoading(false);
  }, [interventionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      toast.error('Erreur lors de l\'envoi du message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSaveCutoff = async () => {
    if (!cutoffForm.start_date) { toast.error('Date de début requise'); return; }
    setIsSavingCutoff(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('chantier_cutoff_notices')
        .insert({
          intervention_id: interventionId,
          cutoff_type: cutoffForm.cutoff_type,
          start_date: new Date(cutoffForm.start_date).toISOString(),
          end_date_estimated: cutoffForm.end_date_estimated ? new Date(cutoffForm.end_date_estimated).toISOString() : null,
          floors_affected: cutoffForm.floors_affected || null,
          message: cutoffForm.message || null,
          created_by: user.id,
        });

      if (error) throw error;
      toast.success('Avis de coupure enregistré');
      setShowCutoffForm(false);
      setCutoffForm({ cutoff_type: 'eau', start_date: '', end_date_estimated: '', floors_affected: '', message: '' });
      fetchData();
    } catch (error) {
      console.error('Error saving cutoff:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSavingCutoff(false);
    }
  };

  const handleUpdateProgress = async () => {
    if (!details?.id) return;
    setIsSavingProgress(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('chantier_details')
        .update({ progress_percent: editProgress })
        .eq('id', details.id);
      if (error) throw error;
      toast.success('Progression mise à jour');
    } catch (error) {
      console.error('Error updating progress:', error);
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setIsSavingProgress(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!intervention) return null;

  const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/technician/chantier" className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{intervention.title}</h1>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{intervention.address}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {details && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progression</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={editProgress}
                onChange={(e) => setEditProgress(Number(e.target.value))}
                className="w-24 h-2 accent-blue-600"
              />
              <span className="text-sm font-bold text-blue-600 w-10 text-right">{editProgress}%</span>
              {editProgress !== (details.progress_percent || 0) && (
                <button
                  onClick={handleUpdateProgress}
                  disabled={isSavingProgress}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingProgress ? '...' : 'OK'}
                </button>
              )}
            </div>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${editProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {([
          { key: 'overview' as TabType, label: 'Infos', icon: Building2 },
          { key: 'journal' as TabType, label: 'Journal', icon: MessageSquare },
          { key: 'cutoffs' as TabType, label: 'Coupures', icon: AlertTriangle },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Overview ═══ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Contacts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />Contacts
            </h3>
            <div className="space-y-3">
              {/* Architecte */}
              {details?.architect_name && (
                <ContactRow
                  role="Architecte"
                  name={details.architect_name}
                  phone={details.architect_phone}
                  email={details.architect_email}
                />
              )}
              {/* Chef de chantier */}
              {details?.site_manager_name && (
                <ContactRow
                  role="Chef de chantier"
                  name={details.site_manager_name}
                  phone={details.site_manager_phone}
                />
              )}
              {/* Régie */}
              {intervention.regie && (
                <ContactRow
                  role="Régie"
                  name={intervention.regie.name}
                  phone={intervention.regie.phone}
                  email={intervention.regie.email_contact}
                />
              )}
              {/* Client */}
              {intervention.client_info?.name && (
                <ContactRow
                  role="Client / Propriétaire"
                  name={intervention.client_info.name}
                  phone={intervention.client_info.phone}
                />
              )}
              {!details?.architect_name && !details?.site_manager_name && !intervention.regie && !intervention.client_info?.name && (
                <p className="text-sm text-gray-400 italic">Aucun contact renseigné</p>
              )}
            </div>
          </div>

          {/* Clés & Accès */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-600" />Clés & Accès
            </h3>
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
          </div>

          {/* Description */}
          {intervention.description && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-600" />Description
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{intervention.description}</p>
            </div>
          )}

          {/* Rapport link */}
          <Link
            href={`/technician/report/${intervention.id}`}
            className="block bg-blue-600 text-white rounded-2xl p-4 text-center font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 active:scale-[0.98]"
          >
            Créer un rapport
          </Link>
        </div>
      )}

      {/* ═══ TAB: Journal ═══ */}
      {activeTab === 'journal' && (
        <div className="space-y-4">
          {/* New message input */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrire un message d'avancement..."
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
            <div className="text-center py-12">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Aucun message</p>
              <p className="text-sm text-gray-400">Postez le premier message d&apos;avancement</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {msg.author ? `${msg.author.first_name} ${msg.author.last_name}` : 'Inconnu'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(msg.created_at), "d MMM 'à' HH:mm", { locale: fr })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.message}</p>
                  {msg.photos && msg.photos.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {msg.photos.map((photo, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={photo} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Cutoffs ═══ */}
      {activeTab === 'cutoffs' && (
        <div className="space-y-4">
          {/* Add cutoff button */}
          {!showCutoffForm && (
            <button
              onClick={() => setShowCutoffForm(true)}
              className="w-full bg-white rounded-2xl border-2 border-dashed border-gray-300 p-4 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <AlertTriangle className="w-6 h-6 text-gray-400 mx-auto mb-1" />
              <span className="text-sm font-medium text-gray-600">Déclarer une coupure</span>
            </button>
          )}

          {/* Cutoff form */}
          {showCutoffForm && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-900">Nouvelle coupure</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={cutoffForm.cutoff_type}
                  onChange={(e) => setCutoffForm((prev) => ({ ...prev, cutoff_type: e.target.value }))}
                  className={inputClass}
                >
                  <option value="eau">💧 Eau</option>
                  <option value="electricite">⚡ Électricité</option>
                  <option value="gaz">🔥 Gaz</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Début *</label>
                  <input
                    type="datetime-local"
                    value={cutoffForm.start_date}
                    onChange={(e) => setCutoffForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fin estimée</label>
                  <input
                    type="datetime-local"
                    value={cutoffForm.end_date_estimated}
                    onChange={(e) => setCutoffForm((prev) => ({ ...prev, end_date_estimated: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Étages concernés</label>
                <input
                  type="text"
                  value={cutoffForm.floors_affected}
                  onChange={(e) => setCutoffForm((prev) => ({ ...prev, floors_affected: e.target.value }))}
                  className={inputClass}
                  placeholder="Ex: 1er au 3ème étage"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message pour les locataires</label>
                <textarea
                  value={cutoffForm.message}
                  onChange={(e) => setCutoffForm((prev) => ({ ...prev, message: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Information complémentaire..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCutoffForm(false)}
                  className="flex-1 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveCutoff}
                  disabled={isSavingCutoff}
                  className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isSavingCutoff ? 'Enregistrement...' : 'Déclarer la coupure'}
                </button>
              </div>
            </div>
          )}

          {/* Cutoffs list */}
          {cutoffs.length === 0 && !showCutoffForm ? (
            <div className="text-center py-12">
              <Droplets className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Aucune coupure déclarée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cutoffs.map((cutoff) => (
                <div key={cutoff.id} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    {getCutoffIcon(cutoff.cutoff_type)}
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{getCutoffLabel(cutoff.cutoff_type)}</h4>
                      <p className="text-xs text-gray-500">
                        {format(new Date(cutoff.start_date), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                        {cutoff.end_date_estimated && ` → ${format(new Date(cutoff.end_date_estimated), "d MMM 'à' HH:mm", { locale: fr })}`}
                      </p>
                    </div>
                  </div>
                  {cutoff.floors_affected && (
                    <p className="text-sm text-gray-600 mb-1">Étages : {cutoff.floors_affected}</p>
                  )}
                  {cutoff.message && (
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{cutoff.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
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
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-blue-600">
              <Phone className="w-3 h-3" />{phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-xs text-blue-600">
              <Mail className="w-3 h-3" />{email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
