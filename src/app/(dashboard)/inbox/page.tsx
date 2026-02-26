'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Inbox,
  Mail,
  Clock,
  Building2,
  CalendarPlus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  MailOpen,
  Eye,
  Archive,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  User,
  Phone,
  MapPin,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import {
  format,
  formatDistanceToNow,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addWeeks,
  subWeeks,
  addMinutes,
} from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailInbox {
  id: string;
  received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
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

interface CalendarIntervention {
  id: string;
  title: string;
  date_planned: string;
  estimated_duration_minutes: number;
  status: string;
  technician_id: string | null;
  intervention_type?: string | null;
}

type StatusFilter = 'new' | 'processed' | 'ignored' | 'all';

// ─── Helper: detect email type ────────────────────────────────────────────────

function getEmailType(email: EmailInbox): 'intervention' | 'info' {
  const type = email.email_type || email.extracted_data?.email_type || 'info';
  return type === 'intervention' ? 'intervention' : 'info';
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailInbox[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('new');

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

    let query = supabase.from('email_inbox').select('id, received_at, from_email, from_name, subject, body_text, extracted_data, regie_id, work_order_number, status, category, email_type').order('received_at', { ascending: false });
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

  const emailsByRegie = regies.reduce((acc, regie) => {
    acc[regie.id] = enrichedEmails.filter((email) => email.regie_id === regie.id);
    return acc;
  }, {} as Record<string, EmailInbox[]>);

  const otherEmails = enrichedEmails.filter((email) => !email.regie_id);

  const totalEmails = enrichedEmails.length;
  const regieEmails = enrichedEmails.filter((e) => e.regie_id).length;
  const urgentEmails = enrichedEmails.filter((e) => e.subject?.toLowerCase().includes('urgent') || e.subject?.toLowerCase().includes('urgence') || e.extracted_data?.priority === 'urgent').length;
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
        <StatCard icon={<AlertCircle className="w-6 h-6 text-red-600" />} bgColor="bg-red-50" value={urgentEmails} label="Urgents" />
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

      {/* Modal: Planification SPLIT VIEW */}
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

function StatCard({ icon, bgColor, value, label }: { icon: React.ReactNode; bgColor: string; value: number; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>{icon}</div>
        <div><p className="text-2xl font-bold text-gray-900">{value}</p><p className="text-sm text-gray-500">{label}</p></div>
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

// ─── Email Card ───────────────────────────────────────────────────────────────

function EmailCard({ email, onPlan, onView, onIgnore, onArchive, isOther = false, showActions = true }: { email: EmailInbox; onPlan: () => void; onView: () => void; onIgnore: () => void; onArchive: () => void; isOther?: boolean; showActions?: boolean; }) {
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';
  const isUrgent = !isInfo && (email.subject?.toLowerCase().includes('urgent') || email.subject?.toLowerCase().includes('urgence') || email.extracted_data?.priority === 'urgent');
  const extractedTitle = email.extracted_data?.title || email.subject || 'Sans objet';
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
            <h4 className={`font-medium truncate group-hover:text-blue-700 transition-colors ${isInfo ? 'text-gray-700' : 'text-gray-900'}`}>{extractedTitle}</h4>
          </div>
          <p className="text-sm text-gray-500 mb-1.5">De : {email.from_name || email.from_email}</p>
          {!isInfo && (
            <div className="flex items-center gap-4 flex-wrap">
              {email.extracted_data?.address && <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{email.extracted_data.address}</p>}
              {email.work_order_number && <p className="text-sm text-gray-500 flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{email.work_order_number}</p>}
              {email.extracted_data?.tenant_name && <p className="text-sm text-gray-500 flex items-center gap-1"><User className="w-3.5 h-3.5" />{email.extracted_data.tenant_name}</p>}
            </div>
          )}
          {isInfo && email.body_text && <p className="text-sm text-gray-400 truncate max-w-lg">{email.body_text.substring(0, 120)}...</p>}
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {showActions && !isOther && (
            <>
              <button onClick={onIgnore} title="Ignorer" className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><XCircle className="w-4 h-4" /></button>
              <button onClick={onArchive} title="Archiver" className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Archive className="w-4 h-4" /></button>
              {isInfo ? (
                <button onClick={onView} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"><Eye className="w-4 h-4" />Voir</button>
              ) : (
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

// ─── Email Detail View ────────────────────────────────────────────────────────

function EmailDetailView({ email, regies, onPlan, onIgnore, onArchive, showActions }: { email: EmailInbox; regies: Regie[]; onPlan: () => void; onIgnore: () => void; onArchive: () => void; showActions: boolean; }) {
  const regie = regies.find((r) => r.id === email.regie_id);
  const extracted = email.extracted_data;
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isInfo ? <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full flex-shrink-0">INFO</span> : <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full flex-shrink-0">INTERVENTION</span>}
            <h3 className="text-lg font-semibold text-gray-900">{extracted?.title || email.subject || 'Sans objet'}</h3>
          </div>
          {extracted?.priority === 'urgent' && !isInfo && <span className="px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full flex-shrink-0">URGENT</span>}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{email.from_name || email.from_email}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{format(new Date(email.received_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
        </div>
      </div>
      {isInfo && regie && <div className="p-3 bg-amber-50 rounded-lg border border-amber-100"><p className="text-sm text-amber-800"><strong>De :</strong> {regie.name} — Cet email n&apos;est pas un bon d&apos;intervention</p></div>}
      {extracted && !isInfo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {extracted.address && <InfoPill icon={<MapPin className="w-4 h-4" />} label="Adresse" value={extracted.address} />}
            {extracted.tenant_name && <InfoPill icon={<User className="w-4 h-4" />} label="Locataire" value={extracted.tenant_name} />}
            {extracted.tenant_phone && <InfoPill icon={<Phone className="w-4 h-4" />} label="Téléphone" value={extracted.tenant_phone} />}
            {email.work_order_number && <InfoPill icon={<FileText className="w-4 h-4" />} label="Bon de travail" value={email.work_order_number} />}
            {regie && <InfoPill icon={<Building2 className="w-4 h-4" />} label="Régie" value={regie.name} />}
          </div>
          {extracted.description && <div><p className="text-sm font-medium text-gray-700 mb-2">Description pour le technicien</p><div className="bg-blue-50 rounded-lg p-4 border border-blue-100"><pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{extracted.description}</pre></div></div>}
        </>
      )}
      <div><p className="text-sm font-medium text-gray-700 mb-2">Contenu de l&apos;email</p><div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto"><pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{email.body_text || 'Aucun contenu texte disponible.'}</pre></div></div>
      {showActions && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={onIgnore} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-gray-200 hover:bg-red-50 rounded-lg transition-colors"><XCircle className="w-4 h-4" />Ignorer</button>
            <button onClick={onArchive} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"><Archive className="w-4 h-4" />Archiver</button>
          </div>
          {isInfo ? (
            <button onClick={onArchive} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors shadow-sm"><CheckCircle className="w-4 h-4" />Marquer comme lu</button>
          ) : (
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

// ═══════════════════════════════════════════════════════════════════════════════
// SPLIT VIEW: Formulaire à gauche + Mini calendrier à droite
// ═══════════════════════════════════════════════════════════════════════════════

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const LUNCH_START = 12;
const LUNCH_END_HOUR = 13;
const LUNCH_END_MIN = 30;

function PlanificationSplitView({ email, technicians, regies, onSuccess, onCancel }: { email: EmailInbox | null; technicians: Technician[]; regies: Regie[]; onSuccess: () => void; onCancel: () => void; }) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState(new Date());
  const [calendarInterventions, setCalendarInterventions] = useState<CalendarIntervention[]>([]);

  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '',
    intervention_type: 'depannage',
  });

  const supabase = createClient();

  // Pre-fill from email
  useEffect(() => {
    if (email) {
      const extracted = email.extracted_data;
      setFormData((prev) => ({
        ...prev,
        title: extracted?.title || email.subject || '',
        description: extracted?.description || extracted?.title || email.subject || '',
        address: extracted?.address || '',
        client_name: extracted?.tenant_name || '',
        client_phone: extracted?.tenant_phone || '',
        priority: email.subject?.toLowerCase().includes('urgent') || extracted?.priority === 'urgent' ? 1 : 0,
        regie_id: email.regie_id || '',
        work_order_number: email.work_order_number || '',
      }));
    }
  }, [email]);

  // Fetch calendar interventions for the selected week & technician
  const weekStart = useMemo(() => startOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);
  const weekEnd = useMemo(() => endOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const fetchCalendarData = useCallback(async () => {
    let query = supabase
      .from('interventions')
      .select('id, title, date_planned, estimated_duration_minutes, status, technician_id, intervention_type')
      .gte('date_planned', weekStart.toISOString())
      .lte('date_planned', weekEnd.toISOString())
      .not('status', 'eq', 'annule');

    if (formData.technician_id) {
      query = query.eq('technician_id', formData.technician_id);
    }

    const { data } = await query;
    if (data) setCalendarInterventions(data as CalendarIntervention[]);
  }, [weekStart, weekEnd, formData.technician_id]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' || name === 'estimated_duration_minutes' ? parseInt(value) : value,
    }));
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (hour >= LUNCH_START && hour < 13.5) return;
    setFormData((prev) => ({
      ...prev,
      date_planned: format(day, 'yyyy-MM-dd'),
      time_planned: `${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 === 0.5 ? '30' : '00'}`,
    }));
  };

  // ════════════════════════════════════════════════════════════
  // SUBMIT — crée l'intervention + envoie email confirmation
  // ════════════════════════════════════════════════════════════
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let datePlanned = null;
      if (formData.date_planned) {
        const dateStr = formData.time_planned ? `${formData.date_planned}T${formData.time_planned}:00` : `${formData.date_planned}T09:00:00`;
        datePlanned = new Date(dateStr).toISOString();
      }
      const clientInfo: Record<string, string> = {};
      if (formData.client_name) clientInfo.name = formData.client_name;
      if (formData.client_phone) clientInfo.phone = formData.client_phone;

      // Créer l'intervention et récupérer l'ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('interventions').insert({
        title: formData.title, description: formData.description || null,
        address: formData.address, date_planned: datePlanned,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        status: formData.status, priority: formData.priority,
        technician_id: formData.technician_id || null,
        regie_id: formData.regie_id || null,
        work_order_number: formData.work_order_number || null,
        client_info: Object.keys(clientInfo).length > 0 ? clientInfo : null,
        source_type: 'email', source_email_id: email?.id || null,
        intervention_type: formData.intervention_type,
      }).select('id');

      if (error) throw new Error(error.message);

      // ══ Envoyer email de confirmation à la régie ══
      if (formData.regie_id && data?.[0]?.id) {
        try {
          await fetch('https://primary-production-66b7.up.railway.app/webhook/confirmation-regie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intervention_id: data[0].id }),
          });
          toast.success('📧 Email de confirmation envoyé');
        } catch (emailError) {
          console.error('Erreur envoi email confirmation:', emailError);
          toast.warning('Intervention créée mais email non envoyé');
        }
      }

      toast.success('Intervention planifiée avec succès');
      onSuccess();
    } catch (error) {
      console.error('Error creating intervention:', error);
      toast.error("Erreur lors de la création de l'intervention");
    } finally {
      setIsLoading(false);
    }
  };

  const getTechName = (tech: Technician) => {
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    return tech.first_name || tech.last_name || tech.email;
  };

  const selectedTechName = formData.technician_id
    ? getTechName(technicians.find(t => t.id === formData.technician_id)!)
    : 'Tous les techniciens';

  const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = `${inputClass} bg-white`;

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  const getInterventionsForDayCol = (day: Date) => {
    return calendarInterventions.filter(iv => iv.date_planned && isSameDay(new Date(iv.date_planned), day));
  };

  const getBlockStyle = (iv: CalendarIntervention) => {
    const d = new Date(iv.date_planned);
    const h = d.getHours();
    const m = d.getMinutes();
    const startMin = Math.max((h - START_HOUR) * 60 + m, 0);
    const dur = Math.max(iv.estimated_duration_minutes || 30, 15);
    const endMin = Math.min(startMin + dur, TOTAL_HOURS * 60);
    return {
      top: (startMin / 60) * HOUR_HEIGHT,
      height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 16),
    };
  };

  const lunchTop = (LUNCH_START - START_HOUR) * HOUR_HEIGHT;
  const lunchHeight = ((LUNCH_END_HOUR - LUNCH_START) * 60 + LUNCH_END_MIN) / 60 * HOUR_HEIGHT;

  return (
    <div className="flex gap-6 max-h-[80vh]">
      {/* ═══ LEFT: Formulaire ═══ */}
      <div className="w-[420px] flex-shrink-0 overflow-y-auto pr-4 border-r border-gray-200">
        <form onSubmit={handleSubmit} className="space-y-4 pb-4">
          {email && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="text-blue-700"><strong>Source :</strong> Email de {email.from_name || email.from_email}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input type="text" name="title" required value={formData.title} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows={2} value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
            <input type="text" name="address" required value={formData.address} onChange={handleChange} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technicien</label>
              <select name="technician_id" value={formData.technician_id} onChange={handleChange} className={selectClass}>
                <option value="">-- Non assigné --</option>
                {technicians.map((tech) => <option key={tech.id} value={tech.id}>{getTechName(tech)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="intervention_type" value={formData.intervention_type} onChange={handleChange} className={selectClass}>
                <option value="depannage">🔧 Dépannage</option>
                <option value="chantier">🏗️ Chantier</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Régie</label>
            <select name="regie_id" value={formData.regie_id} onChange={handleChange} className={selectClass}>
              <option value="">-- Aucune --</option>
              {regies.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° Bon de travail</label>
            <input type="text" name="work_order_number" value={formData.work_order_number} onChange={handleChange} className={inputClass} />
          </div>

          <div className={`p-3 rounded-lg border ${formData.date_planned ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {formData.date_planned ? (
              <p className="text-sm text-green-800">
                📅 <strong>{format(new Date(formData.date_planned), 'EEEE d MMMM', { locale: fr })}</strong> à <strong>{formData.time_planned || '09:00'}</strong>
              </p>
            ) : (
              <p className="text-sm text-amber-800">👆 Cliquez sur un créneau libre dans le calendrier →</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" name="date_planned" value={formData.date_planned} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heure</label>
              <input type="time" name="time_planned" value={formData.time_planned} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (min)</label>
              <input type="number" name="estimated_duration_minutes" min="15" step="15" value={formData.estimated_duration_minutes} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select name="status" value={formData.status} onChange={handleChange} className={selectClass}>
                <option value="nouveau">Nouveau</option>
                <option value="planifie">Planifié</option>
                <option value="en_cours">En cours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
              <select name="priority" value={formData.priority} onChange={handleChange} className={selectClass}>
                <option value={0}>Normal</option>
                <option value={1}>Urgent</option>
                <option value={2}>Urgence absolue</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom client</label>
              <input type="text" name="client_name" value={formData.client_name} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" name="client_phone" value={formData.client_phone} onChange={handleChange} className={inputClass} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Planification...' : "Planifier"}
            </button>
          </div>
        </form>
      </div>

      {/* ═══ RIGHT: Mini calendrier semaine ═══ */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setCalendarWeek(subWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-gray-700">
              {format(weekStart, 'd MMM', { locale: fr })} – {format(weekEnd, 'd MMM yyyy', { locale: fr })}
            </span>
            <button onClick={() => setCalendarWeek(addWeeks(calendarWeek, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setCalendarWeek(new Date())} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg font-medium">Auj.</button>
          </div>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {selectedTechName}
          </span>
        </div>

        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
          <div className="flex min-w-[500px]">
            <div className="flex-shrink-0 w-12 border-r border-gray-200">
              <div className="h-8 border-b border-gray-200" />
              <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                {hours.map((hour) => (
                  <div key={hour} className="absolute w-full text-right pr-1.5 text-[10px] text-gray-400 -translate-y-1/2" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}>
                    {`${String(hour).padStart(2, '0')}:00`}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}>
              {weekDays.map((day, colIdx) => {
                const dayIvs = getInterventionsForDayCol(day);
                const today = isToday(day);
                const isSelected = formData.date_planned && isSameDay(new Date(formData.date_planned + 'T00:00:00'), day);

                return (
                  <div key={colIdx} className="border-r border-gray-100 last:border-r-0">
                    <div className={`h-8 flex items-center justify-center border-b border-gray-200 text-xs font-medium ${today ? 'bg-blue-50 text-blue-600' : isSelected ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>
                      {format(day, 'EEE d', { locale: fr })}
                    </div>

                    <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                      {hours.map((hour) => (
                        <div key={hour} className="absolute w-full border-t border-gray-50" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }} />
                      ))}

                      {hours.map((hour) => [0, 0.5].map((half) => {
                        const slotHour = hour + half;
                        const isLunch = slotHour >= LUNCH_START && slotHour < 13.5;
                        if (isLunch) return null;
                        return (
                          <div
                            key={`${hour}-${half}`}
                            className="absolute left-0 right-0 cursor-pointer hover:bg-blue-50 transition-colors z-[1]"
                            style={{ top: (slotHour - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT / 2 }}
                            onClick={() => handleSlotClick(day, slotHour)}
                            title={`${String(Math.floor(slotHour)).padStart(2, '0')}:${half ? '30' : '00'}`}
                          />
                        );
                      }))}

                      <div className="absolute left-0 right-0 z-[2] pointer-events-none" style={{ top: lunchTop, height: lunchHeight }}>
                        <div className="w-full h-full bg-gray-100 border-y border-dashed border-gray-300 flex items-center justify-center">
                          <span className="text-[10px] text-gray-400">🍽️</span>
                        </div>
                      </div>

                      {today && (() => {
                        const now = new Date();
                        const nowMin = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                        if (nowMin < 0 || nowMin > TOTAL_HOURS * 60) return null;
                        return <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: (nowMin / 60) * HOUR_HEIGHT }}><div className="h-px bg-red-500 w-full" /><div className="w-1.5 h-1.5 rounded-full bg-red-500 -mt-[3px] -ml-0.5" /></div>;
                      })()}

                      {isSelected && formData.time_planned && (() => {
                        const [h, m] = formData.time_planned.split(':').map(Number);
                        const slotMin = (h - START_HOUR) * 60 + m;
                        const durMin = formData.estimated_duration_minutes || 60;
                        const top = (slotMin / 60) * HOUR_HEIGHT;
                        const height = (durMin / 60) * HOUR_HEIGHT;
                        return (
                          <div
                            className="absolute left-0.5 right-0.5 rounded border-2 border-dashed border-green-500 bg-green-100/50 z-[8] pointer-events-none"
                            style={{ top, height: Math.max(height, 16) }}
                          >
                            <div className="px-1 py-0.5 text-[10px] font-medium text-green-700 truncate">
                              📌 {formData.title || 'Nouvelle'}
                            </div>
                          </div>
                        );
                      })()}

                      {dayIvs.map((iv) => {
                        const { top, height } = getBlockStyle(iv);
                        const isDepannage = iv.intervention_type !== 'chantier';
                        const color = isDepannage ? 'bg-red-400 border-red-600' : 'bg-blue-400 border-blue-600';
                        const startTime = format(new Date(iv.date_planned), 'HH:mm');
                        const endTime = format(addMinutes(new Date(iv.date_planned), iv.estimated_duration_minutes || 30), 'HH:mm');

                        return (
                          <div
                            key={iv.id}
                            className={`absolute left-0.5 right-0.5 rounded border-l-2 text-white text-[10px] overflow-hidden z-[5] ${color}`}
                            style={{ top, height: Math.max(height, 16) }}
                            title={`${iv.title} (${startTime}-${endTime})`}
                          >
                            <div className="px-1 py-0.5 truncate font-medium">{iv.title}</div>
                            {height >= 28 && <div className="px-1 text-white/70">{startTime}-{endTime}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400" />Dépannage</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" />Chantier</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-100 border border-dashed border-green-500" />Nouveau RDV</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gray-100" />Pause midi</span>
        </div>
      </div>
    </div>
  );
}