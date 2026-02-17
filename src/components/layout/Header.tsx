'use client';

import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { ROLES } from '@/lib/constants';
import type { User } from '@/types/database';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';

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

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  const getPageTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    for (const [path, title] of Object.entries(pageTitles)) {
      if (pathname.startsWith(path + '/')) return title;
    }
    return 'Tableau de bord';
  };

  const roleInfo = ROLES[user.role];

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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              className="w-56 h-9 pl-9 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
