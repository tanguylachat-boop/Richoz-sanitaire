'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  FileText,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { getApprovedLeaves } from '@/lib/leave-utils';
import { TimeGridView } from '@/components/calendar/TimeGridView';
import type { LeaveEntry, BirthdayEntry, SelectedSlot } from '@/components/calendar/TimeGridView';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
} from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlanificationEmail {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string;
  received_at: string;
  body_text: string | null;
  body_html: string | null;
  regie_id: string | null;
  attachment_urls: string[] | null;
  work_order_number?: string | null;
  extracted_data?: {
    title?: string;
    address?: string;
    tenant_name?: string;
    tenant_phone?: string;
    tenant_email?: string;
    description?: string;
    priority?: string;
    email_type?: string;
    keys_info?: string;
    owner_name?: string;
  } | null;
}

export interface PlanificationTechnician {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export interface PlanificationRegie {
  id: string;
  name: string;
  email_contact?: string | null;
}

interface CalendarIntervention {
  id: string;
  title: string;
  description: string | null;
  address: string;
  date_planned: string | null;
  estimated_duration_minutes: number;
  status: string;
  priority: number;
  technician_id: string | null;
  regie_id: string | null;
  client_info: { name?: string; phone?: string } | null;
  work_order_number: string | null;
  intervention_type?: 'depannage' | 'chantier' | null;
  technician?: { id: string; first_name: string | null; last_name: string | null } | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PlanificationSplitViewProps {
  email?: PlanificationEmail | null;
  technicians: PlanificationTechnician[];
  regies: PlanificationRegie[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function PlanificationSplitView({ email = null, technicians, regies, onSuccess, onCancel }: PlanificationSplitViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [calendarWeek, setCalendarWeek] = useState(new Date());
  const [calendarInterventions, setCalendarInterventions] = useState<CalendarIntervention[]>([]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);

  // Confirmation modal state
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [createdInterventionId, setCreatedInterventionId] = useState<string | null>(null);
  const [sendToRegie, setSendToRegie] = useState(false);
  const [sendToLocataire, setSendToLocataire] = useState(false);
  const [regieEmail, setRegieEmail] = useState('');
  const [locataireEmail, setLocataireEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '', client_email: '',
    intervention_type: 'depannage',
  });

  const supabase = createClient();

  // Pré-remplir depuis l'email + extracted_data si présent
  useEffect(() => {
    if (email) {
      const ed = email.extracted_data;
      setFormData((prev) => ({
        ...prev,
        title: ed?.title || email.subject || '',
        description: ed?.description || '',
        address: ed?.address || '',
        regie_id: email.regie_id || '',
        work_order_number: email.work_order_number || '',
        client_name: ed?.tenant_name || '',
        client_phone: ed?.tenant_phone || '',
        client_email: ed?.tenant_email || '',
        priority: ed?.priority === 'urgent' ? 1 : 0,
      }));
    }
  }, [email]);

  // Fetch calendar interventions
  const weekStart = useMemo(() => startOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);
  const weekEnd = useMemo(() => endOfWeek(calendarWeek, { weekStartsOn: 1 }), [calendarWeek]);

  const fetchCalendarData = useCallback(async () => {
    const sd = format(weekStart, 'yyyy-MM-dd');
    const ed = format(weekEnd, 'yyyy-MM-dd');

    // Fetch interventions with technician info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('interventions')
      .select('id, title, description, address, date_planned, estimated_duration_minutes, status, priority, technician_id, regie_id, client_info, work_order_number, intervention_type, technician:users!interventions_technician_id_fkey(id, first_name, last_name)')
      .gte('date_planned', weekStart.toISOString())
      .lte('date_planned', weekEnd.toISOString())
      .not('status', 'eq', 'annule');

    if (formData.technician_id) {
      query = query.eq('technician_id', formData.technician_id);
    }

    const [{ data: ivData }, leavesData, { data: usersData }] = await Promise.all([
      query,
      getApprovedLeaves(sd, ed),
      supabase.from('users').select('id, first_name, last_name, birth_date').not('birth_date', 'is', null).eq('is_active', true),
    ]);

    if (ivData) setCalendarInterventions(ivData as CalendarIntervention[]);
    setLeaves(leavesData || []);

    // Build birthday entries for current year
    if (usersData) {
      const now = new Date();
      const year = now.getFullYear();
      const bdays: BirthdayEntry[] = usersData
        .filter((u: { birth_date: string | null }) => u.birth_date)
        .map((u: { id: string; first_name: string; last_name: string; birth_date: string }) => {
          const [, m, d] = u.birth_date.split('-');
          return { user_id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', date: `${year}-${m}-${d}` };
        });
      setBirthdays(bdays);
    }
  }, [weekStart, weekEnd, formData.technician_id]);

  useEffect(() => { fetchCalendarData(); }, [fetchCalendarData]);

  // Warn if assigned technician is on leave for selected date
  useEffect(() => {
    if (formData.technician_id && formData.date_planned) {
      const techLeave = leaves.find(l =>
        l.technician_id === formData.technician_id &&
        l.start_date <= formData.date_planned &&
        l.end_date >= formData.date_planned
      );
      if (techLeave) {
        const tech = technicians.find(t => t.id === formData.technician_id);
        if (tech) toast.warning(`${getTechName(tech)} est en congé ce jour-là`);
      }
    }
  }, [leaves, formData.technician_id, formData.date_planned]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'priority' || name === 'estimated_duration_minutes' ? parseInt(value) : value,
    }));
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (hour >= 12 && hour < 13.5) return;
    setFormData((prev) => ({
      ...prev,
      date_planned: format(day, 'yyyy-MM-dd'),
      time_planned: `${String(Math.floor(hour)).padStart(2, '0')}:${hour % 1 === 0.5 ? '30' : '00'}`,
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
      const { data, error } = await (supabase as any).from('interventions').insert({
        title: formData.title, description: formData.description || null,
        address: formData.address, date_planned: datePlanned,
        estimated_duration_minutes: formData.estimated_duration_minutes,
        status: formData.status, priority: formData.priority,
        technician_id: formData.technician_id || null,
        regie_id: formData.regie_id || null,
        work_order_number: formData.work_order_number || null,
        client_info: Object.keys(clientInfo).length > 0 ? clientInfo : null,
        source_type: email ? 'email' : 'manual',
        source_email_id: email?.id || null,
        intervention_type: formData.intervention_type,
      }).select('id');

      if (error) throw new Error(error.message);

      toast.success('Intervention planifiée avec succès');

      // Show confirmation modal to choose email recipients
      const interventionId = data?.[0]?.id;
      if (interventionId) {
        setCreatedInterventionId(interventionId);
        // Pre-fill régie email
        const selectedRegie = regies.find(r => r.id === formData.regie_id);
        const hasRegie = !!formData.regie_id && !!selectedRegie;
        setSendToRegie(hasRegie);
        setRegieEmail(selectedRegie?.email_contact || '');
        // Pre-fill locataire email
        setSendToLocataire(false);
        setLocataireEmail(formData.client_email || '');
        setShowConfirmationModal(true);
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error('Error creating intervention:', error);
      toast.error("Erreur lors de la création de l'intervention");
    } finally {
      setIsLoading(false);
    }
  };

  const getTechName = (tech: PlanificationTechnician) => {
    if (tech.first_name && tech.last_name) return `${tech.first_name} ${tech.last_name}`;
    return tech.first_name || tech.last_name || tech.email;
  };

  const handleSendConfirmation = async () => {
    if (!createdInterventionId) return;
    setIsSendingEmail(true);
    try {
      const recipients: string[] = [];
      if (sendToRegie && regieEmail) recipients.push(regieEmail);
      if (sendToLocataire && locataireEmail) recipients.push(locataireEmail);

      if (recipients.length > 0) {
        await fetch('https://primary-production-66b7.up.railway.app/webhook/confirmation-regie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intervention_id: createdInterventionId,
            recipients,
            send_to_regie: sendToRegie,
            send_to_locataire: sendToLocataire,
          }),
        });
        toast.success(`Email de confirmation envoyé (${recipients.length} destinataire${recipients.length > 1 ? 's' : ''})`);
      }
    } catch (err) {
      console.error('Erreur envoi email confirmation:', err);
      toast.warning('Email de confirmation non envoyé');
    } finally {
      setIsSendingEmail(false);
      setShowConfirmationModal(false);
      onSuccess();
    }
  };

  const handleSkipConfirmation = () => {
    setShowConfirmationModal(false);
    onSuccess();
  };

  const selectedTechName = formData.technician_id
    ? getTechName(technicians.find(t => t.id === formData.technician_id)!)
    : 'Tous les techniciens';

  const inputClass = 'w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectClass = `${inputClass} bg-white`;

  const calendarSelectedSlot: SelectedSlot | null = formData.date_planned && formData.time_planned
    ? { date: formData.date_planned, time: formData.time_planned, durationMinutes: formData.estimated_duration_minutes || 60, title: formData.title || 'Nouvelle' }
    : null;

  return (
    <div className="flex gap-0 max-h-[85vh]">

      {/* ═══ LEFT: Contenu de l'email (lecture) — masqué si pas d'email ═══ */}
      {email && (
        <div className="w-[380px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-400 mb-1">De</p>
              <p className="text-sm font-medium text-gray-900">{email.from_name || email.from_email}</p>
              <p className="text-xs text-gray-500">{email.from_email}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-400 mb-1">Sujet</p>
              <p className="text-sm font-medium text-gray-900">{email.subject || 'Sans objet'}</p>
              <p className="text-xs text-gray-400 mt-1">{format(new Date(email.received_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <p className="text-xs text-gray-400 px-3 pt-3 mb-2">Contenu de l&apos;email</p>
              <div className="px-3 pb-3 max-h-[40vh] overflow-y-auto">
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
            {/* PDF joints */}
            {email.attachment_urls && email.attachment_urls.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
                  <span className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    {email.attachment_urls.length} pièce{email.attachment_urls.length > 1 ? 's' : ''} jointe{email.attachment_urls.length > 1 ? 's' : ''}
                  </span>
                </div>
                {email.attachment_urls.map((url, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs text-gray-600 flex items-center gap-1"><FileText className="w-3 h-3 text-red-500" />PDF {idx + 1}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700">Ouvrir ↗</a>
                    </div>
                    <iframe src={url} className="w-full h-[400px] border-0" title={`PDF ${idx + 1}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CENTER: Formulaire ═══ */}
      <div className={`${email ? 'w-[380px]' : 'w-[420px]'} flex-shrink-0 overflow-y-auto px-4 border-r border-gray-200`}>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input type="text" name="title" required value={formData.title} onChange={handleChange} className={inputClass} placeholder="Ex: Fuite robinet cuisine" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Détails de l'intervention..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
            <input type="text" name="address" required value={formData.address} onChange={handleChange} className={inputClass} placeholder="Adresse complète du lieu d'intervention" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technicien</label>
              <select name="technician_id" value={formData.technician_id} onChange={handleChange} className={selectClass}>
                <option value="">-- Non assigné --</option>
                {technicians.map((tech) => {
                  const techLeave = formData.date_planned
                    ? leaves.find(l => l.technician_id === tech.id && l.start_date <= formData.date_planned && l.end_date >= formData.date_planned)
                    : null;
                  const leaveLabel = techLeave
                    ? ` (En congé du ${format(new Date(techLeave.start_date + 'T00:00:00'), 'd MMM', { locale: fr })} au ${format(new Date(techLeave.end_date + 'T00:00:00'), 'd MMM', { locale: fr })})`
                    : '';
                  return (
                    <option key={tech.id} value={tech.id} disabled={!!techLeave}>
                      {getTechName(tech)}{leaveLabel}
                    </option>
                  );
                })}
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
            <input type="text" name="work_order_number" value={formData.work_order_number} onChange={handleChange} className={inputClass} placeholder="Ex: #1723245" />
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
              <input type="time" name="time_planned" step="1800" value={formData.time_planned} onChange={handleChange} className={inputClass} />
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
              <input type="text" name="client_name" value={formData.client_name} onChange={handleChange} className={inputClass} placeholder="Nom du locataire" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="tel" name="client_phone" value={formData.client_phone} onChange={handleChange} className={inputClass} placeholder="+41 XX XXX XX XX" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email client</label>
            <input type="email" name="client_email" value={formData.client_email} onChange={handleChange} className={inputClass} placeholder="email@locataire.ch" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Planification...' : 'Planifier'}
            </button>
          </div>
        </form>
      </div>

      {/* ═══ RIGHT: Calendrier semaine (TimeGridView) ═══ */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-2 px-3 pt-3 flex-shrink-0">
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

        <div className="flex-1 overflow-hidden mx-3 mb-3">
          <TimeGridView
            mode="week"
            currentDate={calendarWeek}
            interventions={calendarInterventions}
            leaves={leaves}
            birthdays={birthdays}
            onInterventionClick={() => {}}
            onSlotClick={handleSlotClick}
            selectedSlot={calendarSelectedSlot}
          />
        </div>
      </div>

      {/* ═══ MODAL: Choix envoi confirmation email ═══ */}
      {showConfirmationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Email de confirmation</h3>
              </div>
              <button onClick={handleSkipConfirmation} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-500">Choisissez à qui envoyer un email de confirmation pour cette intervention.</p>

              {/* Régie */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendToRegie}
                    onChange={(e) => setSendToRegie(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Envoyer à la régie</span>
                </label>
                {sendToRegie && (
                  <input
                    type="email"
                    value={regieEmail}
                    onChange={(e) => setRegieEmail(e.target.value)}
                    placeholder="email@regie.ch"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>

              {/* Locataire */}
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendToLocataire}
                    onChange={(e) => setSendToLocataire(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Envoyer au locataire</span>
                </label>
                {sendToLocataire && (
                  <input
                    type="email"
                    value={locataireEmail}
                    onChange={(e) => setLocataireEmail(e.target.value)}
                    placeholder="email@locataire.ch"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={handleSkipConfirmation}
                disabled={isSendingEmail}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"
              >
                Passer
              </button>
              <button
                onClick={handleSendConfirmation}
                disabled={isSendingEmail || (!sendToRegie && !sendToLocataire)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              >
                {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSendingEmail ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
