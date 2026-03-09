'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, FileText, Wrench, Mail, ClipboardCheck, Palmtree } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils';

const DISMISSED_KEY = 'richoz_dismissed_notifications';

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  const ids = getDismissedIds();
  ids.add(id);
  // Keep only the 50 most recent to avoid unbounded growth
  const arr = Array.from(ids).slice(-50);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
}

type NotificationType = 'invoice_paid' | 'intervention_created' | 'new_email' | 'report_submitted' | 'leave_pending';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  date: string;
  route: string;
}

const NOTIFICATION_STYLE: Record<NotificationType, { bgClass: string; icon: typeof Bell; iconClass: string }> = {
  new_email: { bgClass: 'bg-indigo-50', icon: Mail, iconClass: 'text-indigo-600' },
  report_submitted: { bgClass: 'bg-amber-50', icon: ClipboardCheck, iconClass: 'text-amber-600' },
  leave_pending: { bgClass: 'bg-emerald-50', icon: Palmtree, iconClass: 'text-emerald-600' },
  intervention_created: { bgClass: 'bg-blue-50', icon: Wrench, iconClass: 'text-blue-600' },
  invoice_paid: { bgClass: 'bg-green-50', icon: FileText, iconClass: 'text-green-600' },
};

const RECENT_THRESHOLD_DAYS = 7;

export function NotificationBell() {
  const router = useRouter();
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

    const [emailsRes, reportsRes, leaveRes, interventionsRes, invoicesRes] = await Promise.all([
      sb
        .from('email_inbox')
        .select('id, subject, from_name, received_at')
        .eq('status', 'new')
        .order('received_at', { ascending: false })
        .limit(5),
      sb
        .from('reports')
        .select('id, created_at, technician:users!reports_technician_id_fkey(first_name, last_name), intervention:interventions(title)')
        .eq('status', 'submitted')
        .order('created_at', { ascending: false })
        .limit(5),
      sb
        .from('leave_requests')
        .select('id, start_date, end_date, created_at, technician:users!leave_requests_technician_id_fkey(first_name, last_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      sb
        .from('interventions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      sb
        .from('invoices')
        .select('id, invoice_number, client_name, date')
        .eq('status', 'paid')
        .order('date', { ascending: false })
        .limit(5),
    ]);

    const items: NotificationItem[] = [];

    // Emails
    if (emailsRes.data) {
      for (const e of emailsRes.data as { id: string; subject: string; from_name: string; received_at: string }[]) {
        items.push({
          id: `email-${e.id}`,
          type: 'new_email',
          title: e.subject || 'Nouvel email',
          description: e.from_name || 'Expéditeur inconnu',
          date: e.received_at,
          route: '/inbox',
        });
      }
    }

    // Reports
    if (reportsRes.data) {
      for (const r of reportsRes.data as { id: string; created_at: string; technician?: { first_name: string; last_name: string } | null; intervention?: { title: string } | null }[]) {
        const techName = r.technician ? `${r.technician.first_name} ${r.technician.last_name}` : 'Technicien';
        items.push({
          id: `report-${r.id}`,
          type: 'report_submitted',
          title: 'Rapport à valider',
          description: r.intervention?.title ? `${techName} - ${r.intervention.title}` : techName,
          date: r.created_at,
          route: `/reports/validate/${r.id}`,
        });
      }
    }

    // Leave requests
    if (leaveRes.data) {
      for (const l of leaveRes.data as { id: string; start_date: string; end_date: string; created_at: string; technician?: { first_name: string; last_name: string } | null }[]) {
        const techName = l.technician ? `${l.technician.first_name} ${l.technician.last_name}` : 'Technicien';
        items.push({
          id: `leave-${l.id}`,
          type: 'leave_pending',
          title: 'Demande de congé',
          description: `${techName} (${l.start_date} - ${l.end_date})`,
          date: l.created_at,
          route: '/leave',
        });
      }
    }

    // Interventions
    if (interventionsRes.data) {
      for (const i of interventionsRes.data as { id: string; title: string; created_at: string }[]) {
        items.push({
          id: `int-${i.id}`,
          type: 'intervention_created',
          title: 'Nouvelle intervention',
          description: i.title,
          date: i.created_at,
          route: `/interventions/${i.id}`,
        });
      }
    }

    // Invoices
    if (invoicesRes.data) {
      for (const inv of invoicesRes.data as { id: string; invoice_number: string; client_name: string; date: string }[]) {
        items.push({
          id: `inv-${inv.id}`,
          type: 'invoice_paid',
          title: `Facture ${inv.invoice_number} payée`,
          description: inv.client_name,
          date: inv.date,
          route: `/invoices/${inv.id}`,
        });
      }
    }

    // Sort by date descending, filter dismissed, take 10
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const dismissed = getDismissedIds();
    const visible = items.filter((n) => !dismissed.has(n.id));
    const top = visible.slice(0, 10);

    // Check if any are within the recent threshold
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - RECENT_THRESHOLD_DAYS);
    const recent = top.some((n) => new Date(n.date) > threshold);

    setNotifications(top);
    setHasRecent(recent);
    setLoaded(true);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleNotificationClick = (n: NotificationItem) => {
    addDismissedId(n.id);
    setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    setIsOpen(false);
    router.push(n.route);
  };

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
              notifications.map((n) => {
                const style = NOTIFICATION_STYLE[n.type];
                const Icon = style.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50/60 transition-colors border-b border-gray-50 last:border-0 cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bgClass}`}
                      >
                        <Icon className={`w-4 h-4 ${style.iconClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.description}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatRelativeTime(n.date)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
