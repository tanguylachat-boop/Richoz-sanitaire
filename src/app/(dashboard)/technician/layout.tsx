'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, CalendarDays, User, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface TechnicianLayoutProps {
  children: ReactNode;
}

export default function TechnicianLayout({ children }: TechnicianLayoutProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const navItems = [
    {
      href: '/technician/today',
      icon: Calendar,
      label: "Aujourd'hui",
      isActive: pathname === '/technician/today',
    },
    {
      href: '/technician/week',
      icon: CalendarDays,
      label: 'Semaine',
      isActive: pathname === '/technician/week',
    },
    {
      href: '#',
      icon: User,
      label: 'Profil',
      isActive: false,
      disabled: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main content - No sidebar, full width */}
      <main className="flex-1 overflow-y-auto pb-20">
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
                  : item.disabled
                  ? 'text-gray-300 pointer-events-none'
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
