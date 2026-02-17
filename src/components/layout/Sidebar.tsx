'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ADMIN_ROUTES, ADMIN_ONLY_ROUTES, TECHNICIAN_ROUTES } from '@/lib/constants';
import type { User } from '@/types/database';
import {
  Inbox,
  Calendar,
  Wrench,
  ClipboardCheck,
  FileText,
  FilePlus,
  Package,
  Users,
  Building,
  Settings,
  CalendarCheck,
  History,
  LogOut,
  Droplets,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'inbox': Inbox,
  'calendar': Calendar,
  'wrench': Wrench,
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
  'file-plus': FilePlus,
  'package': Package,
  'users': Users,
  'building': Building,
  'settings': Settings,
  'calendar-check': CalendarCheck,
  'history': History,
};

interface SidebarProps {
  user: User;
  className?: string;
}

export function Sidebar({ user, className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isAdmin = user.role === 'admin';
  const isTechnician = user.role === 'technician';

  const mainRoutes = isTechnician ? TECHNICIAN_ROUTES : ADMIN_ROUTES;
  const adminRoutes = isAdmin ? ADMIN_ONLY_ROUTES : [];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Déconnexion réussie');
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      className={cn(
        'w-[260px] bg-white border-r border-gray-200 flex flex-col',
        className
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold text-gray-900">Richoz</span>
            <span className="text-sm text-gray-400 ml-1">Sanitaire</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Main Routes */}
        <div className="px-3 mb-6">
          <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {isTechnician ? 'Mon espace' : 'Gestion'}
          </p>
          <ul className="space-y-1">
            {mainRoutes.map((route) => {
              const Icon = iconMap[route.icon] || Wrench;
              const isActive = pathname === route.href || pathname.startsWith(route.href + '/');

              return (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    <Icon className={cn('w-5 h-5', isActive ? 'text-blue-600' : 'text-gray-400')} />
                    {route.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Admin Routes */}
        {adminRoutes.length > 0 && (
          <div className="px-3">
            <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Administration
            </p>
            <ul className="space-y-1">
              {adminRoutes.map((route) => {
                const Icon = iconMap[route.icon] || Settings;
                const isActive = pathname === route.href || pathname.startsWith(route.href + '/');

                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <Icon className={cn('w-5 h-5', isActive ? 'text-blue-600' : 'text-gray-400')} />
                      {route.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-blue-600">
              {user.first_name.charAt(0)}{user.last_name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
