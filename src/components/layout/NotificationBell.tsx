'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, FileText, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: 'invoice_paid' | 'intervention_created';
  title: string;
  description: string;
  date: string;
}

const RECENT_THRESHOLD_DAYS = 7;

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasRecent, setHasRecent] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const [invoicesRes, interventionsRes] = await Promise.all([
      sb
        .from('invoices')
        .select('id, invoice_number, client_name, date')
        .eq('status', 'paid')
        .order('date', { ascending: false })
        .limit(5),
      sb
        .from('interventions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const items: NotificationItem[] = [];

    if (invoicesRes.data) {
      for (const inv of invoicesRes.data as { id: string; invoice_number: string; client_name: string; date: string }[]) {
        items.push({
          id: `inv-${inv.id}`,
          type: 'invoice_paid',
          title: `Facture ${inv.invoice_number} payée`,
          description: inv.client_name,
          date: inv.date,
        });
      }
    }

    if (interventionsRes.data) {
      for (const int of interventionsRes.data as { id: string; title: string; created_at: string }[]) {
        items.push({
          id: `int-${int.id}`,
          type: 'intervention_created',
          title: 'Nouvelle intervention',
          description: int.title,
          date: int.created_at,
        });
      }
    }

    // Sort by date descending, take 5
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const top5 = items.slice(0, 5);

    // Check if any are within the recent threshold
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - RECENT_THRESHOLD_DAYS);
    const recent = top5.some((n) => new Date(n.date) > threshold);

    setNotifications(top5);
    setHasRecent(recent);
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
      >
        <Bell className="w-5 h-5" />
        {hasRecent && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 right-0 w-80 bg-white rounded-xl border border-gray-200 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <div className="p-4 text-center text-sm text-gray-400">Chargement...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Aucune nouvelle notification</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        n.type === 'invoice_paid' ? 'bg-green-50' : 'bg-blue-50'
                      }`}
                    >
                      {n.type === 'invoice_paid' ? (
                        <FileText className="w-4 h-4 text-green-600" />
                      ) : (
                        <Wrench className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.description}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {formatRelativeTime(n.date)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
