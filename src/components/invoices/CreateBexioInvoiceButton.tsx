'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface Props {
  interventionId: string;
}

export function CreateBexioInvoiceButton({ interventionId }: Props) {
  return (
    <Link
      href={`/invoices/to-bill/${interventionId}/preview`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors ml-auto"
    >
      Préparer la facture
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  );
}
