'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Check } from 'lucide-react';

const FILTER_OPTIONS = [
  { value: 'generated', label: 'Générée', dot: 'bg-gray-400' },
  { value: 'sent', label: 'Envoyée', dot: 'bg-blue-500' },
  { value: 'paid', label: 'Payée', dot: 'bg-emerald-500' },
  { value: 'overdue', label: 'Retard', dot: 'bg-red-500' },
] as const;

interface InvoiceFilterButtonProps {
  activeStatuses: string[];
}

export function InvoiceFilterButton({ activeStatuses }: InvoiceFilterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatus = (status: string) => {
    const newStatuses = activeStatuses.includes(status)
      ? activeStatuses.filter((s) => s !== status)
      : [...activeStatuses, status];

    if (newStatuses.length > 0) {
      router.push(`?status=${newStatuses.join(',')}`);
    } else {
      router.push('/invoices');
    }
  };

  const clearFilters = () => {
    router.push('/invoices');
    setIsOpen(false);
  };

  const hasActiveFilters = activeStatuses.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
          hasActiveFilters
            ? 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
            : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
        }`}
      >
        <Filter className="w-4 h-4" />
        <span className="hidden sm:inline">Filtrer</span>
        {hasActiveFilters && (
          <span className="ml-0.5 w-5 h-5 flex items-center justify-center text-xs font-bold bg-blue-600 text-white rounded-full">
            {activeStatuses.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 right-0 w-52 bg-white rounded-xl border border-gray-200 shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Filtrer par statut
          </div>
          {FILTER_OPTIONS.map((option) => {
            const isChecked = activeStatuses.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => toggleStatus(option.value)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isChecked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
                <span className="text-gray-700">{option.label}</span>
              </button>
            );
          })}
          {hasActiveFilters && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={clearFilters}
                className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Effacer les filtres
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
