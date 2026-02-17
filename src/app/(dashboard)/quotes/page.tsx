import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCHF, formatDate } from '@/lib/utils';
import { QUOTE_STATUS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Quote } from '@/types/database';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  MoreVertical,
  CheckCircle,
  Clock,
  XCircle,
  Send,
} from 'lucide-react';

export default async function QuotesPage() {
  const supabase = createClient();

  // Define quote type with relations
  type QuoteWithRelations = Quote & {
    regie?: { id: string; name: string } | null;
  };

  // Fetch quotes with related data
  const { data: quotesData } = await supabase
    .from('quotes')
    .select(`
      *,
      regie:regies(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  const quotes = quotesData as QuoteWithRelations[] | null;

  // Calculate stats
  const stats = {
    total: quotes?.length || 0,
    draft: quotes?.filter(q => q.status === 'draft').length || 0,
    sent: quotes?.filter(q => q.status === 'sent').length || 0,
    accepted: quotes?.filter(q => q.status === 'accepted').length || 0,
    totalAmount: quotes?.filter(q => q.status !== 'rejected' && q.status !== 'expired').reduce((acc, q) => acc + (q.total || 0), 0) || 0,
    acceptedAmount: quotes?.filter(q => q.status === 'accepted').reduce((acc, q) => acc + (q.total || 0), 0) || 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
              <p className="text-sm text-gray-500">Brouillons</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Send className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.sent}</p>
              <p className="text-sm text-gray-500">En attente</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.accepted}</p>
              <p className="text-sm text-gray-500">Acceptés</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCHF(stats.acceptedAmount)}</p>
              <p className="text-sm text-gray-500">Montant accepté</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            {stats.total} devis au total • {formatCHF(stats.totalAmount)} proposé
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              className="w-full sm:w-64 h-10 pl-10 pr-4 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtrer</span>
          </button>
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouveau devis</span>
          </Link>
        </div>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {!quotes || quotes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Aucun devis
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Créez votre premier devis pour commencer à suivre vos propositions commerciales.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    N° Devis
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Client
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Titre
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Montant
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Statut
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Validité
                  </th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotes.map((quote) => {
                  const statusInfo = QUOTE_STATUS[quote.status];
                  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date();

                  return (
                    <tr key={quote.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {quote.quote_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {quote.client_name}
                          </p>
                          {quote.regie && (
                            <p className="text-xs text-gray-500">
                              {quote.regie.name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600 truncate max-w-[200px]">
                          {quote.title || '-'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {formatCHF(quote.total)}
                          </span>
                          {quote.discount_amount > 0 && (
                            <p className="text-xs text-green-600">
                              -{formatCHF(quote.discount_amount)} remise
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'inline-flex px-2.5 py-1 rounded-lg text-xs font-medium',
                          isExpired && quote.status === 'sent'
                            ? 'bg-yellow-100 text-yellow-800'
                            : statusInfo.color
                        )}>
                          {isExpired && quote.status === 'sent' ? 'Expiré' : statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {quote.valid_until ? (
                          <span className={cn(
                            'text-sm',
                            isExpired ? 'text-red-500' : 'text-gray-500'
                          )}>
                            {formatDate(quote.valid_until, { day: 'numeric', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {quote.pdf_url && (
                            <a
                              href={quote.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Télécharger PDF"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}