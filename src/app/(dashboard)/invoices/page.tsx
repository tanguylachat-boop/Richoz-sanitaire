import { createClient } from '@/lib/supabase/server';
import { formatCHF, formatDate } from '@/lib/utils';
import type { Invoice, InvoiceStatus } from '@/types/database';
import { InvoiceStatusSelect } from '@/components/invoices/InvoiceStatusSelect';
import { InvoiceFilterButton } from '@/components/invoices/InvoiceFilterButton';
import { FileText, Search, ExternalLink, Send, CheckCircle, Clock } from 'lucide-react';

const VALID_FILTERS = ['generated', 'sent', 'paid', 'overdue'] as const;
const OVERDUE_DAYS = 30;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();

  // Parse status filter from URL
  const statusParam = typeof searchParams.status === 'string' ? searchParams.status : '';
  const activeStatuses = statusParam
    .split(',')
    .filter((s): s is string => VALID_FILTERS.includes(s as (typeof VALID_FILTERS)[number]));

  const hasFilter = activeStatuses.length > 0;

  // Build Supabase query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('invoices')
    .select('*')
    .order('date', { ascending: false });

  if (hasFilter) {
    // Determine which DB statuses to query
    const dbStatuses = new Set<InvoiceStatus>();
    if (activeStatuses.includes('generated')) dbStatuses.add('generated');
    if (activeStatuses.includes('sent')) dbStatuses.add('sent');
    if (activeStatuses.includes('paid')) dbStatuses.add('paid');
    if (activeStatuses.includes('overdue')) dbStatuses.add('sent'); // overdue are sent invoices

    query = query.in('status', Array.from(dbStatuses));
  }

  const { data: invoicesData, error } = await query;

  if (error) {
    console.error('Erreur fetch factures:', error);
  }

  let invoices = (invoicesData as Invoice[] | null) ?? [];

  // Post-filter for overdue logic
  if (hasFilter) {
    const overdueThreshold = new Date();
    overdueThreshold.setDate(overdueThreshold.getDate() - OVERDUE_DAYS);

    invoices = invoices.filter((inv) => {
      // If the invoice's DB status is directly selected, keep it
      if (activeStatuses.includes(inv.status)) return true;
      // If overdue is selected and this is a sent invoice older than threshold, keep it
      if (activeStatuses.includes('overdue') && inv.status === 'sent') {
        return new Date(inv.date) < overdueThreshold;
      }
      return false;
    });
  }

  // Calculate stats (on all invoices, not filtered)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allInvoicesData } = await (supabase as any)
    .from('invoices')
    .select('status, amount_total');

  const allInvoices = (allInvoicesData as Pick<Invoice, 'status' | 'amount_total'>[] | null) ?? [];

  const stats = {
    total: allInvoices.length,
    generated: allInvoices.filter((i) => i.status === 'generated').length,
    sent: allInvoices.filter((i) => i.status === 'sent').length,
    paid: allInvoices.filter((i) => i.status === 'paid').length,
    totalAmount: allInvoices.reduce((acc, i) => acc + (i.amount_total || 0), 0),
    paidAmount: allInvoices
      .filter((i) => i.status === 'paid')
      .reduce((acc, i) => acc + (i.amount_total || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.generated}</p>
              <p className="text-sm text-gray-500">Générées</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Send className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.sent}</p>
              <p className="text-sm text-gray-500">Envoyées</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.paid}</p>
              <p className="text-sm text-gray-500">Payées</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCHF(stats.paidAmount)}</p>
              <p className="text-sm text-gray-500">Encaissé</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-gray-500">
            {hasFilter ? (
              <>
                {invoices.length} résultat{invoices.length > 1 ? 's' : ''} • {stats.total} facture{stats.total > 1 ? 's' : ''} au total
              </>
            ) : (
              <>
                {stats.total} facture{stats.total > 1 ? 's' : ''} au total • {formatCHF(stats.totalAmount)} facturé
              </>
            )}
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
          <InvoiceFilterButton activeStatuses={activeStatuses} />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {hasFilter ? 'Aucun résultat' : 'Aucune facture'}
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {hasFilter
                ? 'Aucune facture ne correspond aux filtres sélectionnés.'
                : "Les factures générées depuis les rapports d'intervention apparaîtront ici."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Numéro
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Client
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Montant TTC
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Statut
                  </th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Numéro */}
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {formatDate(invoice.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>

                    {/* Client */}
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                          {invoice.client_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[220px]">
                          {invoice.client_address}
                        </p>
                      </div>
                    </td>

                    {/* Montant TTC */}
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCHF(invoice.amount_total)}
                      </span>
                    </td>

                    {/* Statut — sélecteur interactif */}
                    <td className="px-6 py-4">
                      <InvoiceStatusSelect
                        invoiceId={invoice.id}
                        currentStatus={invoice.status}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-center">
                      {invoice.pdf_url ? (
                        <a
                          href={invoice.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Ouvrir le PDF"
                        >
                          <span>📄</span>
                          <span className="hidden sm:inline">PDF</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Pas de PDF</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
