'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationCounts {
  inbox: number;
  reportsToValidate: number;
  pendingLeave: number;
  chantierUpdates: number;
}

export function useNotificationCounts() {
  const [counts, setCounts] = useState<NotificationCounts>({
    inbox: 0,
    reportsToValidate: 0,
    pendingLeave: 0,
    chantierUpdates: 0,
  });

  const supabase = createClient();

  const fetchCounts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    const [inboxRes, reportsRes, leaveRes, chantierRes] = await Promise.all([
      supabase
        .from('email_inbox')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new'),
      supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted'),
      supabase
        .from('lx_leave')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      userId
        ? supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'chantier_update')
            .eq('is_read', false)
        : Promise.resolve({ count: 0 }),
    ]);

    setCounts({
      inbox: inboxRes.count ?? 0,
      reportsToValidate: reportsRes.count ?? 0,
      pendingLeave: leaveRes.count ?? 0,
      chantierUpdates: chantierRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    fetchCounts();

    const channels: RealtimeChannel[] = [];

    const emailChannel = supabase
      .channel('notif-email_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_inbox' }, () => {
        fetchCounts();
      })
      .subscribe();
    channels.push(emailChannel);

    const reportsChannel = supabase
      .channel('notif-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        fetchCounts();
      })
      .subscribe();
    channels.push(reportsChannel);

    const leaveChannel = supabase
      .channel('notif-lx_leave')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lx_leave' }, () => {
        fetchCounts();
      })
      .subscribe();
    channels.push(leaveChannel);

    const notifChannel = supabase
      .channel('notif-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchCounts();
      })
      .subscribe();
    channels.push(notifChannel);

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [fetchCounts]);

  return counts;
}
