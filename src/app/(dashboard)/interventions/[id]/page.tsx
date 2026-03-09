'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, Wrench, MapPin, Clock, User, Building2,
  FileText, Phone, AlertTriangle, Loader2, ExternalLink,
} from 'lucide-react';

interface InterventionDetail {
  id: string;
  title: string;
  description: string | null;
  address: string;
  date_planned: string | null;
  estimated_duration_minutes: number;
  status: string;
  priority: number;
  client_info: { name?: string; phone?: string } | null;
  work_order_number: string | null;
  source_type: string;
  notes: string | null;
  created_at: string;
  technician?: { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null;
  regie?: { id: string; name: string } | null;
}

interface LinkedReport {
  id: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  nouveau: { label: 'Nouveau', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  planifie: { label: 'Planifié', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_cours: { label: 'En cours', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  termine: { label: 'Terminé', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready_to_bill: { label: 'Prêt à facturer', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  billed: { label: 'Facturé', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  annule: { label: 'Annulé', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const PRIORITY_CONFIG: Record<number, { label: string; className: string }> = {
  0: { label: 'Normal', className: 'bg-gray-100 text-gray-700' },
  1: { label: 'Urgent', className: 'bg-orange-100 text-orange-800' },
  2: { label: 'Urgence absolue', className: 'bg-red-100 text-red-800' },
};

export default function InterventionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const interventionId = params.id as string;

  const [intervention, setIntervention] = useState<InterventionDetail | null>(null);
  const [reports, setReports] = useState<LinkedReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [interventionRes, reportsRes] = await Promise.all([
        (supabase as any)
          .from('interventions')
          .select(`
            id, title, description, address, date_planned,
            estimated_duration_minutes, status, priority,
            client_info, work_order_number, source_type, notes, created_at,
            technician:users!interventions_technician_id_fkey(id, first_name, last_name, phone),
            regie:regies(id, name)
          `)
          .eq('id', interventionId)
          .single(),
        (supabase as any)
          .from('reports')
          .select('id, status, created_at')
          .eq('intervention_id', interventionId),
      ]);

      if (interventionRes.error || !interventionRes.data) {
        toast.error('Intervention introuvable');
        router.push('/interventions');
        return;
      }

      setIntervention(interventionRes.data as InterventionDetail);
      setReports((reportsRes.data as LinkedReport[]) || []);
      setIsLoading(false);
    };
    fetchData();
  }, [interventionId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement de l&apos;intervention...</p>
        </div>
      </div>
    );
  }

  if (!intervention) return null;

  const statusConf = STATUS_CONFIG[intervention.status] || STATUS_CONFIG.nouveau;
  const priorityConf = PRIORITY_CONFIG[intervention.priority] || PRIORITY_CONFIG[0];
  const techName = intervention.technician
    ? [intervention.technician.first_name, intervention.technician.last_name].filter(Boolean).join(' ')
    : null;

  const REPORT_STATUS_LABELS: Record<string, string> = {
    draft: 'Brouillon',
    submitted: 'Soumis',
    validated: 'Validé',
    rejected: 'Rejeté',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/interventions" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{intervention.title}</h1>
              {intervention.work_order_number && (
                <span className="px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Bon N° {intervention.work_order_number}
                </span>
              )}
              <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${statusConf.className}`}>
                {statusConf.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Créée le {format(new Date(intervention.created_at), "d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>
        {intervention.priority > 0 && (
          <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${priorityConf.className}`}>
            {intervention.priority === 2 ? '🚨' : '⚠️'} {priorityConf.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-6">
          {/* Infos principales */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-600" />Informations
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">Adresse</p>
                  <p className="font-medium text-gray-900">{intervention.address}</p>
                </div>
              </div>
              {intervention.date_planned && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Date planifiée</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(intervention.date_planned), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
                    </p>
                    <p className="text-xs text-gray-400">Durée estimée : {intervention.estimated_duration_minutes} min</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium text-gray-900 capitalize">{intervention.source_type || 'Non défini'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {intervention.description && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{intervention.description}</p>
            </div>
          )}

          {/* Notes */}
          {intervention.notes && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />Notes
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">{intervention.notes}</p>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* Technicien */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />Technicien
            </h2>
            {techName ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-lg font-semibold text-blue-600">{techName.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{techName}</p>
                  {intervention.technician?.phone && (
                    <a href={`tel:${intervention.technician.phone}`} className="flex items-center gap-1 text-sm text-blue-600">
                      <Phone className="w-3.5 h-3.5" />
                      {intervention.technician.phone}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-400 italic">Aucun technicien assigné</p>
            )}
          </div>

          {/* Client */}
          {intervention.client_info?.name && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />Client
              </h2>
              <p className="font-medium text-gray-900">{intervention.client_info.name}</p>
              {intervention.client_info.phone && (
                <a href={`tel:${intervention.client_info.phone}`} className="flex items-center gap-1 mt-1 text-sm text-blue-600">
                  <Phone className="w-3.5 h-3.5" />
                  {intervention.client_info.phone}
                </a>
              )}
            </div>
          )}

          {/* Régie */}
          {intervention.regie && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />Régie
              </h2>
              <p className="font-medium text-gray-900">{intervention.regie.name}</p>
            </div>
          )}

          {/* Rapports liés */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />Rapports ({reports.length})
            </h2>
            {reports.length > 0 ? (
              <div className="space-y-2">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    href={report.status === 'validated' ? `/reports/history` : `/reports/validate/${report.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Rapport du {format(new Date(report.created_at), 'd MMM yyyy', { locale: fr })}
                      </p>
                      <p className="text-xs text-gray-500">{REPORT_STATUS_LABELS[report.status] || report.status}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 italic text-sm">Aucun rapport lié</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
