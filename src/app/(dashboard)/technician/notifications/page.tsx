'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Bell, Check, Loader2, Wrench, MessageSquare, HardHat, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils';

interface NotificationRow {
  id: string;
  title: string;
  message: string | null;
  type: string;
  intervention_id: string | null;
  is_read: boolean;
  created_at: string;
  intervention_type?: string | null;
}

export default function TechnicianNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typePreference, setTypePreference] = useState<'depannage' | 'chantier' | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch type preference for navigation
      const { data: prefData } = await supabase.from('users').select('intervention_type_preference').eq('id', user.id).single();
      if (prefData?.intervention_type_preference) {
        setTypePreference(prefData.intervention_type_preference as 'depannage' | 'chantier');
      }

      // Fetch notifications
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        // Fetch intervention types for notifications that have intervention_id
        const interventionIds = data
          .filter((n: NotificationRow) => n.intervention_id)
          .map((n: NotificationRow) => n.intervention_id as string);

        let typeMap = new Map<string, string>();
        if (interventionIds.length > 0) {
          const uniqueIds = Array.from(new Set(interventionIds));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ivData } = await (supabase as any)
            .from('interventions')
            .select('id, intervention_type')
            .in('id', uniqueIds);
          if (ivData) {
            typeMap = new Map(ivData.map((iv: { id: string; intervention_type: string }) => [iv.id, iv.intervention_type]));
          }
        }

        setNotifications(data.map((n: NotificationRow) => ({
          ...n,
          intervention_type: n.intervention_id ? typeMap.get(n.intervention_id) || null : null,
        })) as NotificationRow[]);
      } else {
        setNotifications([]);
      }

      // Mark all as read
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      setIsLoading(false);
    };
    fetchNotifications();
  }, []);

  const getNotificationLink = (n: NotificationRow) => {
    if (n.intervention_id) {
      if (n.intervention_type === 'chantier') {
        return `/technician/chantier/${n.intervention_id}`;
      }
      return `/technician/report/${n.intervention_id}`;
    }
    return '#';
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={typePreference === 'chantier' ? '/technician/chantier' : '/technician/today'} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <Bell className="w-5 h-5 text-gray-600" />
        <h1 className="text-lg font-bold text-gray-900">Notifications</h1>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-gray-500">Chargement...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Aucune notification</h2>
            <p className="text-gray-500">Vous serez notifié des nouvelles interventions ici.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={getNotificationLink(n)}
                className={`block bg-white rounded-2xl shadow-sm p-4 transition-all active:scale-[0.98] ${
                  !n.is_read ? 'border-l-4 border-blue-500' : 'border border-gray-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    n.type === 'revision_requested' ? 'bg-amber-100'
                    : n.type === 'chantier_message' ? 'bg-indigo-100'
                    : n.type === 'chantier_reminder' ? 'bg-orange-100'
                    : n.type === 'intervention_assigned' ? 'bg-emerald-100'
                    : 'bg-blue-100'
                  }`}>
                    {n.type === 'revision_requested' ? (
                      <Bell className="w-5 h-5 text-amber-600" />
                    ) : n.type === 'chantier_message' ? (
                      <MessageSquare className="w-5 h-5 text-indigo-600" />
                    ) : n.type === 'chantier_reminder' ? (
                      <Bell className="w-5 h-5 text-orange-600" />
                    ) : n.type === 'intervention_assigned' ? (
                      n.intervention_type === 'chantier' ? <HardHat className="w-5 h-5 text-emerald-600" /> : <Wrench className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${!n.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
