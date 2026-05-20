import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { InvoicePreviewEditor } from '@/components/invoices/InvoicePreviewEditor';
import type { MaterialInput } from '@/lib/invoice-positions';

interface PageProps {
  params: { interventionId: string };
}

interface RawIntervention {
  id: string;
  title: string;
  address: string | null;
  work_order_number: string | null;
  date_planned: string | null;
  client_info: { name?: string; phone?: string } | null;
  regie: {
    id: string;
    name: string;
    address: string | null;
    discount_percentage: number | null;
  } | null;
  reports: {
    id: string;
    work_duration_minutes: number | null;
    supplies_text: string | null;
    materials_used: MaterialInput[] | null;
  }[];
  invoices: { id: string }[];
}

export default async function InvoicePreviewPage({ params }: PageProps) {
  const supabase = createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('interventions')
    .select(
      `id, title, address, work_order_number, date_planned, client_info,
       regie:regies(id, name, address, discount_percentage),
       reports(id, work_duration_minutes, supplies_text, materials_used),
       invoices(id)`
    )
    .eq('id', params.interventionId)
    .single();

  if (error || !data) notFound();

  const iv = data as RawIntervention;

  // If already invoiced, jump to the existing invoice
  if (iv.invoices?.[0]) redirect(`/invoices/${iv.invoices[0].id}`);
  if (!iv.regie) {
    return (
      <div className="p-6 text-center text-amber-700 bg-amber-50 rounded-2xl">
        Aucune régie liée à cette intervention — ajoutez-la depuis le rapport.
      </div>
    );
  }
  const report = iv.reports?.[0];
  if (!report) {
    return (
      <div className="p-6 text-center text-amber-700 bg-amber-50 rounded-2xl">
        Aucun rapport validé pour cette intervention.
      </div>
    );
  }

  // Parse fournitures: if materials_used is populated, use it; otherwise
  // attempt a single-line fallback from supplies_text (no price → admin must edit)
  const initialMaterials: MaterialInput[] = Array.isArray(report.materials_used)
    ? report.materials_used.filter((m) => m && m.name?.trim())
    : [];
  if (initialMaterials.length === 0 && report.supplies_text?.trim()) {
    initialMaterials.push({
      name: report.supplies_text.trim(),
      quantity: 1,
      unit_price: 0,
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/invoices/to-bill"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aperçu de la facture</h1>
          <p className="text-sm text-gray-500">
            {iv.title}
            {iv.work_order_number && ` — Bon N° ${iv.work_order_number}`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-1 text-sm">
        <p>
          <span className="text-gray-500">Régie : </span>
          <span className="font-medium text-gray-900">{iv.regie.name}</span>
          {iv.regie.discount_percentage ? (
            <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded">
              Remise {iv.regie.discount_percentage}%
            </span>
          ) : null}
        </p>
        {iv.client_info?.name && (
          <p>
            <span className="text-gray-500">Client : </span>
            <span className="text-gray-900">{iv.client_info.name}</span>
          </p>
        )}
        {iv.address && (
          <p>
            <span className="text-gray-500">Adresse : </span>
            <span className="text-gray-900">{iv.address}</span>
          </p>
        )}
      </div>

      <InvoicePreviewEditor
        interventionId={iv.id}
        initialWorkMinutes={report.work_duration_minutes || 0}
        initialMaterials={initialMaterials}
        discountPct={Number(iv.regie.discount_percentage) || 0}
      />
    </div>
  );
}
