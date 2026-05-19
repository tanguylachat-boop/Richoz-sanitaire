'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  interventionId: string;
}

export function CreateBexioInvoiceButton({ interventionId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || isPending;

  async function onClick() {
    if (busy) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/invoices/create-bexio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_id: interventionId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || 'Échec de la création de la facture Bexio', {
          description: data.detail,
        });
        return;
      }

      toast.success(`Facture ${data.bexio_number} créée dans Bexio`, {
        description: data.total ? `Total : ${data.total} CHF` : undefined,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error('Erreur réseau', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors ml-auto"
    >
      {busy ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Création…
        </>
      ) : (
        <>
          <Plus className="w-3.5 h-3.5" />
          Créer facture Bexio
        </>
      )}
    </button>
  );
}
