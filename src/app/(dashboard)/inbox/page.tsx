'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  Mail,
  Clock,
  Building2,
  CalendarPlus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  MailOpen,
  Eye,
  Archive,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  Paperclip,
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
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailInbox | null>(null);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data: regiesData } = await supabase.from('regies').select('id, name, keyword, email_contact, email_domains').eq('is_active', true).order('name');
    if (regiesData) setRegies(regiesData);

    const { data: techData } = await supabase.from('users').select('id, first_name, last_name, email').eq('role', 'technician').order('last_name');
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

  const filteredEmails = urgentFilterActive
    ? enrichedEmails.filter(isEmailUrgent)
    : enrichedEmails;

  const emailsByRegie = regies.reduce((acc, regie) => {
    acc[regie.id] = filteredEmails
      .filter((email) => email.regie_id === regie.id)
      .sort(sortByDateDesc);
    return acc;
  }, {} as Record<string, EmailInbox[]>);

  const otherEmails = filteredEmails
    .filter((email) => !email.regie_id)
    .sort(sortByDateDesc);

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Boîte de réception</h2>
        <div className="flex items-center gap-3">
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
        <div className="space-y-6">
          {statusFilter !== 'ignored' && (
            <>
              {regies.some((r) => (emailsByRegie[r.id] || []).length > 0) && <h3 className="text-md font-medium text-gray-700">Demandes par régie</h3>}
              {regies.map((regie) => {
                const regieEmailsList = emailsByRegie[regie.id] || [];
                if (regieEmailsList.length === 0) return null;
                return <RegieSection key={regie.id} regie={regie} emails={regieEmailsList} onPlan={handlePlanIntervention} onView={handleViewDetail} onIgnore={(id) => updateEmailStatus(id, 'ignored')} onArchive={(id) => updateEmailStatus(id, 'processed')} showActions={statusFilter === 'new'} />;
              })}
            </>
          )}
          {otherEmails.length > 0 && (
            <div>
              <h3 className="text-md font-medium text-gray-700 mb-4">Autres emails</h3>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><MailOpen className="w-5 h-5 text-gray-600" /></div>
                      <div><h3 className="font-semibold text-gray-900">Autres emails</h3><p className="text-xs text-gray-500">Clients, fournisseurs et autres contacts</p></div>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-medium bg-gray-50 text-gray-700 rounded-full">{otherEmails.length} email{otherEmails.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {otherEmails.map((email) => <EmailCard key={email.id} email={email} onPlan={() => handlePlanIntervention(email)} onView={() => handleViewDetail(email)} onIgnore={() => updateEmailStatus(email.id, 'ignored')} onArchive={() => updateEmailStatus(email.id, 'processed')} isOther showActions={statusFilter === 'new'} />)}
                </div>
              </div>
            </div>
          )}
          {emails.length === 0 && <EmptyState statusFilter={statusFilter} />}
        </div>
      )}

      {/* Modal: Detail */}
      <Modal isOpen={isDetailModalOpen} onClose={() => { setIsDetailModalOpen(false); setSelectedEmail(null); }} title="Détail de l'email" size="lg">
        {selectedEmail && <EmailDetailView email={selectedEmail} regies={regies} onPlan={() => { setIsDetailModalOpen(false); handlePlanIntervention(selectedEmail); }} onIgnore={() => { updateEmailStatus(selectedEmail.id, 'ignored'); setIsDetailModalOpen(false); setSelectedEmail(null); }} onArchive={() => { updateEmailStatus(selectedEmail.id, 'processed'); setIsDetailModalOpen(false); setSelectedEmail(null); }} showActions={statusFilter === 'new'} />}
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

// ─── Regie Section ────────────────────────────────────────────────────────────

function RegieSection({ regie, emails, onPlan, onView, onIgnore, onArchive, showActions }: { regie: Regie; emails: EmailInbox[]; onPlan: (email: EmailInbox) => void; onView: (email: EmailInbox) => void; onIgnore: (id: string) => void; onArchive: (id: string) => void; showActions: boolean; }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const interventionCount = emails.filter((e) => getEmailType(e) === 'intervention').length;
  const infoCount = emails.filter((e) => getEmailType(e) === 'info').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setIsCollapsed(!isCollapsed)} className="w-full px-5 py-4 border-b border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-600" /></div>
            <div className="text-left"><h3 className="font-semibold text-gray-900">{regie.name}</h3><p className="text-xs text-gray-500">Mot-clé : {regie.keyword}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {interventionCount > 0 && <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">{interventionCount} intervention{interventionCount !== 1 ? 's' : ''}</span>}
            {infoCount > 0 && <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">{infoCount} info{infoCount !== 1 ? 's' : ''}</span>}
            {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400 ml-1" /> : <ChevronUp className="w-4 h-4 text-gray-400 ml-1" />}
          </div>
        </div>
      </button>
      {!isCollapsed && (
        emails.length === 0 ? (
          <div className="px-5 py-8 text-center"><CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" /><p className="text-sm text-gray-500">Rien à traiter</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {emails.map((email) => <EmailCard key={email.id} email={email} onPlan={() => onPlan(email)} onView={() => onView(email)} onIgnore={() => onIgnore(email.id)} onArchive={() => onArchive(email.id)} showActions={showActions} />)}
          </div>
        )
      )}
    </div>
  );
}

// ─── Email Card (simplifié — juste sujet + expéditeur + type) ─────────────────

function EmailCard({ email, onPlan, onView, onIgnore, onArchive, isOther = false, showActions = true }: { email: EmailInbox; onPlan: () => void; onView: () => void; onIgnore: () => void; onArchive: () => void; isOther?: boolean; showActions?: boolean; }) {
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';
  const isUrgent = !isInfo && isEmailUrgent(email);
  const timeAgo = formatDistanceToNow(new Date(email.received_at), { addSuffix: true, locale: fr });

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
            <h4 className={`font-medium truncate group-hover:text-blue-700 transition-colors ${isInfo ? 'text-gray-700' : 'text-gray-900'}`}>
              {email.subject || 'Sans objet'}
            </h4>
          </div>
          <p className="text-sm text-gray-500 mb-1.5">De : {email.from_name || email.from_email}</p>
          {email.body_text && <p className="text-sm text-gray-400 truncate max-w-lg">{email.body_text.substring(0, 120)}...</p>}
          <div className="flex items-center gap-3 mt-2">
            <p className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo}</p>
            {email.attachment_urls && email.attachment_urls.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1"><Paperclip className="w-3 h-3" />{email.attachment_urls.length} PDF</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {showActions && !isOther && (
            <>
              <button onClick={onIgnore} title="Ignorer" className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><XCircle className="w-4 h-4" /></button>
              <button onClick={onArchive} title="Archiver" className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Archive className="w-4 h-4" /></button>
              {!isInfo && (
                <button onClick={onPlan} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"><CalendarPlus className="w-4 h-4" />Planifier</button>
              )}
            </>
          )}
          {isOther && (
            <div className="flex items-center gap-2">
              {showActions && (
                <>
                  <button onClick={onIgnore} title="Ignorer" className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><XCircle className="w-4 h-4" /></button>
                  <button onClick={onArchive} title="Archiver" className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Archive className="w-4 h-4" /></button>
                </>
              )}
              <span className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg">{email.from_email?.split('@')[1] || 'inconnu'}</span>
            </div>
          )}
          {!showActions && <button onClick={onView} title="Voir détail" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Eye className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  );
}

// ─── Email Detail View (simplifié — montre le mail complet) ───────────────────

function EmailDetailView({ email, regies, onPlan, onIgnore, onArchive, showActions }: { email: EmailInbox; regies: Regie[]; onPlan: () => void; onIgnore: () => void; onArchive: () => void; showActions: boolean; }) {
  const regie = regies.find((r) => r.id === email.regie_id);
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isInfo ? <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full flex-shrink-0">INFO</span> : <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full flex-shrink-0">INTERVENTION</span>}
            <h3 className="text-lg font-semibold text-gray-900">{email.subject || 'Sans objet'}</h3>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{email.from_name || email.from_email}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{format(new Date(email.received_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
          {regie && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{regie.name}</span>}
        </div>
      </div>

      {/* Pièces jointes PDF */}
      {email.attachment_urls && email.attachment_urls.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">📎 Pièces jointes</p>
          <div className="space-y-2">
            {email.attachment_urls.map((url, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    Document PDF {idx + 1}
                  </span>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Ouvrir dans un nouvel onglet ↗
                  </a>
                </div>
                <iframe
                  src={url}
                  className="w-full h-[500px] border-0"
                  title={`PDF ${idx + 1}`}
                />
              </div>
            ))}
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
              dangerouslySetInnerHTML={{ __html: email.body_html }}
            />
          ) : (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {email.body_text || 'Aucun contenu disponible.'}
            </pre>
          )}
        </div>
      </div>

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

