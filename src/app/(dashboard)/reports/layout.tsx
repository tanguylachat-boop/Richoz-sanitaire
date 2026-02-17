'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ClipboardCheck, History, FileText } from 'lucide-react';

const tabs = [
  {
    name: 'À valider',
    href: '/reports/validate',
    icon: ClipboardCheck,
  },
  {
    name: 'Historique',
    href: '/reports/history',
    icon: History,
  },
];

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Determine active tab based on pathname
  const getActiveTab = () => {
    if (pathname.startsWith('/reports/history')) return '/reports/history';
    return '/reports/validate';
  };

  const activeTab = getActiveTab();

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Rapports d&apos;intervention</h1>
              <p className="text-sm text-gray-500">Validez et consultez les rapports des techniciens</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-1 bg-gray-50/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.href;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
