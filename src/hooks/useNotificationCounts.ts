'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationCounts {
  inbox: number;
  reportsToValidate: number;
  pendingLeave: number;
}

export function useNotificationCounts() {
  const [counts, setCounts] = useState<NotificationCounts>({
    inbox: 0,
    reportsToValidate: 0,
    pendingLeave: 0,
  });

  const supabase = createClient();

  const fetchCounts = useCallback(async () => {
    const [inboxRes, reportsRes, leaveRes] = await Promise.all([
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
    ]);

    setCounts({
      inbox: inboxRes.count ?? 0,
      reportsToValidate: reportsRes.count ?? 0,
      pendingLeave: leaveRes.count ?? 0,
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

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [fetchCounts]);

  return counts;
}
