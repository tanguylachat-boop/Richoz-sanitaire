'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, FileCheck } from 'lucide-react';
import {
  HOURLY_RATE_CHF,
  VAT_RATE,
  computeTotals,
  type MaterialInput,
} from '@/lib/invoice-positions';

interface Props {
  interventionId: string;
  initialWorkMinutes: number;
  initialMaterials: MaterialInput[];
  discountPct: number;
}

const formatCHF = (n: number) =>
  new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' }).format(n);

export function InvoicePreviewEditor({
  interventionId,
  initialWorkMinutes,
  initialMaterials,
  discountPct,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || isPending;

  const [workMinutes, setWorkMinutes] = useState<number>(initialWorkMinutes);
  const [hourlyRate, setHourlyRate] = useState<number>(HOURLY_RATE_CHF);
  const [materials, setMaterials] = useState<MaterialInput[]>(initialMaterials);

  const totals = useMemo(
    () =>
      computeTotals(
        { work_duration_minutes: workMinutes, hourly_rate_chf: hourlyRate, materials },
        discountPct
      ),
    [workMinutes, hourlyRate, materials, discountPct]
  );

  function updateMaterial(idx: number, patch: Partial<MaterialInput>) {
    setMaterials((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addMaterial() {
    setMaterials((rows) => [...rows, { name: '', quantity: 1, unit_price: 0 }]);
  }

  function removeMaterial(idx: number) {
    setMaterials((rows) => rows.filter((_, i) => i !== idx));
  }

  async function onConfirm() {
    if (busy) return;
    if (totals.lines.length === 0) {
      toast.error('Ajoutez au moins une ligne (heures ou matériel).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/invoices/create-bexio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervention_id: interventionId,
          work_duration_minutes: workMinutes,
          hourly_rate_chf: hourlyRate,
          materials: materials.filter((m) => m.name.trim()),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Échec création facture Bexio', {
          description: data.detail || data.bexio?.errors?.[0],
        });
        return;
      }
      toast.success(`Facture ${data.bexio_number} créée`, {
        description: data.pdf_url ? 'PDF disponible dans le dashboard' : 'PDF en cours de génération',
      });
      startTransition(() => router.push(`/invoices/${data.invoice_id}`));
    } catch (e) {
      toast.error('Erreur réseau', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Main d'œuvre */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Main d&apos;œuvre</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-gray-600">Durée (minutes)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={workMinutes}
              onChange={(e) => setWorkMinutes(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="text-xs text-gray-500 mt-1 block">
              = {(workMinutes / 60).toFixed(2)} h
            </span>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Tarif horaire (CHF)</span>
            <input
              type="number"
              min={0}
              step={5}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </label>
          <div className="text-sm">
            <span className="text-gray-600 block">Sous-total main d&apos;œuvre</span>
            <span className="mt-1 block px-3 py-2 bg-gray-50 rounded-lg font-semibold text-gray-900">
              {formatCHF((workMinutes / 60) * hourlyRate)}
            </span>
          </div>
        </div>
      </section>

      {/* Fournitures */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Fournitures &amp; matériel</h2>
          <button
            type="button"
            onClick={addMaterial}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>

        {materials.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            Aucune fourniture. Cliquez sur « Ajouter » pour en saisir une.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
              <div className="col-span-6">Désignation</div>
              <div className="col-span-2 text-right">Qté</div>
              <div className="col-span-2 text-right">Prix unit. HT</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {materials.map((m, idx) => {
              const subtotal = (Number(m.quantity) || 0) * (Number(m.unit_price) || 0);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-2"
                >
                  <input
                    type="text"
                    placeholder="ex : Robinet 120/120"
                    value={m.name}
                    onChange={(e) => updateMaterial(idx, { name: e.target.value })}
                    className="col-span-1 sm:col-span-6 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={m.quantity}
                    onChange={(e) =>
                      updateMaterial(idx, { quantity: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="col-span-1 sm:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={m.unit_price}
                    onChange={(e) =>
                      updateMaterial(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="col-span-1 sm:col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="col-span-1 sm:col-span-1 text-right text-sm font-medium text-gray-900">
                    {formatCHF(subtotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMaterial(idx)}
                    className="col-span-1 sm:col-span-1 inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Totaux */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Récapitulatif</h2>
        <dl className="space-y-2 text-sm">
          {totals.discount_pct > 0 && (
            <div className="flex justify-between text-gray-600">
              <dt>Remise régie</dt>
              <dd>−{totals.discount_pct}%</dd>
            </div>
          )}
          <div className="flex justify-between text-gray-700">
            <dt>Sous-total HT</dt>
            <dd className="font-medium">{formatCHF(totals.net)}</dd>
          </div>
          <div className="flex justify-between text-gray-700">
            <dt>TVA {VAT_RATE}%</dt>
            <dd className="font-medium">{formatCHF(totals.vat)}</dd>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between text-lg">
            <dt className="font-semibold text-gray-900">Total TTC</dt>
            <dd className="font-bold text-emerald-700">{formatCHF(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex items-center justify-end gap-3 pb-6">
        <button
          type="button"
          onClick={() => router.push('/invoices/to-bill')}
          disabled={busy}
          className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl disabled:opacity-60"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Création en cours…
            </>
          ) : (
            <>
              <FileCheck className="w-4 h-4" /> Créer la facture dans Bexio
            </>
          )}
        </button>
      </div>
    </div>
  );
}
