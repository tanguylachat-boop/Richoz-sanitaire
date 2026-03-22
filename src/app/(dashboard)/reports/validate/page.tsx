'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatTime, formatCHF, cn } from '@/lib/utils';
import { REPORT_STATUS } from '@/lib/constants';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ClipboardCheck,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  User,
  MapPin,
  Building,
  Wrench,
  HardHat,
  BarChart3,
  MessageSquare,
  Camera,
  Image as ImageIcon,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';

type InterventionTypeFilter = 'all' | 'depannage' | 'chantier';

interface ReportRow {
  id: string;
  status: string;
  text_content: string | null;
  vocal_transcription: string | null;
  work_duration_minutes: number | null;
  photos: { url: string }[] | null;
  materials_used: { name: string; quantity: number; unit_price: number }[] | null;
  is_billable: boolean;
  created_at: string;
  technician?: { id: string; first_name: string; last_name: string } | null;
  intervention?: {
    id: string;
    title: string;
    address: string;
    date_planned: string;
    status: string;
    intervention_type: string | null;
    regie?: { id: string; name: string } | null;
  } | null;
}

interface ChantierExtra {
  intervention_id: string;
  progress_percent: number;
  photo_count: number;
  last_message_at: string | null;
}

export default function ValidateReportsPage() {
  const supabase = createClient();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [chantierExtras, setChantierExtras] = useState<Map<string, ChantierExtra>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<InterventionTypeFilter>('all');
  const [rejectModalReport, setRejectModalReport] = useState<ReportRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const router = useRouter();

  const handleReject = async () => {
    if (!rejectModalReport || !rejectReason.trim()) {
      toast.error('Veuillez indiquer un motif de rejet');
      return;
    }
    setIsRejecting(true);
    try {
      const { error } = await supabase
        .from('reports')
        .update({
          status: 'rejected',
          revision_requested: true,
          revision_message: rejectReason.trim(),
        })
        .eq('id', rejectModalReport.id);
      if (error) throw error;

      // Insert notification for the technician
      if (rejectModalReport.technician?.id) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        await supabase.from('notifications').insert({
          recipient_id: rejectModalReport.technician.id,
          sender_id: currentUser?.id || null,
          title: 'Rapport rejeté',
          message: `Motif : ${rejectReason.trim()}`,
          type: 'revision_requested',
          reference_id: rejectModalReport.intervention?.id || null,
          reference_type: 'report',
        });
      }

      toast.success('Rapport rejeté — technicien notifié');
      setRejectModalReport(null);
      setRejectReason('');
      router.refresh();
      // Re-fetch reports
      setReports(prev => prev.filter(r => r.id !== rejectModalReport.id));
    } catch (error) {
      console.error('Rejection error:', error);
      toast.error('Erreur lors du rejet');
    } finally {
      setIsRejecting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      const { data: reportsData } = await supabase
        .from('reports')
        .select(`
          id, status, text_content, vocal_transcription, work_duration_minutes,
          photos, materials_used, is_billable, created_at,
          technician:users!reports_technician_id_fkey(id, first_name, last_name),
          intervention:interventions(id, title, address, date_planned, status, intervention_type, regie:regies(id, name))
        `)
        .in('status', ['submitted', 'draft', 'rejected'])
        .order('created_at', { ascending: false });

      if (reportsData) {
        setReports(reportsData as unknown as ReportRow[]);

        // Fetch chantier extras for chantier interventions
        const chantierInterventionIds = (reportsData as unknown as ReportRow[])
          .filter(r => r.intervention?.intervention_type === 'chantier')
          .map(r => r.intervention!.id);

        if (chantierInterventionIds.length > 0) {
          const uniqueIds = Array.from(new Set(chantierInterventionIds));
          const extras = new Map<string, ChantierExtra>();

          const [detailsRes, photosRes, messagesRes] = await Promise.all([
            supabase
              .from('chantier_details')
              .select('intervention_id, progress_percent')
              .in('intervention_id', uniqueIds),
            supabase
              .from('chantier_photos')
              .select('intervention_id')
              .in('intervention_id', uniqueIds),
            supabase
              .from('chantier_messages')
              .select('intervention_id, created_at')
              .in('intervention_id', uniqueIds)
              .order('created_at', { ascending: false }),
          ]);

          // Init all
          uniqueIds.forEach(id => {
            extras.set(id, { intervention_id: id, progress_percent: 0, photo_count: 0, last_message_at: null });
          });

          // Details
          if (detailsRes.data) {
            detailsRes.data.forEach((d: { intervention_id: string; progress_percent: number }) => {
              const e = extras.get(d.intervention_id);
              if (e) e.progress_percent = d.progress_percent;
            });
          }

          // Photo counts
          if (photosRes.data) {
            const counts = new Map<string, number>();
            photosRes.data.forEach((p: { intervention_id: string }) => {
              counts.set(p.intervention_id, (counts.get(p.intervention_id) || 0) + 1);
            });
            counts.forEach((count, id) => {
              const e = extras.get(id);
              if (e) e.photo_count = count;
            });
          }

          // Last message
          if (messagesRes.data) {
            const seen = new Set<string>();
            messagesRes.data.forEach((m: { intervention_id: string; created_at: string }) => {
              if (!seen.has(m.intervention_id)) {
                seen.add(m.intervention_id);
                const e = extras.get(m.intervention_id);
                if (e) e.last_message_at = m.created_at;
              }
            });
          }

          setChantierExtras(extras);
        }
      }

      setIsLoading(false);
    };

    fetchData();
  }, []);

  // Filter reports by intervention type
  const filteredReports = reports.filter(r => {
    if (typeFilter === 'all') return true;
    const type = r.intervention?.intervention_type;
    if (typeFilter === 'depannage') return type !== 'chantier';
    return type === 'chantier';
  });

  // Stats
  const depannageReports = reports.filter(r => r.intervention?.intervention_type !== 'chantier');
  const chantierReports = reports.filter(r => r.intervention?.intervention_type === 'chantier');
  const submittedCount = filteredReports.filter(r => r.status === 'submitted').length;
  const draftCount = filteredReports.filter(r => r.status === 'draft').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{submittedCount}</p>
              <p className="text-sm text-gray-500">A valider</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{draftCount}</p>
              <p className="text-sm text-gray-500">Brouillons</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{filteredReports.length}</p>
              <p className="text-sm text-gray-500">Total en attente</p>
            </div>
          </div>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            typeFilter === 'all'
              ? 'bg-blue-100 text-blue-700 border border-blue-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          )}
        >
          <FileText className="w-4 h-4" />
          Tous
          {reports.length > 0 && (
            <span className={cn(
              'px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
              typeFilter === 'all' ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'
            )}>
              {reports.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTypeFilter('depannage')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            typeFilter === 'depannage'
              ? 'bg-orange-100 text-orange-700 border border-orange-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          )}
        >
          <Wrench className="w-4 h-4" />
          Dépannage
          {depannageReports.length > 0 && (
            <span className={cn(
              'px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
              typeFilter === 'depannage' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-600'
            )}>
              {depannageReports.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTypeFilter('chantier')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            typeFilter === 'chantier'
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          )}
        >
          <HardHat className="w-4 h-4" />
          Chantier
          {chantierReports.length > 0 && (
            <span className={cn(
              'px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
              typeFilter === 'chantier' ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-600'
            )}>
              {chantierReports.length}
            </span>
          )}
        </button>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Rapports a valider</h2>
          <p className="text-sm text-gray-500">
            {typeFilter === 'all'
              ? 'Tous les rapports des techniciens'
              : typeFilter === 'depannage'
                ? 'Rapports de dépannage des techniciens'
                : 'Rapports de chantier des techniciens'}
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun rapport en attente
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Les rapports soumis par les techniciens apparaitront ici pour validation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredReports.map((report) => {
              const statusKey = report.status as keyof typeof REPORT_STATUS;
              const statusInfo = REPORT_STATUS[statusKey] || REPORT_STATUS.draft;
              const intervention = report.intervention;
              const technician = report.technician;
              const photos = report.photos || [];
              const materials = report.materials_used || [];
              const totalMaterials = materials.reduce((acc, m) => acc + (m.quantity * m.unit_price), 0);

              // Chantier extras
              const isChantier = intervention?.intervention_type === 'chantier';
              const extras = isChantier && intervention ? chantierExtras.get(intervention.id) : null;

              return (
                <div key={report.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Status indicator */}
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-2 flex-shrink-0',
                      report.status === 'submitted' ? 'bg-blue-500' : 'bg-amber-500'
                    )} />

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {intervention?.title || 'Intervention'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                            {technician && (
                              <div className="flex items-center gap-1.5">
                                <User className="w-4 h-4" />
                                <span>{technician.first_name} {technician.last_name}</span>
                              </div>
                            )}
                            {intervention?.regie && (
                              <div className="flex items-center gap-1.5">
                                <Building className="w-4 h-4" />
                                <span>{intervention.regie.name}</span>
                              </div>
                            )}
                            {intervention?.address && (
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4" />
                                <span className="truncate max-w-[200px]">{intervention.address}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!report.is_billable && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 border border-gray-300">
                              NON FACTURABLE
                            </span>
                          )}
                          <span className={cn(
                            'px-2.5 py-1 rounded-lg text-xs font-medium',
                            statusInfo.color
                          )}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Chantier extra info */}
                      {isChantier && extras && (
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                          <div className="flex items-center gap-1.5">
                            <BarChart3 className="w-4 h-4 text-indigo-500" />
                            <span className="text-indigo-700 font-medium">{extras.progress_percent}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Camera className="w-4 h-4 text-indigo-500" />
                            <span>{extras.photo_count} photo{extras.photo_count !== 1 ? 's' : ''}</span>
                          </div>
                          {extras.last_message_at && (
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-indigo-500" />
                              <span>Journal: {formatDate(extras.last_message_at, { day: 'numeric', month: 'short' })}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Report content preview */}
                      {(report.text_content || report.vocal_transcription) && (
                        <div className="p-3 bg-gray-50 rounded-lg mb-3">
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {report.text_content || report.vocal_transcription}
                          </p>
                        </div>
                      )}

                      {/* Report metadata */}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                        {report.work_duration_minutes && !isChantier && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{report.work_duration_minutes} min</span>
                          </div>
                        )}
                        {photos.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4" />
                            <span>{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {materials.length > 0 && (
                          <span className="text-gray-900 font-medium">
                            Materiaux: {formatCHF(totalMaterials)}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/reports/validate/${report.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Voir et valider
                        </Link>
                        <button
                          onClick={() => { setRejectModalReport(report); setRejectReason(''); }}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Rejeter
                        </button>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-right text-sm text-gray-500 flex-shrink-0">
                      <p>{formatDate(report.created_at, { day: 'numeric', month: 'short' })}</p>
                      <p>{formatTime(report.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalReport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Rejeter le rapport</h3>
                  <p className="text-sm text-gray-500">{rejectModalReport.intervention?.title || 'Intervention'}</p>
                </div>
              </div>
              <button onClick={() => setRejectModalReport(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Motif du rejet *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Expliquez pourquoi ce rapport est rejeté..."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModalReport(null)}
                className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                disabled={isRejecting || !rejectReason.trim()}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rejeter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
