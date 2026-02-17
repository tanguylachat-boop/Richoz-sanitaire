import { createClient } from '@/lib/supabase/server';
import { formatDate, formatTime, formatCHF, cn } from '@/lib/utils';
import { REPORT_STATUS, INTERVENTION_STATUS } from '@/lib/constants';
import type { Report } from '@/types/database';
import Link from 'next/link';
import {
  ClipboardCheck,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  User,
  MapPin,
  Building,
  ChevronRight,
  Mic,
  Image as ImageIcon,
} from 'lucide-react';

export default async function ValidateReportsPage() {
  const supabase = createClient();

  // Define report type with relations
  type ReportWithRelations = Report & {
    technician?: { id: string; first_name: string; last_name: string } | null;
    intervention?: {
      id: string;
      title: string;
      address: string;
      date_planned: string;
      status: string;
      regie?: { id: string; name: string } | null;
    } | null;
  };

  // Fetch reports pending validation (exclude those already in history)
  const { data: reportsData, error: reportsError } = await supabase
    .from('reports')
    .select(`
      *,
      technician:users!reports_technician_id_fkey(id, first_name, last_name),
      intervention:interventions(
        id,
        title,
        address,
        date_planned,
        status,
        regie:regies(id, name)
      )
    `)
    .in('status', ['submitted', 'draft', 'rejected']) // Only pending reports
    .order('created_at', { ascending: false });

  // Debug: log any errors
  if (reportsError) {
    console.error('Error fetching reports:', reportsError);
  }

  const reports = reportsData as ReportWithRelations[] | null;

  // Calculate stats
  const stats = {
    submitted: reports?.filter(r => r.status === 'submitted').length || 0,
    draft: reports?.filter(r => r.status === 'draft').length || 0,
    total: reports?.length || 0,
  };

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
              <p className="text-2xl font-bold text-gray-900">{stats.submitted}</p>
              <p className="text-sm text-gray-500">À valider</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
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
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total en attente</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Rapports à valider</h2>
          <p className="text-sm text-gray-500">
            Validez les rapports des techniciens pour générer les factures
          </p>
        </div>

        {!reports || reports.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun rapport en attente
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Les rapports soumis par les techniciens apparaîtront ici pour validation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((report) => {
              const statusInfo = REPORT_STATUS[report.status];
              const intervention = report.intervention;
              const technician = report.technician;
              const photos = (report.photos as { url: string }[]) || [];
              const materials = (report.materials_used as { name: string; quantity: number; unit_price: number }[]) || [];
              const totalMaterials = materials.reduce((acc, m) => acc + (m.quantity * m.unit_price), 0);

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
                          {/* Non-billable badge - VERY VISIBLE */}
                          {!report.is_billable && (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 border border-gray-300">
                              💸 NON FACTURABLE
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
                        {report.work_duration_minutes && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{report.work_duration_minutes} min</span>
                          </div>
                        )}
                        {report.vocal_url && (
                          <div className="flex items-center gap-1.5">
                            <Mic className="w-4 h-4" />
                            <span>Audio</span>
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
                            Matériaux: {formatCHF(totalMaterials)}
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
                        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors">
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
    </div>
  );
}
