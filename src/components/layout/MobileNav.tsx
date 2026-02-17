'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/database';
import {
  Calendar,
  CalendarCheck,
  ClipboardList,
  FileText,
  Inbox,
} from 'lucide-react';

interface MobileNavProps {
  role: UserRole;
  className?: string;
}

const technicianNav = [
  { href: '/technician/today', label: "Aujourd'hui", icon: CalendarCheck },
  { href: '/technician/week', label: 'Semaine', icon: Calendar },
  { href: '/interventions', label: 'Historique', icon: ClipboardList },
];

const adminNav = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/calendar', label: 'Calendrier', icon: Calendar },
  { href: '/reports/validate', label: 'Rapports', icon: ClipboardList },
  { href: '/invoices', label: 'Factures', icon: FileText },
];

export function MobileNav({ role, className }: MobileNavProps) {
  const pathname = usePathname();
  const navItems = role === 'technician' ? technicianNav : adminNav;

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-safe',
        className
      )}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                isActive ? 'text-blue-600' : 'text-gray-500'
              )}
            >
              <Icon className={cn('w-5 h-5 mb-1', isActive ? 'text-blue-600' : 'text-gray-400')} />
              <span className={cn('text-xs font-medium', isActive ? 'text-blue-600' : 'text-gray-500')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
