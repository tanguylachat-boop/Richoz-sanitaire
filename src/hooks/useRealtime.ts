'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName = 'interventions' | 'reports' | 'email_inbox';

interface UseRealtimeOptions<T> {
  table: TableName;
  filter?: string;
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: { id: string }) => void;
  enabled?: boolean;
}

/**
 * Hook for subscribing to Supabase Realtime changes
 * @example
 * useRealtime({
 *   table: 'interventions',
 *   filter: 'technician_id=eq.abc123',
 *   onInsert: (intervention) => console.log('New:', intervention),
 *   onUpdate: (intervention) => console.log('Updated:', intervention),
 * });
 */
export function useRealtime<T extends { id: string }>({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOptions<T>) {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<T>) => {
      if (payload.eventType === 'INSERT' && onInsert) {
        onInsert(payload.new as T);
      } else if (payload.eventType === 'UPDATE' && onUpdate) {
        onUpdate(payload.new as T);
      } else if (payload.eventType === 'DELETE' && onDelete) {
        onDelete({ id: (payload.old as { id: string }).id });
      }
    },
    [onInsert, onUpdate, onDelete]
  );

  useEffect(() => {
    if (!enabled) return;

    const channelName = `realtime-${table}${filter ? `-${filter}` : ''}`;

    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter,
        },
        handleChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ${table}`);
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter, enabled, handleChange]);
}

/**
 * Hook for subscribing to intervention changes
 */
export function useInterventionsRealtime(
  options: Omit<UseRealtimeOptions<{ id: string }>, 'table'>
) {
  return useRealtime({ ...options, table: 'interventions' });
}

/**
 * Hook for subscribing to report changes
 */
export function useReportsRealtime(
  options: Omit<UseRealtimeOptions<{ id: string }>, 'table'>
) {
  return useRealtime({ ...options, table: 'reports' });
}

/**
 * Hook for subscribing to email inbox changes
 */
export function useEmailInboxRealtime(
  options: Omit<UseRealtimeOptions<{ id: string }>, 'table'>
) {
  return useRealtime({ ...options, table: 'email_inbox' });
}
