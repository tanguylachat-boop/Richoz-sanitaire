'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateInvoiceStatus } from '@/app/(dashboard)/invoices/actions';
import type { InvoiceStatus } from '@/types/database';
import { ChevronDown, Loader2 } from 'lucide-react';

const STATUS_OPTIONS: { value: InvoiceStatus; label: string; dot: string; bg: string; text: string; border: string }[] = [
  {
    value: 'generated',
    label: 'Générée',
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
  },
  {
    value: 'sent',
    label: 'Envoyée',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  {
    value: 'paid',
    label: 'Payée',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
];

interface InvoiceStatusSelectProps {
  invoiceId: string;
  currentStatus: InvoiceStatus;
}

export function InvoiceStatusSelect({ invoiceId, currentStatus }: InvoiceStatusSelectProps) {
  const [status, setStatus] = useState<InvoiceStatus>(currentStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (newStatus: InvoiceStatus) => {
    if (newStatus === status) {
      setIsOpen(false);
      return;
    }

    const previousStatus = status;

    // Optimistic update
    setStatus(newStatus);
    setIsOpen(false);

    startTransition(async () => {
      const result = await updateInvoiceStatus(invoiceId, newStatus);

      if (result.success) {
        toast.success('Statut mis à jour avec succès');
        router.refresh();
      } else {
        // Rollback on failure
        setStatus(previousStatus);
        toast.error(result.error || 'Erreur lors de la mise à jour');
      }
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer hover:shadow-sm disabled:opacity-60 disabled:cursor-wait ${current.bg} ${current.text} ${current.border}`}
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <span className={`w-2 h-2 rounded-full ${current.dot}`} />
        )}
        {current.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 left-0 w-44 bg-white rounded-xl border border-gray-200 shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {STATUS_OPTIONS.map((option) => {
            const isSelected = option.value === status;
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                  isSelected
                    ? 'bg-gray-50 font-medium'
                    : 'hover:bg-gray-50'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
                <span className={option.text}>{option.label}</span>
                {isSelected && (
                  <span className="ml-auto text-xs text-gray-400">✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
