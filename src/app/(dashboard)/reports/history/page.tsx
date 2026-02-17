'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatDate, cn } from '@/lib/utils';
import {
  Eye,
  User,
  Building,
  Calendar,
  CheckCircle,
  Archive,
  Loader2,
} from 'lucide-react';

// Status configuration for history
// Note: report_status ENUM = 'draft', 'submitted', 'validated', 'rejected'
const HISTORY_STATUS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  validated: {
    label: 'Validé',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejeté',
    color: 'bg-red-100 text-red-700',
    icon: Archive,
  },
};

// Define report type with relations
type ReportWithRelations = {
  id: string;
  status: string;
  is_billable: boolean;
  updated_at: string;
  created_at: string;
  technician?: { id: string; first_name: string; last_name: string } | null;
  intervention?: {
    id: string;
    title: string;
    address: string;
    date_planned: string;
    client_info?: { name?: string; phone?: string } | null;
    regie?: { id: string; name: string } | null;
  } | null;
};

export default function ReportsHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [reports, setReports] = useState<ReportWithRelations[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      const { data: reportsData, error } = await supabase
        .from('reports')
        .select(`
          id,
          status,
          is_billable,
          updated_at,
          created_at,
          technician:users!reports_technician_id_fkey(id, first_name, last_name),
          intervention:interventions(
            id,
            title,
            address,
            date_planned,
            client_info,
            regie:regies(id, name)
          )
        `)
        .eq('status', 'validated')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching history:', error);
      }

      setReports(reportsData as ReportWithRelations[] | null);
      setIsLoading(false);
    };

    fetchReports();
  }, [supabase]);

  const handleRowClick = (reportId: string) => {
    router.push(`/reports/validate/${reportId}`);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-12">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      {/* Table header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {reports?.length || 0} rapport{(reports?.length || 0) > 1 ? 's' : ''} dans l&apos;historique
          </p>
        </div>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Archive className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Aucun rapport dans l&apos;historique
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Les rapports validés apparaîtront ici une fois traités.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Client / Régie
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Technicien
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Intervention
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Facturable
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((report) => {
                const statusInfo = HISTORY_STATUS[report.status] || HISTORY_STATUS.validated;
                const StatusIcon = statusInfo.icon;
                const intervention = report.intervention;
                const technician = report.technician;

                return (
                  <tr 
                    key={report.id} 
                    onClick={() => handleRowClick(report.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">
                          {formatDate(report.updated_at || report.created_at, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </td>

                    {/* Client / Régie */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {intervention?.client_info?.name && (
                          <span className="text-sm font-medium text-gray-900">
                            {intervention.client_info.name}
                          </span>
                        )}
                        {intervention?.regie && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Building className="w-3.5 h-3.5" />
                            <span>{intervention.regie.name}</span>
                          </div>
                        )}
                        {!intervention?.client_info?.name && !intervention?.regie && (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>
                    </td>

                    {/* Technicien */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {technician ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-sm text-gray-900">
                            {technician.first_name} {technician.last_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    {/* Intervention title */}
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {intervention?.title || 'Sans titre'}
                        </p>
                        {intervention?.address && (
                          <p className="text-xs text-gray-500 truncate">
                            {intervention.address}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Billable */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {report.is_billable ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700">
                          ✓ Oui
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                          Non
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
                          statusInfo.color
                        )}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(report.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Voir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
