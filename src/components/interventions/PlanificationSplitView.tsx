'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  FileText,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  format,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const LUNCH_START = 12;
const LUNCH_END_HOUR = 13;
const LUNCH_END_MIN = 30;

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

  const [formData, setFormData] = useState({
    title: '', description: '', address: '', date_planned: '', time_planned: '',
    estimated_duration_minutes: 60, status: 'planifie', priority: 0,
    technician_id: '', regie_id: '', work_order_number: '', client_name: '', client_phone: '',
    intervention_type: 'depannage',
  });

  const supabase = createClient();

  // Pré-remplir depuis l'email si présent
  useEffect(() => {
    if (email) {
      setFormData((prev) => ({
        ...prev,
        title: email.subject || '',
        regie_id: email.regie_id || '',
      }));
    }
  }, [email]);

  // Fetch calendar interventions
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

      // Envoyer email de confirmation à la régie
      if (formData.regie_id && data?.[0]?.id) {
        try {
          await fetch('https://primary-production-66b7.up.railway.app/webhook/confirmation-regie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intervention_id: data[0].id }),
          });
          toast.success('Email de confirmation envoyé');
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

  const getTechName = (tech: PlanificationTechnician) => {
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

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={isLoading} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Planification...' : 'Planifier'}
            </button>
          </div>
        </form>
      </div>

      {/* ═══ RIGHT: Mini calendrier semaine ═══ */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3 px-3 pt-3 flex-shrink-0">
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

        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mx-3 mb-3">
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

        <div className="flex items-center gap-4 px-3 pb-2 text-[10px] text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400" />Dépannage</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" />Chantier</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-100 border border-dashed border-green-500" />Nouveau RDV</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-gray-100" />Pause midi</span>
        </div>
      </div>
    </div>
  );
}
