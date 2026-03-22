'use client';

import { ReactNode, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, CalendarDays, Palmtree, LogOut, UserCircle, HardHat, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { registerPushSubscription } from '@/lib/push-notifications';

interface TechnicianLayoutProps {
  children: ReactNode;
}

export default function TechnicianLayout({ children }: TechnicianLayoutProps) {
  const pathname = usePathname();
  const supabase = createClient();
  const [typePreference, setTypePreference] = useState<'depannage' | 'chantier' | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let userId: string | null = null;

    const fetchPreference = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        const [{ data }, { count }] = await Promise.all([
          supabase.from('users').select('intervention_type_preference').eq('id', user.id).single(),
          supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('recipient_id', user.id).eq('is_read', false),
        ]);
        if (data?.intervention_type_preference) {
          setTypePreference(data.intervention_type_preference as 'depannage' | 'chantier');
        }
        setUnreadCount(count || 0);

        // Register push notifications (non-blocking)
        registerPushSubscription().catch(() => {});
      }
    };
    fetchPreference();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(async () => {
      if (!userId) return;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_read', false);
      setUnreadCount(count || 0);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const navItems = useMemo(() => {
    const items = [
      {
        href: '/technician/today',
        icon: Calendar,
        label: "Aujourd'hui",
        isActive: pathname === '/technician/today',
        showFor: 'depannage' as const,
      },
      {
        href: '/technician/week',
        icon: CalendarDays,
        label: 'Semaine',
        isActive: pathname === '/technician/week',
        showFor: 'depannage' as const,
      },
      {
        href: '/technician/chantier',
        icon: HardHat,
        label: 'Chantiers',
        isActive: pathname.startsWith('/technician/chantier'),
        showFor: 'chantier' as const,
      },
      {
        href: '/technician/leave',
        icon: Palmtree,
        label: 'Congés',
        isActive: pathname === '/technician/leave',
        showFor: null as 'depannage' | 'chantier' | null,
      },
      {
        href: '/technician/profile',
        icon: UserCircle,
        label: 'Profil',
        isActive: pathname === '/technician/profile',
        showFor: null,
      },
    ];
    // Filter nav: depannage tech sees only depannage + common; chantier tech sees only chantier + common
    if (typePreference === 'depannage') {
      return items.filter(i => i.showFor === 'depannage' || i.showFor === null);
    }
    if (typePreference === 'chantier') {
      return items.filter(i => i.showFor === 'chantier' || i.showFor === null);
    }
    return items;
  }, [pathname, typePreference]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top notification bar */}
      <div className="fixed top-0 right-0 z-50 p-3">
        <Link
          href="/technician/notifications"
          className="relative p-2.5 bg-white rounded-full shadow-md border border-gray-200 block"
        >
          <Bell className="w-5 h-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {/* Main content - No sidebar, full width */}
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </main>

      {/* Bottom Navigation - Style App Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-pb">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
                item.isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 active:text-blue-600'
              }`}
            >
              <item.icon className={`w-6 h-6 ${item.isActive ? 'stroke-[2.5]' : ''}`} />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>
          ))}
          
          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center flex-1 py-2 text-gray-500 active:text-red-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
            <span className="text-xs mt-1 font-medium">Sortir</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
