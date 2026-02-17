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
  Loader2,
  MailOpen,
  Eye,
  Archive,
  XCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  MapPin,
  FileText,
  X,
  MessageSquare,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
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

  // Modals
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailInbox | null>(null);

  const supabase = createClient();

  // ─── Fetch Data ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    // Fetch regies
    const { data: regiesData } = await supabase
      .from('regies')
      .select('id, name, keyword, email_contact, email_domains')
      .eq('is_active', true)
      .order('name');

    if (regiesData) setRegies(regiesData);

    // Fetch technicians
    const { data: techData } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('role', 'technician')
      .order('last_name');

    if (techData) setTechnicians(techData);

    // Fetch emails based on filter
    let query = supabase
      .from('email_inbox')
      .select(`
        id, received_at, from_email, from_name, subject, body_text,
        extracted_data, regie_id, work_order_number, status, category, email_type
      `)
      .order('received_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: emailsData, error: emailsError } = await query;

    if (emailsError) {
      console.error('Error fetching emails:', emailsError);
      toast.error('Erreur lors du chargement des emails');
    }
    if (emailsData) {
      setEmails(emailsData as EmailInbox[]);
    }

    setIsLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Realtime subscription ────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('email_inbox_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_inbox' },
        (payload) => {
          if (statusFilter === 'new' || statusFilter === 'all') {
            const newEmail = payload.new as EmailInbox;
            setEmails((prev) => [newEmail, ...prev]);
            toast.info(`Nouvel email de ${newEmail.from_name || newEmail.from_email}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  // ─── Computed ─────────────────────────────────────────────────────────────

  const findRegieByEmail = (fromEmail: string): string | null => {
    if (!fromEmail) return null;
    const emailDomain = fromEmail.split('@')[1]?.toLowerCase();
    if (!emailDomain) return null;

    for (const regie of regies) {
      if (regie.email_domains?.some((d) => emailDomain === d.toLowerCase())) {
        return regie.id;
      }
      if (regie.email_contact && fromEmail.toLowerCase() === regie.email_contact.toLowerCase()) {
        return regie.id;
      }
    }
    return null;
  };

  const enrichedEmails = emails.map((email) => {
    if (email.regie_id) return email;
    const matchedRegieId = findRegieByEmail(email.from_email);
    if (matchedRegieId) {
      return { ...email, regie_id: matchedRegieId };
    }
    return email;
  });

  const emailsByRegie = regies.reduce((acc, regie) => {
    acc[regie.id] = enrichedEmails.filter((email) => email.regie_id === regie.id);
    return acc;
  }, {} as Record<string, EmailInbox[]>);

  const otherEmails = enrichedEmails.filter((email) => !email.regie_id);

  const totalEmails = enrichedEmails.length;
  const regieEmails = enrichedEmails.filter((e) => e.regie_id).length;
  const urgentEmails = enrichedEmails.filter(
    (e) =>
      e.subject?.toLowerCase().includes('urgent') ||
      e.subject?.toLowerCase().includes('urgence') ||
      e.extracted_data?.priority === 'urgent'
  ).length;
  const infoEmails = enrichedEmails.filter((e) => getEmailType(e) === 'info').length;

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handlePlanIntervention = (email: EmailInbox) => {
    setSelectedEmail(email);
    setIsPlanModalOpen(true);
  };

  const handleViewDetail = (email: EmailInbox) => {
    setSelectedEmail(email);
    setIsDetailModalOpen(true);
  };

  const updateEmailStatus = async (emailId: string, status: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('email_inbox')
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', emailId);

    if (error) {
      toast.error('Erreur lors de la mise à jour');
      return;
    }

    setEmails((prev) => prev.filter((e) => e.id !== emailId));
    toast.success(
      status === 'processed' ? 'Email marqué comme traité' : 'Email ignoré'
    );
  };

  const handleInterventionSuccess = async () => {
    if (selectedEmail) {
      await updateEmailStatus(selectedEmail.id, 'processed');
    }
    setIsPlanModalOpen(false);
    setSelectedEmail(null);
    fetchData();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ═══ Stats Cards ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Mail className="w-6 h-6 text-blue-600" />}
          bgColor="bg-blue-50"
          value={totalEmails}
          label="Emails à traiter"
        />
        <StatCard
          icon={<Building2 className="w-6 h-6 text-amber-600" />}
          bgColor="bg-amber-50"
          value={regieEmails}
          label="Demandes de régies"
        />
        <StatCard
          icon={<AlertCircle className="w-6 h-6 text-red-600" />}
          bgColor="bg-red-50"
          value={urgentEmails}
          label="Urgents"
        />
        <StatCard
          icon={<MessageSquare className="w-6 h-6 text-gray-600" />}
          bgColor="bg-gray-50"
          value={infoEmails}
          label="Infos / Suivi"
        />
      </div>

      {/* ═══ Toolbar ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Boîte de réception</h2>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  statusFilter === f.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ═══ Content ═══ */}
      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {statusFilter !== 'ignored' && (
            <>
              {regies.some((r) => (emailsByRegie[r.id] || []).length > 0) && (
                <h3 className="text-md font-medium text-gray-700">Demandes par régie</h3>
              )}

              {regies.map((regie) => {
                const regieEmailsList = emailsByRegie[regie.id] || [];
                if (regieEmailsList.length === 0) return null;
                return (
                  <RegieSection
                    key={regie.id}
                    regie={regie}
                    emails={regieEmailsList}
                    onPlan={handlePlanIntervention}
                    onView={handleViewDetail}
                    onIgnore={(id) => updateEmailStatus(id, 'ignored')}
                    onArchive={(id) => updateEmailStatus(id, 'processed')}
                    showActions={statusFilter === 'new'}
                  />
                );
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
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <MailOpen className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Autres emails</h3>
                        <p className="text-xs text-gray-500">Clients, fournisseurs et autres contacts</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-medium bg-gray-50 text-gray-700 rounded-full">
                      {otherEmails.length} email{otherEmails.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {otherEmails.map((email) => (
                    <EmailCard
                      key={email.id}
                      email={email}
                      onPlan={() => handlePlanIntervention(email)}
                      onView={() => handleViewDetail(email)}
                      onIgnore={() => updateEmailStatus(email.id, 'ignored')}
                      onArchive={() => updateEmailStatus(email.id, 'processed')}
                      isOther
                      showActions={statusFilter === 'new'}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {emails.length === 0 && <EmptyState statusFilter={statusFilter} />}
        </div>
      )}

      {/* ═══ Modal: Detail ═══ */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => { setIsDetailModalOpen(false); setSelectedEmail(null); }}
        title="Détail de l'email"
        size="lg"
      >
        {selectedEmail && (
          <EmailDetailView
            email={selectedEmail}
            regies={regies}
            onPlan={() => { setIsDetailModalOpen(false); handlePlanIntervention(selectedEmail); }}
            onIgnore={() => { updateEmailStatus(selectedEmail.id, 'ignored'); setIsDetailModalOpen(false); setSelectedEmail(null); }}
            onArchive={() => { updateEmailStatus(selectedEmail.id, 'processed'); setIsDetailModalOpen(false); setSelectedEmail(null); }}
            showActions={statusFilter === 'new'}
          />
        )}
      </Modal>

      {/* ═══ Modal: Planification ═══ */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => { setIsPlanModalOpen(false); setSelectedEmail(null); }}
        title="Planifier l'intervention"
        size="lg"
      >
        <PlanificationForm
          email={selectedEmail}
          technicians={technicians}
          regies={regies}
          onSuccess={handleInterventionSuccess}
          onCancel={() => { setIsPlanModalOpen(false); setSelectedEmail(null); }}
        />
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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, bgColor, value, label }: { icon: React.ReactNode; bgColor: string; value: number; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-gray-500">Chargement...</p>
    </div>
  );
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
      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Inbox className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{msg.title}</h3>
      <p className="text-gray-500 max-w-sm mx-auto">{msg.desc}</p>
    </div>
  );
}

// ─── Regie Section ────────────────────────────────────────────────────────────

function RegieSection({
  regie, emails, onPlan, onView, onIgnore, onArchive, showActions,
}: {
  regie: Regie; emails: EmailInbox[];
  onPlan: (email: EmailInbox) => void; onView: (email: EmailInbox) => void;
  onIgnore: (id: string) => void; onArchive: (id: string) => void; showActions: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const interventionCount = emails.filter((e) => getEmailType(e) === 'intervention').length;
  const infoCount = emails.filter((e) => getEmailType(e) === 'info').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-5 py-4 border-b border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">{regie.name}</h3>
              <p className="text-xs text-gray-500">Mot-clé : {regie.keyword}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {interventionCount > 0 && (
              <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                {interventionCount} intervention{interventionCount !== 1 ? 's' : ''}
              </span>
            )}
            {infoCount > 0 && (
              <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                {infoCount} info{infoCount !== 1 ? 's' : ''}
              </span>
            )}
            {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400 ml-1" /> : <ChevronUp className="w-4 h-4 text-gray-400 ml-1" />}
          </div>
        </div>
      </button>

      {!isCollapsed && (
        <>
          {emails.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Rien à traiter</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  onPlan={() => onPlan(email)}
                  onView={() => onView(email)}
                  onIgnore={() => onIgnore(email.id)}
                  onArchive={() => onArchive(email.id)}
                  showActions={showActions}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Email Card ───────────────────────────────────────────────────────────────

function EmailCard({
  email, onPlan, onView, onIgnore, onArchive, isOther = false, showActions = true,
}: {
  email: EmailInbox; onPlan: () => void; onView: () => void;
  onIgnore: () => void; onArchive: () => void; isOther?: boolean; showActions?: boolean;
}) {
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';

  const isUrgent = !isInfo && (
    email.subject?.toLowerCase().includes('urgent') ||
    email.subject?.toLowerCase().includes('urgence') ||
    email.extracted_data?.priority === 'urgent'
  );

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
          {!showActions && (
            <button onClick={onView} title="Voir détail" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Eye className="w-4 h-4" /></button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Email Detail View ────────────────────────────────────────────────────────

function EmailDetailView({
  email, regies, onPlan, onIgnore, onArchive, showActions,
}: {
  email: EmailInbox; regies: Regie[];
  onPlan: () => void; onIgnore: () => void; onArchive: () => void; showActions: boolean;
}) {
  const regie = regies.find((r) => r.id === email.regie_id);
  const extracted = email.extracted_data;
  const emailType = getEmailType(email);
  const isInfo = emailType === 'info';

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isInfo ? (
              <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full flex-shrink-0">INFO</span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 rounded-full flex-shrink-0">INTERVENTION</span>
            )}
            <h3 className="text-lg font-semibold text-gray-900">{extracted?.title || email.subject || 'Sans objet'}</h3>
          </div>
          {extracted?.priority === 'urgent' && !isInfo && (
            <span className="px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full flex-shrink-0">URGENT</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" />{email.from_name || email.from_email}</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{format(new Date(email.received_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
        </div>
      </div>

      {isInfo && regie && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
          <p className="text-sm text-amber-800"><strong>De :</strong> {regie.name} — Cet email n&apos;est pas un bon d&apos;intervention</p>
        </div>
      )}

      {extracted && !isInfo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {extracted.address && <InfoPill icon={<MapPin className="w-4 h-4" />} label="Adresse" value={extracted.address} />}
            {extracted.tenant_name && <InfoPill icon={<User className="w-4 h-4" />} label="Locataire" value={extracted.tenant_name} />}
            {extracted.tenant_phone && <InfoPill icon={<Phone className="w-4 h-4" />} label="Téléphone" value={extracted.tenant_phone} />}
            {email.work_order_number && <InfoPill icon={<FileText className="w-4 h-4" />} label="Bon de travail" value={email.work_order_number} />}
            {regie && <InfoPill icon={<Building2 className="w-4 h-4" />} label="Régie" value={regie.name} />}
          </div>
          {extracted.description && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Description pour le technicien</p>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{extracted.description}</pre>
              </div>
            </div>
          )}
        </>
      )}

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Contenu de l&apos;email</p>
        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{email.body_text || 'Aucun contenu texte disponible.'}</pre>
        </div>
      </div>

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
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Planification Form ───────────────────────────────────────────────────────

function PlanificationForm({
  email, technicians, regies, onSuccess, onCancel,
}: {
  email: EmailInbox | null; technicians: Technician[]; regies: Regie[];
  onSuccess: () => void; onCancel: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '',
  });

  const supabase = createClient();

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' || name === 'estimated_duration_minutes' ? parseInt(value) : value,
    }));
  };

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('interventions').insert({
        title: formData.title, description: formData.description || null,
        address: formData.address, date_planned: datePlanned,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        status: formData.status as 'nouveau' | 'planifie' | 'en_cours' | 'termine' | 'ready_to_bill' | 'billed' | 'annule',
        priority: formData.priority, technician_id: formData.technician_id || null,
        regie_id: formData.regie_id || null, work_order_number: formData.work_order_number || null,
        client_info: Object.keys(clientInfo).length > 0 ? clientInfo : null,
        source_type: 'email', source_email_id: email?.id || null,
      });
      if (error) throw new Error(error.message);
      toast.success('Intervention planifiée avec succès');
      onSuccess();
    } catch (error) {
      console.error('Error creating intervention:', error);
      toast.error("Erreur lors de la création de l'intervention");
    } finally {
      setIsLoading(false);
    }
  };

  const STATUS_OPTIONS = [{ value: 'nouveau', label: 'Nouveau' }, { value: 'planifie', label: 'Planifié' }, { value: 'en_cours', label: 'En cours' }];
  const PRIORITY_OPTIONS = [{ value: 0, label: 'Normal' }, { value: 1, label: 'Urgent' }, { value: 2, label: 'Urgence absolue' }];

  const getTechnicianDisplayName = (tech: Technician) => {
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    if (tech.first_name) return tech.first_name;
    if (tech.last_name) return tech.last_name;
    return tech.email;
  };

  const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = `${inputClass} bg-white`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {email && (
        <div className="p-3 bg-blue-50 rounded-lg text-sm">
          <p className="text-blue-700"><strong>Source :</strong> Email de {email.from_name || email.from_email}</p>
        </div>
      )}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1.5">Titre <span className="text-red-500">*</span></label>
        <input type="text" id="title" name="title" required value={formData.title} onChange={handleChange} className={inputClass} />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
        <textarea id="description" name="description" rows={3} value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
      </div>
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1.5">Adresse <span className="text-red-500">*</span></label>
        <input type="text" id="address" name="address" required value={formData.address} onChange={handleChange} className={inputClass} />
      </div>
      <div>
        <label htmlFor="technician_id" className="block text-sm font-medium text-gray-700 mb-1.5">Technicien assigné</label>
        <select id="technician_id" name="technician_id" value={formData.technician_id} onChange={handleChange} className={selectClass}>
          <option value="">-- Non assigné --</option>
          {technicians.map((tech) => <option key={tech.id} value={tech.id}>{getTechnicianDisplayName(tech)}</option>)}
        </select>
        {technicians.length === 0 && <p className="mt-1 text-xs text-gray-500">Aucun technicien disponible</p>}
      </div>
      <div>
        <label htmlFor="regie_id" className="block text-sm font-medium text-gray-700 mb-1.5">Régie</label>
        <select id="regie_id" name="regie_id" value={formData.regie_id} onChange={handleChange} className={selectClass}>
          <option value="">-- Aucune régie --</option>
          {regies.map((regie) => <option key={regie.id} value={regie.id}>{regie.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="work_order_number" className="block text-sm font-medium text-gray-700 mb-1.5">N° Bon de travail / Référence</label>
        <input type="text" id="work_order_number" name="work_order_number" value={formData.work_order_number} onChange={handleChange} placeholder="Ex: BT-2024-001234" className={inputClass} />
        <p className="mt-1 text-xs text-gray-500">Référence de la régie pour ce bon de travail</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="date_planned" className="block text-sm font-medium text-gray-700 mb-1.5">Date prévue</label>
          <input type="date" id="date_planned" name="date_planned" value={formData.date_planned} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label htmlFor="time_planned" className="block text-sm font-medium text-gray-700 mb-1.5">Heure</label>
          <input type="time" id="time_planned" name="time_planned" value={formData.time_planned} onChange={handleChange} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium text-gray-700 mb-1.5">Durée (min)</label>
          <input type="number" id="estimated_duration_minutes" name="estimated_duration_minutes" min="15" step="15" value={formData.estimated_duration_minutes} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
          <select id="status" name="status" value={formData.status} onChange={handleChange} className={selectClass}>
            {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1.5">Priorité</label>
          <select id="priority" name="priority" value={formData.priority} onChange={handleChange} className={selectClass}>
            {PRIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="client_name" className="block text-sm font-medium text-gray-700 mb-1.5">Nom du client</label>
          <input type="text" id="client_name" name="client_name" value={formData.client_name} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label htmlFor="client_phone" className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
          <input type="tel" id="client_phone" name="client_phone" value={formData.client_phone} onChange={handleChange} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">Annuler</button>
        <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoading ? 'Planification...' : "Planifier l'intervention"}
        </button>
      </div>
    </form>
  );
}