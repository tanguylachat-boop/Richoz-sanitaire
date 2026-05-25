'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useSearchParams } from 'next/navigation';
import {
  Inbox,
  Mail,
  Clock,
  Building2,
  CalendarPlus,
  RefreshCw,
  AlertCircle,
  Eye,
  Archive,
  XCircle,
  FileText,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  Download,
  Search,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { PlanificationSplitView } from '@/components/interventions/PlanificationSplitView';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailInbox {
  id: string;
  received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  extracted_data: {
    title?: string;
    address?: string;
    tenant_name?: string;
    tenant_phone?: string;
    description?: string;
    priority?: string;
    email_type?: string;
  } | null;
  regie_id: string | null;
  work_order_number: string | null;
  attachment_urls: string[] | null;
  status: string;
  category: string | null;
  email_type: string | null;
}

interface Regie {
  id: string;
  name: string;
  keyword: string;
  email_contact: string | null;
  email_domains: string[] | null;
}

interface Technician {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

type StatusFilter = 'new' | 'processed' | 'ignored' | 'all';

// ─── Helper: detect email type ────────────────────────────────────────────────

function getEmailType(email: EmailInbox): 'intervention' | 'info' {
  const type = email.email_type || email.extracted_data?.email_type || 'info';
  return type === 'intervention' ? 'intervention' : 'info';
}

function isEmailUrgent(email: EmailInbox): boolean {
  return !!(email.subject?.toLowerCase().includes('urgent') || email.subject?.toLowerCase().includes('urgence') || email.extracted_data?.priority === 'urgent');
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailInbox[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');

  const [urgentFilterActive, setUrgentFilterActive] = useState(false);
  const [regieFilter, setRegieFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailInbox | null>(null);

  const supabase = createClient();
  const searchParams = useSearchParams();
  const autoOpenHandled = useRef(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data: regiesData } = await supabase.from('regies').select('id, name, keyword, email_contact, email_domains').eq('is_active', true).order('name');
    if (regiesData) setRegies(regiesData);

    const { data: techData } = await supabase.from('users').select('id, first_name, last_name, email, intervention_type_preference').eq('role', 'technician').order('last_name');
    if (techData) setTechnicians(techData);

    let query = supabase.from('email_inbox').select('id, received_at, from_email, from_name, subject, body_text, body_html, extracted_data, regie_id, work_order_number, status, category, email_type, attachment_urls').order('received_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data: emailsData, error: emailsError } = await query;
    if (emailsError) toast.error('Erreur lors du chargement des emails');
    if (emailsData) setEmails(emailsData as EmailInbox[]);
    setIsLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase.channel('email_inbox_changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_inbox' }, (payload) => {
      if (statusFilter === 'new' || statusFilter === 'all') {
        const newEmail = payload.new as EmailInbox;
        setEmails((prev) => [newEmail, ...prev]);
        toast.info(`Nouvel email de ${newEmail.from_name || newEmail.from_email}`);
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [statusFilter]);

  // Auto-open email from URL param ?email_id=<id>
  useEffect(() => {
    const emailId = searchParams.get('email_id');
    if (emailId && emails.length > 0 && !autoOpenHandled.current) {
      const targetEmail = emails.find((e) => e.id === emailId);
      if (targetEmail) {
        autoOpenHandled.current = true;
        setSelectedEmail(targetEmail);
        setIsDetailModalOpen(true);
      }
    }
  }, [searchParams, emails]);

  const findRegieByEmail = (fromEmail: string): string | null => {
    if (!fromEmail) return null;
    const emailDomain = fromEmail.split('@')[1]?.toLowerCase();
    if (!emailDomain) return null;
    for (const regie of regies) {
      if (regie.email_domains?.some((d) => emailDomain === d.toLowerCase())) return regie.id;
      if (regie.email_contact && fromEmail.toLowerCase() === regie.email_contact.toLowerCase()) return regie.id;
    }
    return null;
  };

  const enrichedEmails = emails.map((email) => {
    if (email.regie_id) return email;
    const matchedRegieId = findRegieByEmail(email.from_email);
    return matchedRegieId ? { ...email, regie_id: matchedRegieId } : email;
  });

  const sortByDateDesc = (a: EmailInbox, b: EmailInbox) =>
    new Date(b.received_at).getTime() - new Date(a.received_at).getTime();

  // Build a regie name lookup map for EmailCard badges and search
  const regieNameMap = new Map(regies.map((r) => [r.id, r.name]));

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEmails = enrichedEmails.filter((email) => {
    if (urgentFilterActive && !isEmailUrgent(email)) return false;
    if (regieFilter && email.regie_id !== regieFilter) return false;
    if (normalizedQuery) {
      const haystack = [
        email.work_order_number,
        email.subject,
        email.from_email,
        email.from_name,
        email.body_text,
        email.extracted_data?.title,
        email.extracted_data?.address,
        email.extracted_data?.tenant_name,
        email.extracted_data?.tenant_phone,
        email.extracted_data?.description,
        email.regie_id ? regieNameMap.get(email.regie_id) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const chronologicalEmails = filteredEmails.sort(sortByDateDesc);

  const totalEmails = enrichedEmails.length;
  const regieEmails = enrichedEmails.filter((e) => e.regie_id).length;
  const urgentEmails = enrichedEmails.filter(isEmailUrgent).length;
  const infoEmails = enrichedEmails.filter((e) => getEmailType(e) === 'info').length;

  const handlePlanIntervention = (email: EmailInbox) => { setSelectedEmail(email); setIsPlanModalOpen(true); };
  const handleViewDetail = (email: EmailInbox) => { setSelectedEmail(email); setIsDetailModalOpen(true); };

  const updateEmailStatus = async (emailId: string, status: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('email_inbox').update({ status, processed_at: new Date().toISOString() }).eq('id', emailId);
    if (error) { toast.error('Erreur lors de la mise à jour'); return; }
    setEmails((prev) => prev.filter((e) => e.id !== emailId));
    toast.success(status === 'processed' ? 'Email marqué comme traité' : 'Email ignoré');
  };

  const promoteToIntervention = async (emailId: string) => {
    // Manual override when the AI mis-classified an intervention as "info"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('email_inbox')
      .update({ email_type: 'intervention' })
      .eq('id', emailId);
    if (error) { toast.error('Échec du reclassement'); return; }
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, email_type: 'intervention' } : e))
    );
    toast.success('Email marqué comme intervention');
  };

  const handleInterventionSuccess = async () => {
    if (selectedEmail) await updateEmailStatus(selectedEmail.id, 'processed');
    setIsPlanModalOpen(false);
    setSelectedEmail(null);
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Mail className="w-6 h-6 text-blue-600" />} bgColor="bg-blue-50" value={totalEmails} label="Emails à traiter" />
        <StatCard icon={<Building2 className="w-6 h-6 text-amber-600" />} bgColor="bg-amber-50" value={regieEmails} label="Demandes de régies" />
        <StatCard icon={<AlertCircle className="w-6 h-6 text-red-600" />} bgColor="bg-red-50" value={urgentEmails} label="Urgents" onClick={() => setUrgentFilterActive(!urgentFilterActive)} active={urgentFilterActive} />
        <StatCard icon={<MessageSquare className="w-6 h-6 text-gray-600" />} bgColor="bg-gray-50" value={infoEmails} label="Infos / Suivi" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap">Boîte de réception</h2>
          <div className="relative flex-1 lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher : N° bon, sujet, expéditeur, locataire, adresse…"
              className="w-full h-10 pl-9 pr-9 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={regieFilter || ''}
            onChange={(e) => setRegieFilter(e.target.value || null)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Toutes les régies</option>
            {regies.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${statusFilter === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{f.label}</button>
            ))}
          </div>
          <button onClick={fetchData} disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />Actualiser
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? <LoadingState /> : (
        chronologicalEmails.length === 0 ? <EmptyState statusFilter={statusFilter} /> : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {chronologicalEmails.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  regieName={email.regie_id ? regieNameMap.get(email.regie_id) || null : null}
                  onPlan={() => handlePlanIntervention(email)}
                  onView={() => handleViewDetail(email)}
                  onIgnore={() => updateEmailStatus(email.id, 'ignored')}
                  onArchive={() => updateEmailStatus(email.id, 'processed')}
                  onPromote={() => promoteToIntervention(email.id)}
                  showActions={statusFilter === 'new'}
                />
              ))}
            </div>
          </div>
        )
      )}

      {/* Modal: Detail */}
      <Modal isOpen={isDetailModalOpen} onClose={() => { setIsDetailModalOpen(false); setSelectedEmail(null); }} title="Détail de l'email" size="lg">
        {selectedEmail && <EmailDetailView email={selectedEmail} regies={regies} onPlan={() => { setIsDetailModalOpen(false); handlePlanIntervention(selectedEmail); }} onIgnore={() => { updateEmailStatus(selectedEmail.id, 'ignored'); setIsDetailModalOpen(false); setSelectedEmail(null); }} onArchive={() => { updateEmailStatus(selectedEmail.id, 'processed'); setIsDetailModalOpen(false); setSelectedEmail(null); }} onPromote={() => { promoteToIntervention(selectedEmail.id); }} showActions={statusFilter === 'new'} />}
      </Modal>

      {/* Modal: Planification SPLIT VIEW — email à gauche, formulaire + calendrier à droite */}
      <Modal isOpen={isPlanModalOpen} onClose={() => { setIsPlanModalOpen(false); setSelectedEmail(null); }} title="Planifier l'intervention" size="full">
        <PlanificationSplitView email={selectedEmail} technicians={technicians} regies={regies} onSuccess={handleInterventionSuccess} onCancel={() => { setIsPlanModalOpen(false); setSelectedEmail(null); }} />
      </Modal>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'new', label: 'Nouveaux' },
  { value: 'processed', label: 'Traités' },
  { value: 'ignored', label: 'Ignorés' },
  { value: 'all', label: 'Tous' },
];

// ─── Small Components ─────────────────────────────────────────────────────────

function StatCard({ icon, bgColor, value, label, onClick, active }: { icon: React.ReactNode; bgColor: string; value: number; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} className={`rounded-xl border p-5 shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${active ? 'bg-red-50 border-red-500 ring-1 ring-red-500' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>{icon}</div>
        <div><p className={`text-2xl font-bold ${active ? 'text-red-700' : 'text-gray-900'}`}>{value}</p><p className={`text-sm ${active ? 'text-red-600' : 'text-gray-500'}`}>{label}</p></div>
      </div>
    </div>
  );
}

function LoadingState() {
  return <div className="bg-white rounded-xl border border-gray-200 p-12 text-center"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-500">Chargement...</p></div>;
}

function EmptyState({ statusFilter }: { statusFilter: StatusFilter }) {
  const messages: Record<StatusFilter, { title: string; desc: string }> = {
    new: { title: 'Aucune demande en attente', desc: 'Les nouveaux emails apparaîtront ici automatiquement.' },
    processed: { title: 'Aucun email traité', desc: 'Les emails traités apparaîtront ici.' },
    ignored: { title: 'Aucun email ignoré', desc: 'Les emails ignorés apparaîtront ici.' },
    all: { title: 'Aucun email', desc: 'La boîte de réception est vide.' },
  };
  const msg = messages[statusFilter];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><Inbox className="w-8 h-8 text-gray-400" /></div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{msg.title}</h3>
      <p className="text-gray-500 max-w-sm mx-auto">{msg.desc}</p>
    </div>
  );
}

// ─── Email Card ──────────────────────────────────────────────────────────────

function EmailCard({ email, regieName, onPlan, onView, onIgnore, onArchive, onPromote, showActions = true }: { email: EmailInbox; regieName?: string | null; onPlan: () => void; onView: () => void; onIgnore: () => void; onArchive: () => void; onPromote?: () => void; showActions?: boolean; }) {
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';
  const isUrgent = !isInfo && isEmailUrgent(email);
  const timeAgo = formatDistanceToNow(new Date(email.received_at), { addSuffix: true, locale: fr });
  // Suspect false-negative: AI marked it "info" but a work order or regie matched
  const looksLikeIntervention = isInfo && (!!email.work_order_number || !!email.regie_id);

  return (
    <div className={`px-5 py-4 hover:bg-blue-50/40 transition-colors group cursor-pointer ${isInfo ? 'bg-gray-50/30' : ''}`} onClick={onView}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isInfo && <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded flex-shrink-0">INFO</span>}
            {isUrgent && <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded flex-shrink-0">URGENT</span>}
            {!isInfo && !isUrgent && email.regie_id && <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded flex-shrink-0">INTERVENTION</span>}
            {email.status === 'processed' && <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded flex-shrink-0">TRAITÉ</span>}
            {email.status === 'ignored' && <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded flex-shrink-0">IGNORÉ</span>}
            {regieName && <span className="px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded flex-shrink-0 flex items-center gap-1"><Building2 className="w-3 h-3" />{regieName}</span>}
            <h4 className={`font-medium truncate group-hover:text-blue-700 transition-colors ${isInfo ? 'text-gray-700' : 'text-gray-900'}`}>
              {email.work_order_number ? `Bon N° ${email.work_order_number}` : email.subject || 'Sans objet'}
            </h4>
            {email.work_order_number && email.subject && (
              <span className="text-xs text-gray-400 truncate hidden sm:inline-block max-w-xs">— {email.subject}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-1.5">De : {email.from_name || email.from_email}</p>
          {email.body_text && <p className="text-sm text-gray-400 truncate max-w-lg">{email.body_text.substring(0, 120)}...</p>}
          <div className="flex items-center gap-3 mt-2">
            <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo}</p>
            {email.attachment_urls && email.attachment_urls.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1"><Paperclip className="w-3 h-3" />{email.attachment_urls.length} fichier{email.attachment_urls.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {showActions && (
            <>
              <button onClick={onIgnore} title="Ignorer" className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><XCircle className="w-4 h-4" /></button>
              <button onClick={onArchive} title="Archiver" className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Archive className="w-4 h-4" /></button>
              {looksLikeIntervention && onPromote && (
                <button
                  onClick={onPromote}
                  title="L'IA a classé cet email en 'info' mais une régie/bon a matché — convertir en intervention"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                >
                  Convertir en intervention
                </button>
              )}
              {!isInfo && (
                <button onClick={onPlan} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"><CalendarPlus className="w-4 h-4" />Planifier</button>
              )}
            </>
          )}
          {!showActions && <button onClick={onView} title="Voir détail" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Eye className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  );
}

// ─── Email Detail View (simplifié — montre le mail complet) ───────────────────

function EmailDetailView({ email, regies, onPlan, onIgnore, onArchive, onPromote, showActions }: { email: EmailInbox; regies: Regie[]; onPlan: () => void; onIgnore: () => void; onArchive: () => void; onPromote?: () => void; showActions: boolean; }) {
  const regie = regies.find((r) => r.id === email.regie_id);
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';
  const looksLikeIntervention = isInfo && (!!email.work_order_number || !!email.regie_id);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isInfo ? <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full flex-shrink-0">INFO</span> : <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full flex-shrink-0">INTERVENTION</span>}
            <h3 className="text-lg font-semibold text-gray-900">
              {email.work_order_number ? `Bon N° ${email.work_order_number}` : email.subject || 'Sans objet'}
            </h3>
            {email.work_order_number && email.subject && (
              <span className="text-sm text-gray-500 truncate">— {email.subject}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{email.from_name || email.from_email}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{format(new Date(email.received_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
          {regie && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{regie.name}</span>}
        </div>
      </div>

      {/* Pièces jointes */}
      {email.attachment_urls && email.attachment_urls.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">📎 Pièces jointes</p>
          <div className="space-y-3">
            {email.attachment_urls.map((url, idx) => {
              const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
              const fileName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || `fichier-${idx + 1}`);
              const isPdf = ext === 'pdf';
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);

              if (isPdf) {
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-red-500" />
                        {fileName}
                      </span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        Ouvrir ↗
                      </a>
                    </div>
                    <iframe
                      src={url}
                      className="w-full h-[500px] border-0"
                      title={fileName}
                      onError={(e) => { (e.target as HTMLIFrameElement).style.display = 'none'; }}
                    />
                  </div>
                );
              }

              if (isImage) {
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-500" />
                        {fileName}
                      </span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        Ouvrir ↗
                      </a>
                    </div>
                    <img
                      src={url}
                      alt={fileName}
                      className="max-w-full h-auto max-h-[500px] object-contain mx-auto p-2"
                    />
                  </div>
                );
              }

              // Document / unknown — download link
              return (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{fileName}</span>
                  <span className="text-xs text-gray-400 uppercase flex-shrink-0">{ext || '?'}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Contenu complet de l'email */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Contenu de l&apos;email</p>
        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto border border-gray-200">
          {email.body_html ? (
            <div
              className="text-sm text-gray-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
            />
          ) : (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {email.body_text || 'Aucun contenu disponible.'}
            </pre>
          )}
        </div>
      </div>

      {/* Misclassification hint */}
      {looksLikeIntervention && onPromote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="text-amber-900 font-medium">Cet email est classé en « info » mais une régie ou un bon de travail a été détecté.</p>
            <p className="text-amber-700 text-xs mt-0.5">Convertis-le en intervention pour activer la planification.</p>
          </div>
          <button onClick={onPromote} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">
            Convertir en intervention
          </button>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={onIgnore} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg transition-colors"><XCircle className="w-4 h-4" />Ignorer</button>
            <button onClick={onArchive} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"><Archive className="w-4 h-4" />Archiver</button>
          </div>
          {!isInfo && (
            <button onClick={onPlan} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"><CalendarPlus className="w-4 h-4" />Planifier l&apos;intervention</button>
          )}
        </div>
      )}
    </div>
  );
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-lg">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div className="min-w-0"><p className="text-xs text-gray-400">{label}</p><p className="text-sm font-medium text-gray-900 truncate">{value}</p></div>
    </div>
  );
}

