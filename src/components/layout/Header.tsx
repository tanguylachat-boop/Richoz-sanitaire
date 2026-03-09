'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, Wrench, FileText, Mail, Loader2 } from 'lucide-react';
import { ROLES } from '@/lib/constants';
import type { User } from '@/types/database';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';
import { createClient } from '@/lib/supabase/client';

// Page titles
const pageTitles: Record<string, string> = {
  '/inbox': 'Boîte de réception',
  '/calendar': 'Calendrier',
  '/interventions': 'Interventions',
  '/reports': 'Rapports',
  '/reports/validate': 'Validation des rapports',
  '/invoices': 'Factures',
  '/quotes': 'Devis',
  '/products': 'Catalogue produits',
  '/admin/users': 'Gestion des utilisateurs',
  '/admin/regies': 'Gestion des régies',
  '/admin/settings': 'Paramètres',
  '/technician/today': "Mes interventions du jour",
  '/technician/week': 'Ma semaine',
};

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  href: string;
}

interface SearchResults {
  interventions: SearchResult[];
  invoices: SearchResult[];
  emails: SearchResult[];
}

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getPageTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    for (const [path, title] of Object.entries(pageTitles)) {
      if (pathname.startsWith(path + '/')) return title;
    }
    return 'Tableau de bord';
  };

  const roleInfo = ROLES[user.role];

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const pattern = `%${term}%`;

    const [interventionsRes, invoicesRes, emailsRes] = await Promise.all([
      supabase
        .from('interventions')
        .select('id, title, address, work_order_number, status')
        .or(`title.ilike.${pattern},address.ilike.${pattern},work_order_number.ilike.${pattern}`)
        .limit(5)
        .returns<{ id: string; title: string; address: string; work_order_number: string | null; status: string }[]>(),
      supabase
        .from('invoices')
        .select('id, invoice_number, client_name, amount_total, status')
        .ilike('invoice_number', pattern)
        .limit(5)
        .returns<{ id: string; invoice_number: string; client_name: string; amount_total: number; status: string }[]>(),
      supabase
        .from('email_inbox')
        .select('id, subject, from_name, from_email, received_at')
        .or(`subject.ilike.${pattern},from_name.ilike.${pattern}`)
        .limit(5)
        .returns<{ id: string; subject: string | null; from_name: string | null; from_email: string; received_at: string }[]>(),
    ]);

    setResults({
      interventions: (interventionsRes.data ?? []).map((i) => ({
        id: i.id,
        label: i.title,
        sub: i.work_order_number ? `#${i.work_order_number} — ${i.address}` : i.address,
        href: `/interventions/${i.id}`,
      })),
      invoices: (invoicesRes.data ?? []).map((i) => ({
        id: i.id,
        label: `Facture ${i.invoice_number}`,
        sub: `${i.client_name} — CHF ${i.amount_total.toFixed(2)}`,
        href: `/invoices`,
      })),
      emails: (emailsRes.data ?? []).map((e) => ({
        id: e.id,
        label: e.subject ?? '(sans objet)',
        sub: e.from_name ?? e.from_email,
        href: `/inbox`,
      })),
    });

    setIsOpen(true);
    setIsLoading(false);
  }, []);

  // Debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      search(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, search]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
    setQuery('');
  }, [pathname]);

  const handleSelect = (href: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(href);
  };

  const totalResults = results
    ? results.interventions.length + results.invoices.length + results.emails.length
    : 0;

  const categories: { key: keyof SearchResults; label: string; icon: React.ReactNode }[] = [
    { key: 'interventions', label: 'Interventions', icon: <Wrench className="w-4 h-4 text-gray-400" /> },
    { key: 'invoices', label: 'Factures', icon: <FileText className="w-4 h-4 text-gray-400" /> },
    { key: 'emails', label: 'Emails', icon: <Mail className="w-4 h-4 text-gray-400" /> },
  ];

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{getPageTitle()}</h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden md:flex items-center">
          <div className="relative" ref={containerRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (results && totalResults > 0) setIsOpen(true); }}
              placeholder="Rechercher..."
              className="w-56 h-9 pl-9 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {/* Dropdown */}
            {isOpen && results && (
              <div className="absolute top-full right-0 mt-1 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                {totalResults === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    Aucun résultat
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto py-1">
                    {categories.map(({ key, label, icon }) => {
                      const items = results[key];
                      if (items.length === 0) return null;
                      return (
                        <div key={key}>
                          <div className="px-3 py-2 flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            {icon}
                            {label}
                          </div>
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleSelect(item.href)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
                            >
                              <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                              <p className="text-xs text-gray-500 truncate">{item.sub}</p>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Role Badge */}
        <span className={cn('hidden sm:inline-flex px-2.5 py-1 rounded-md text-xs font-medium', roleInfo.color)}>
          {roleInfo.label}
        </span>

        {/* Notifications */}
        <NotificationBell />

        {/* User Avatar (mobile only - hidden when sidebar is visible) */}
        <div className="md:hidden w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-xs font-semibold text-blue-600">
            {user.first_name.charAt(0)}{user.last_name.charAt(0)}
          </span>
        </div>
      </div>
    </header>
  );
}
