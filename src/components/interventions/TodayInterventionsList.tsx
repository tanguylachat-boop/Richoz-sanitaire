'use client';

import Link from 'next/link';
import { formatTime } from '@/lib/utils';
import { INTERVENTION_STATUS } from '@/lib/constants';
import { useInterventionsRealtime } from '@/hooks/useRealtime';
import { useState, useEffect } from 'react';
import type { InterventionWithRelations } from '@/types/database';
import {
  MapPin,
  Clock,
  ChevronRight,
  FileEdit,
  CheckCircle2,
  Building,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodayInterventionsListProps {
  interventions: InterventionWithRelations[];
  userId: string;
}

export function TodayInterventionsList({
  interventions: initialInterventions,
  userId,
}: TodayInterventionsListProps) {
  const [interventions, setInterventions] = useState(initialInterventions);

  // Subscribe to realtime updates
  useInterventionsRealtime({
    filter: `technician_id=eq.${userId}`,
    onUpdate: (updated) => {
      setInterventions((prev) =>
        prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i))
      );
    },
  });

  // Update state when props change
  useEffect(() => {
    setInterventions(initialInterventions);
  }, [initialInterventions]);

  if (interventions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Aucune intervention prévue
        </h3>
        <p className="text-gray-500">
          Vous n&apos;avez pas d&apos;intervention planifiée pour aujourd&apos;hui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {interventions.map((intervention) => {
        const statusInfo = INTERVENTION_STATUS[intervention.status];
        const hasReport = intervention.reports && intervention.reports.length > 0;
        const reportStatus = hasReport && intervention.reports ? intervention.reports[0].status : null;

        return (
          <div
            key={intervention.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
          >
            {/* Status indicator bar */}
            <div
              className={cn(
                'h-1',
                intervention.status === 'termine' || intervention.status === 'ready_to_bill' || intervention.status === 'billed'
                  ? 'bg-green-500'
                  : intervention.status === 'en_cours'
                  ? 'bg-orange-500'
                  : 'bg-blue-500'
              )}
            />

            <div className="p-4">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {intervention.title}
                  </h3>
                  {intervention.regie && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {intervention.regie.name}
                      </span>
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                    statusInfo.color
                  )}
                >
                  {statusInfo.label}
                </span>
              </div>

              {/* Info row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                {intervention.date_planned && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(intervention.date_planned)}</span>
                    {intervention.estimated_duration_minutes && (
                      <span className="text-gray-400">
                        ({intervention.estimated_duration_minutes} min)
                      </span>
                    )}
                  </div>
                )}
                {intervention.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span className="truncate max-w-[200px]">
                      {intervention.address}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Report button */}
                {intervention.status !== 'annule' && (
                  <Link
                    href={`/technician/report/${intervention.id}`}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-colors',
                      hasReport && reportStatus === 'submitted'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : hasReport && reportStatus === 'draft'
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {hasReport ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {reportStatus === 'submitted'
                          ? 'Rapport soumis'
                          : 'Modifier le rapport'}
                      </>
                    ) : (
                      <>
                        <FileEdit className="w-4 h-4" />
                        Faire un rapport
                      </>
                    )}
                  </Link>
                )}

                {/* Details link */}
                <Link
                  href={`/interventions/${intervention.id}`}
                  className="flex items-center justify-center p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
