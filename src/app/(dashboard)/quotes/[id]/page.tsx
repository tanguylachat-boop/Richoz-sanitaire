'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ChevronLeft, FileText, Building2, MapPin, Calendar,
  Download, FileOutput, Loader2, User, Phone, Mail,
} from 'lucide-react';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface QuoteDetail {
  id: string;
  quote_number: string | null;
  client_name: string;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  description: string | null;
  items: LineItem[];
  subtotal: number;
  discount_percentage: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  total_ttc: number;
  status: string;
  valid_until: string | null;
  created_at: string;
  pdf_url: string | null;
  regie?: { id: string; name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  sent: { label: 'Envoyé', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  accepted: { label: 'Accepté', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Refusé', className: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: 'Expiré', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
};

const WEBHOOK_URL = 'https://primary-production-66b7.up.railway.app/webhook/quote-pdf';

const formatCHF = (n: number) =>
  new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' }).format(n);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const fetchQuote = async () => {
      setIsLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('quotes')
        .select('*, regie:regies(id, name)')
        .eq('id', quoteId)
        .single();

      if (error || !data) {
        toast.error('Devis introuvable');
        router.push('/quotes');
        return;
      }
      setQuote(data as QuoteDetail);
      setIsLoading(false);
    };
    fetchQuote();
  }, [quoteId]);

  const handleGeneratePdf = async () => {
    if (!quote) return;
    setIsGeneratingPdf(true);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quote.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.pdf_url) throw new Error('Pas de pdf_url dans la réponse');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('quotes').update({ pdf_url: json.pdf_url }).eq('id', quote.id);
      setQuote({ ...quote, pdf_url: json.pdf_url });
      toast.success('PDF généré avec succès !');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Chargement du devis...</p>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const statusConf = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
  const items: LineItem[] = Array.isArray(quote.items) ? quote.items : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/quotes" className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                {quote.quote_number ? `Devis ${quote.quote_number}` : 'Devis'}
              </h1>
              <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${statusConf.className}`}>
                {statusConf.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">Créé le {formatDate(quote.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {quote.pdf_url ? (
            <a
              href={quote.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Télécharger PDF
            </a>
          ) : (
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileOutput className="w-4 h-4" />}
              {isGeneratingPdf ? 'Génération...' : 'Générer PDF'}
            </button>
          )}
        </div>
      </div>

      {/* PDF Preview */}
      {quote.pdf_url && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Aperçu du PDF</h2>
            <a
              href={quote.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Ouvrir dans un nouvel onglet
            </a>
          </div>
          <iframe
            src={quote.pdf_url}
            className="w-full border-0"
            style={{ height: '600px' }}
            title={`PDF Devis ${quote.quote_number || ''}`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Client & Infos */}
        <div className="space-y-6">
          {/* Client */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />Client
            </h2>
            <div className="space-y-3">
              <p className="font-medium text-gray-900">{quote.client_name}</p>
              {quote.client_address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>{quote.client_address}</span>
                </div>
              )}
              {quote.client_email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{quote.client_email}</span>
                </div>
              )}
              {quote.client_phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{quote.client_phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Régie */}
          {quote.regie && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />Régie
              </h2>
              <p className="font-medium text-gray-900">{quote.regie.name}</p>
            </div>
          )}

          {/* Infos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />Informations
            </h2>
            <div className="space-y-3 text-sm">
              {quote.description && (
                <div>
                  <p className="text-gray-500 mb-1">Description</p>
                  <p className="text-gray-900">{quote.description}</p>
                </div>
              )}
              {quote.valid_until && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Valable jusqu&apos;au {formatDate(quote.valid_until)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Items & Totaux */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lignes du devis */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-gray-900">Lignes du devis</h2>
            </div>
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Quantité</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Prix unit.</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-6 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="px-6 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                        <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCHF(item.unit_price)}</td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{formatCHF(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-gray-400 italic">Aucune ligne</div>
            )}
          </div>

          {/* Récapitulatif montants */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Récapitulatif</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sous-total HT</span>
                <span className="font-medium text-gray-900">{formatCHF(quote.subtotal || 0)}</span>
              </div>
              {quote.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remise ({quote.discount_percentage}%)</span>
                  <span className="font-medium text-red-600">-{formatCHF(quote.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">TVA ({quote.vat_rate || 0}%)</span>
                <span className="font-medium text-gray-900">{formatCHF(quote.vat_amount || 0)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between">
                <span className="text-base font-semibold text-gray-900">Total TTC</span>
                <span className="text-xl font-bold text-gray-900">{formatCHF(quote.total_ttc || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
