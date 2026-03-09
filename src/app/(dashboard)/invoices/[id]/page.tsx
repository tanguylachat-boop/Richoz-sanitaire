'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ChevronLeft, FileText, MapPin, Calendar, CreditCard,
  Download, ExternalLink, Loader2,
} from 'lucide-react';

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  date: string;
  client_name: string;
  client_address: string;
  amount_total: number;
  status: string;
  pdf_url: string | null;
  bexio_id: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  generated: { label: 'Générée', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  sent: { label: 'Envoyée', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  paid: { label: 'Payée', className: 'bg-green-50 text-green-700 border-green-200' },
};

const formatCHF = (n: number) =>
  new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' }).format(n);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchInvoice = async () => {
      setIsLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error || !data) {
        toast.error('Facture introuvable');
        router.push('/invoices');
        return;
      }
      setInvoice(data as InvoiceDetail);
      setIsLoading(false);
    };
    fetchInvoice();
  }, [invoiceId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement de la facture...</p>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const statusConf = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.generated;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/invoices" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">Facture {invoice.invoice_number}</h1>
              <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${statusConf.className}`}>
                {statusConf.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">{formatDate(invoice.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.bexio_id && (
            <a
              href={`https://office.bexio.com/index.php/kb_invoice/show/id/${invoice.bexio_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Voir sur Bexio
            </a>
          )}
          {invoice.pdf_url && (
            <a
              href={invoice.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Télécharger PDF
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />Client
          </h2>
          <div className="space-y-3">
            <p className="font-medium text-gray-900 text-lg">{invoice.client_name}</p>
            {invoice.client_address && (
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                <span>{invoice.client_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Détails */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />Détails financiers
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date de facturation</p>
                  <p className="font-medium text-gray-900">{formatDate(invoice.date)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
              <div>
                <p className="text-sm text-emerald-600">Montant total TTC</p>
                {invoice.amount_total && !isNaN(invoice.amount_total) ? (
                  <p className="text-2xl font-bold text-emerald-800">{formatCHF(invoice.amount_total)}</p>
                ) : (
                  <p className="text-base font-medium text-gray-600">Montant : voir sur Bexio</p>
                )}
              </div>
            </div>
            {invoice.bexio_id ? (
              <a
                href={`https://office.bexio.com/index.php/kb_invoice/show/id/${invoice.bexio_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                <ExternalLink className="w-5 h-5 text-indigo-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-indigo-900">Voir sur Bexio</p>
                  <p className="text-xs text-indigo-600">Ouvrir la facture dans Bexio</p>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
                <FileText className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-amber-700">Facture en cours de traitement</p>
              </div>
            )}
            {invoice.pdf_url && (
              <a
                href={invoice.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
              >
                <FileText className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">Document PDF</p>
                  <p className="text-xs text-blue-600">Cliquer pour ouvrir</p>
                </div>
                <ExternalLink className="w-4 h-4 text-blue-500" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
