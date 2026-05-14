import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCHF } from '@/lib/utils';
import {
  ChevronLeft,
  Building,
  User,
  MapPin,
  Calendar,
  Clock,
  FileText,
  Plus,
} from 'lucide-react';

interface ReadyIntervention {
  id: string;
  title: string;
  address: string | null;
  date_planned: string | null;
  work_order_number: string | null;
  client_info: { name?: string; phone?: string } | null;
  regie: { id: string; name: string } | null;
  invoices: { id: string }[];
  reports: {
    id: string;
    work_duration_minutes: number | null;
    supplies_text: string | null;
    text_content: string | null;
  }[];
}

export default async function ToBillPage() {
  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('interventions')
    .select(
      `id, title, address, date_planned, work_order_number, client_info,
       regie:regies(id, name),
       invoices(id),
       reports(id, work_duration_minutes, supplies_text, text_content)`
    )
    .eq('status', 'ready_to_bill')
    .order('date_planned', { ascending: true });

  if (error) {
    console.error('to-bill fetch error', error);
  }

  const rows = ((data as ReadyIntervention[] | null) || []).filter(
    (r) => !r.invoices || r.invoices.length === 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/invoices"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">À facturer</h1>
          <p className="text-sm text-gray-500">
            {rows.length} intervention{rows.length !== 1 ? 's' : ''} avec rapport validé
            en attente de facturation Bexio
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Tout est facturé ✅
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Aucune intervention validée en attente de création de facture Bexio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r) => {
            const report = r.reports?.[0];
            const duration = report?.work_duration_minutes || 0;
            const hourlyRate = 110;
            const estimatedAmount = (duration / 60) * hourlyRate;

            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{r.title}</h3>
                    {r.work_order_number && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded">
                        Bon N° {r.work_order_number}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                    À facturer
                  </span>
                </div>

                <div className="space-y-1.5 text-sm">
                  {r.client_info?.name && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{r.client_info.name}</span>
                    </div>
                  )}
                  {r.regie && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Building className="w-4 h-4 text-gray-400" />
                      <span>{r.regie.name}</span>
                    </div>
                  )}
                  {r.address && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{r.address}</span>
                    </div>
                  )}
                  {r.date_planned && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>
                        {new Date(r.date_planned).toLocaleDateString('fr-CH', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  {duration > 0 && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>
                        {duration} min · estimé {formatCHF(estimatedAmount)} (HT)
                      </span>
                    </div>
                  )}
                </div>

                {report?.supplies_text && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 line-clamp-2">
                    <strong>Fournitures :</strong> {report.supplies_text}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Link
                    href={`/reports/validate/${report?.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Voir le rapport
                  </Link>
                  <button
                    disabled
                    title="Disponible en Phase 2"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors ml-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Créer facture Bexio
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
