'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FilePlus, Plus, Search, Download, FileOutput, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quote {
  id: string;
  quote_number: string | null;
  client_name: string;
  client_address: string | null;
  description: string | null;
  total_ttc: number;
  status: string;
  valid_until: string | null;
  created_at: string;
  pdf_url: string | null;
  regie?: { id: string; name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchQuotes = async () => {
    setIsLoading(true);
    const { data } = await (supabase
      .from('quotes') as any)
      .select('id, quote_number, client_name, client_address, description, total_ttc, status, valid_until, created_at, pdf_url, regie:regies(id, name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setQuotes(data as Quote[]);
    setIsLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (id: string, newStatus: string) => {
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'accepted') update.accepted_at = new Date().toISOString();
    if (newStatus === 'rejected') update.rejected_at = new Date().toISOString();
    const { error } = await (supabase.from('quotes') as any).update(update).eq('id', id);
    if (error) { alert('Erreur lors de la mise à jour'); return; }
    fetchQuotes();
  };

  const handleGeneratePdf = async (quote: Quote) => {
    setGeneratingPdfId(quote.id);
    try {
      // Call n8n webhook directly (same pattern as master template)
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quote.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const pdfUrl = json.pdf_url;
      if (!pdfUrl) throw new Error('Pas de pdf_url dans la réponse');

      // Update quote with PDF URL
      const { error } = await (supabase.from('quotes') as any)
        .update({ pdf_url: pdfUrl })
        .eq('id', quote.id);
      if (error) throw new Error(error.message);

      alert('PDF généré avec succès !');
      fetchQuotes();
    } catch (err: any) {
      console.error(err);
      alert('Erreur lors de la génération du PDF: ' + err.message);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const filtered = quotes.filter((q) => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      q.client_name.toLowerCase().includes(query) ||
      (q.quote_number?.toLowerCase().includes(query) ?? false) ||
      (q.description?.toLowerCase().includes(query) ?? false) ||
      (q.regie?.name?.toLowerCase().includes(query) ?? false)
    );
  });

  const stats = {
    drafts: quotes.filter((q) => q.status === 'draft').length,
    pending: quotes.filter((q) => q.status === 'sent').length,
    accepted: quotes.filter((q) => q.status === 'accepted').length,
    totalAccepted: quotes.filter((q) => q.status === 'accepted').reduce((s, q) => s + (q.total_ttc || 0), 0),
    totalProposed: quotes.reduce((s, q) => s + (q.total_ttc || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Devis</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4">
          <p className="text-sm text-gray-500 mb-1">Brouillons</p>
          <p className="text-2xl font-bold text-gray-900">{stats.drafts}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-sm text-blue-600 mb-1">En attente</p>
          <p className="text-2xl font-bold text-blue-700">{stats.pending}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-sm text-emerald-600 mb-1">Acceptés</p>
          <p className="text-2xl font-bold text-emerald-700">{stats.accepted}</p>
        </div>
        <div className="bg-violet-50 rounded-xl border border-violet-200 p-4">
          <p className="text-sm text-violet-600 mb-1">Montant accepté</p>
          <p className="text-lg font-bold text-violet-700">{formatCHF(stats.totalAccepted)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-gray-500 text-sm">{filtered.length} devis au total • {formatCHF(stats.totalProposed)} proposé</p>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tous statuts</option>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouveau devis</span>
          </Link>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FilePlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Aucun devis</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || statusFilter !== 'all' ? 'Aucun résultat.' : 'Commencez par créer un nouveau devis.'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Link href="/quotes/new" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />Nouveau devis
              </Link>
            )}
          </div>
        ) : (
          /* Table header */
          <div>
            <div className="hidden sm:grid grid-cols-[auto_1fr_1fr_120px_100px_120px_180px] gap-3 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50/50">
              <div>N° DEVIS</div>
              <div>CLIENT</div>
              <div>OBJET</div>
              <div className="text-right">MONTANT TTC</div>
              <div className="text-center">STATUT</div>
              <div className="text-center">DATE</div>
              <div className="text-center">ACTIONS</div>
            </div>

            <div className="divide-y divide-gray-50">
              {filtered.map((quote) => {
                const statusConf = STATUS_CONFIG[quote.status] || STATUS_CONFIG.draft;
                const isGenerating = generatingPdfId === quote.id;
                return (
                  <div key={quote.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_120px_100px_120px_180px] gap-3 px-4 py-3 items-center hover:bg-gray-50/50 transition-colors">
                    {/* Quote number */}
                    <div className="font-mono text-sm font-medium text-gray-900">
                      {quote.quote_number || '—'}
                    </div>

                    {/* Client */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{quote.client_name}</p>
                      {quote.regie?.name && (
                        <p className="text-xs text-blue-600 truncate">{quote.regie.name}</p>
                      )}
                    </div>

                    {/* Objet */}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-600 truncate">{quote.description || '—'}</p>
                    </div>

                    {/* Montant */}
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-900">{formatCHF(quote.total_ttc || 0)}</span>
                    </div>

                    {/* Statut */}
                    <div className="text-center">
                      <select
                        value={quote.status}
                        onChange={(e) => handleStatusChange(quote.id, e.target.value)}
                        className={`text-xs font-medium rounded-lg px-2 py-1 border ${statusConf.className} bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer`}
                      >
                        {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                          <option key={v} value={v}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date */}
                    <div className="text-center">
                      <span className="text-sm text-gray-500">{formatDate(quote.created_at)}</span>
                    </div>

                    {/* Actions - PDF */}
                    <div className="flex items-center justify-center gap-2">
                      {!quote.pdf_url ? (
                        <button
                          onClick={() => handleGeneratePdf(quote)}
                          disabled={isGenerating}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isGenerating
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <FileOutput className="w-3.5 h-3.5" />}
                          {isGenerating ? 'Génération...' : 'Générer PDF'}
                        </button>
                      ) : (
                        <a
                          href={quote.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Télécharger PDF
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}