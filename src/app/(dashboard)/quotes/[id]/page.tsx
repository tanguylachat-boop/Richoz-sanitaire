'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ChevronLeft, FileText, Building2, MapPin, Calendar,
  Download, FileOutput, Loader2, User,
  Pencil, Save, Plus, Trash2, X, Copy,
} from 'lucide-react';

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  item_type?: string;
  section_name?: string;
  catalog_service_id?: number | null;
}

interface Regie {
  id: string;
  name: string;
}

interface QuoteDetail {
  id: string;
  quote_number: string | null;
  client_name: string;
  client_address: string | null;
  description: string | null;
  regie_id: string | null;
  total_ht: number;
  tax_rate: number;
  tax_amount: number;
  total_ttc: number;
  status: string;
  valid_until: string | null;
  created_at: string;
  pdf_url: string | null;
  parent_quote_id: string | null;
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingCounter, setIsCreatingCounter] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientAddress, setEditClientAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRegieId, setEditRegieId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([]);
  const [regies, setRegies] = useState<Regie[]>([]);

  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      const [quoteRes, regiesRes, itemsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('quotes')
          .select('*, regie:regies(id, name)')
          .eq('id', quoteId)
          .single(),
        supabase.from('regies').select('id, name').order('name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('quote_items')
          .select('*')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: true }),
      ]);

      if (quoteRes.error || !quoteRes.data) {
        toast.error('Devis introuvable');
        router.push('/quotes');
        return;
      }

      setQuote(quoteRes.data as QuoteDetail);
      if (regiesRes.data) setRegies(regiesRes.data as Regie[]);

      // Load items from quote_items table
      if (itemsRes.data && itemsRes.data.length > 0) {
        const loadedItems: LineItem[] = (itemsRes.data as any[]).map((item) => ({
          id: item.id,
          description: item.description || '',
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total: Number(item.total) || (Number(item.quantity) * Number(item.unit_price)) || 0,
          item_type: item.item_type,
          section_name: item.section_name,
          catalog_service_id: item.catalog_service_id,
        }));
        setQuoteItems(loadedItems);
      }

      setIsLoading(false);
    };
    fetchData();
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Edit mode ──────────────────────────────────────────────────────────────

  const startEditing = () => {
    if (!quote) return;
    setEditClientName(quote.client_name);
    setEditClientAddress(quote.client_address || '');
    setEditDescription(quote.description || '');
    setEditRegieId(quote.regie_id || null);
    setEditItems(quoteItems.length > 0 ? quoteItems.map(i => ({ ...i })) : []);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const updateEditItem = (index: number, field: keyof LineItem, value: string | number) => {
    setEditItems(prev => {
      const updated = [...prev];
      if (field === 'quantity' || field === 'unit_price') {
        const numVal = Number(value) || 0;
        updated[index] = {
          ...updated[index],
          [field]: numVal,
          total: field === 'quantity' ? numVal * updated[index].unit_price : updated[index].quantity * numVal,
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const addEditItem = () => {
    setEditItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, total: 0 }]);
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!quote) return;
    setIsSaving(true);
    try {
      const computedItems = editItems.map(i => ({ ...i, total: Math.round(i.quantity * i.unit_price * 100) / 100 }));
      const totalHt = computedItems.reduce((sum, i) => sum + i.total, 0);
      const taxRate = quote.tax_rate || 8.1;
      const taxAmount = Math.round(totalHt * taxRate / 100 * 100) / 100;
      const totalTtc = Math.round((totalHt + taxAmount) * 100) / 100;

      const updateData = {
        client_name: editClientName,
        client_address: editClientAddress || null,
        description: editDescription || null,
        regie_id: editRegieId || null,
        total_ht: totalHt,
        tax_amount: taxAmount,
        total_ttc: totalTtc,
        pdf_url: null, // reset PDF since data changed
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('quotes').update(updateData).eq('id', quote.id);
      if (error) throw error;

      // Delete old quote_items and insert new ones
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('quote_items').delete().eq('quote_id', quote.id);

      if (computedItems.length > 0) {
        const newItems = computedItems.map((item) => ({
          quote_id: quote.id,
          item_type: item.item_type || 'service',
          catalog_service_id: item.catalog_service_id || null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          section_name: item.section_name || 'Prestations',
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemsError } = await (supabase as any).from('quote_items').insert(newItems);
        if (itemsError) throw itemsError;
      }

      // Update local state
      const selectedRegie = regies.find(r => r.id === editRegieId);
      setQuote({
        ...quote,
        ...updateData,
        regie: selectedRegie ? { id: selectedRegie.id, name: selectedRegie.name } : null,
      });
      setQuoteItems(computedItems);
      setIsEditing(false);
      toast.success('Devis mis à jour !');
    } catch (err: any) {
      console.error('Erreur sauvegarde devis:', err);
      toast.error('Erreur: ' + (err?.message || 'Impossible de sauvegarder'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Counter-quote (contre-devis) ──────────────────────────────────────────

  const handleCreateCounterQuote = async () => {
    if (!quote) return;
    setIsCreatingCounter(true);
    try {
      // Generate counter-quote number: replace D prefix with CD-
      const counterNumber = quote.quote_number
        ? quote.quote_number.replace(/^D/, 'CD-')
        : null;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      // Duplicate the quote - use same column names as quotes/new/page.tsx
      const insertData = {
        user_id: user?.id || null,
        client_name: quote.client_name,
        client_address: quote.client_address || null,
        regie_id: quote.regie_id || null,
        description: quote.description || null,
        status: 'draft' as const,
        total_ht: quote.total_ht || 0,
        tax_rate: quote.tax_rate || 8.1,
        tax_amount: quote.tax_amount || 0,
        total_ttc: quote.total_ttc || 0,
        valid_until: validUntil.toISOString().split('T')[0],
        parent_quote_id: quote.id,
      };

      console.log('Contre-devis insertData:', insertData);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newQuote, error } = await (supabase as any)
        .from('quotes')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Erreur Supabase contre-devis:', error);
        throw error;
      }

      // Copy quote_items to the new counter-quote
      if (quoteItems.length > 0) {
        const newItems = quoteItems.map((item) => ({
          quote_id: (newQuote as { id: string }).id,
          item_type: item.item_type || 'service',
          catalog_service_id: item.catalog_service_id || null,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          section_name: item.section_name || 'Prestations',
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemsError } = await (supabase as any)
          .from('quote_items')
          .insert(newItems);
        if (itemsError) {
          console.error('Erreur copie quote_items:', itemsError);
        }
      }

      toast.success('Contre-devis créé ! Vous pouvez maintenant le modifier.');
      router.push(`/quotes/${(newQuote as { id: string }).id}?edit=true`);
    } catch (err: any) {
      console.error('Erreur création contre-devis:', err);
      toast.error('Erreur contre-devis: ' + (err?.message || JSON.stringify(err)));
    } finally {
      setIsCreatingCounter(false);
    }
  };

  // ─── Auto-enter edit mode if ?edit=true ─────────────────────────────────────

  useEffect(() => {
    if (!quote || isLoading) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('edit') === 'true') {
      startEditing();
      // Remove the query param from URL
      window.history.replaceState({}, '', `/quotes/${quoteId}`);
    }
  }, [quote, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ─────────────────────────────────────────────────────────────────

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
  const items: LineItem[] = quoteItems;
  const isCounterQuote = quote.quote_number?.startsWith('CD-');

  // Compute edit totals for live preview
  const editSubtotal = editItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const editTaxRate = quote.tax_rate || 8.1;
  const editTaxAmount = Math.round(editSubtotal * editTaxRate / 100 * 100) / 100;
  const editTotal = Math.round((editSubtotal + editTaxAmount) * 100) / 100;

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
                {quote.quote_number
                  ? `${isCounterQuote ? 'Contre-devis' : 'Devis'} ${quote.quote_number}`
                  : 'Devis'}
              </h1>
              <span className={`px-2.5 py-1 text-xs font-medium rounded-lg border ${statusConf.className}`}>
                {statusConf.label}
              </span>
              {isCounterQuote && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-lg border bg-orange-50 text-orange-700 border-orange-200">
                  Contre-devis
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">Créé le {formatDate(quote.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Modifier
              </button>
              <button
                onClick={handleCreateCounterQuote}
                disabled={isCreatingCounter}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors disabled:opacity-50"
              >
                {isCreatingCounter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                {isCreatingCounter ? 'Création...' : 'Contre-devis'}
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                onClick={cancelEditing}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </>
          )}
          {!isEditing && quote.pdf_url ? (
            <a
              href={quote.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Télécharger PDF
            </a>
          ) : !isEditing ? (
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileOutput className="w-4 h-4" />}
              {isGeneratingPdf ? 'Génération...' : 'Générer PDF'}
            </button>
          ) : null}
        </div>
      </div>

      {/* PDF Preview */}
      {quote.pdf_url && !isEditing && (
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
          <embed
            src={quote.pdf_url}
            type="application/pdf"
            width="100%"
            height="600px"
            className="w-full"
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
              {isEditing ? (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Nom du client</label>
                    <input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Adresse</label>
                    <textarea value={editClientAddress} onChange={(e) => setEditClientAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
                  </div>
                </>
              ) : (
                <>
                  <p className="font-medium text-gray-900">{quote.client_name}</p>
                  {quote.client_address && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span>{quote.client_address}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Régie */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />Régie
            </h2>
            {isEditing ? (
              <select
                value={editRegieId || ''}
                onChange={(e) => setEditRegieId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none"
              >
                <option value="">— Aucune régie —</option>
                {regies.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            ) : quote.regie ? (
              <p className="font-medium text-gray-900">{quote.regie.name}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Aucune régie</p>
            )}
          </div>

          {/* Infos */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />Informations
            </h2>
            <div className="space-y-3 text-sm">
              {isEditing ? (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Description</label>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y" />
                </div>
              ) : (
                <>
                  {quote.description && (
                    <div>
                      <p className="text-gray-500 mb-1">Description</p>
                      <p className="text-gray-900">{quote.description}</p>
                    </div>
                  )}
                </>
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
            {isEditing ? (
              <div className="p-4 space-y-3">
                {editItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 space-y-2">
                      <input value={item.description} onChange={(e) => updateEditItem(i, 'description', e.target.value)} placeholder="Description" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Quantité</label>
                          <input type="number" min={0} step={1} value={item.quantity} onChange={(e) => updateEditItem(i, 'quantity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Prix unit. (CHF)</label>
                          <input type="number" min={0} step={0.01} value={item.unit_price} onChange={(e) => updateEditItem(i, 'unit_price', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Total</label>
                          <p className="px-3 py-2 text-sm font-medium text-gray-900">{formatCHF(item.quantity * item.unit_price)}</p>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeEditItem(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={addEditItem} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                  <Plus className="w-4 h-4" />
                  Ajouter une ligne
                </button>
              </div>
            ) : items.length > 0 ? (
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
                <span className="font-medium text-gray-900">{formatCHF(isEditing ? editSubtotal : (quote.total_ht || 0))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">TVA ({quote.tax_rate || 8.1}%)</span>
                <span className="font-medium text-gray-900">{formatCHF(isEditing ? editTaxAmount : (quote.tax_amount || 0))}</span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between">
                <span className="text-base font-semibold text-gray-900">Total TTC</span>
                <span className="text-xl font-bold text-gray-900">{formatCHF(isEditing ? editTotal : (quote.total_ttc || 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
