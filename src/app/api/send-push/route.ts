import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(`mailto:admin@${new URL(VAPID_SUBJECT).hostname}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function POST(request: NextRequest) {
  try {
    // Auth check: only authenticated users can send push notifications
    const serverSupabase = createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
    }

    const { recipient_id, title, message, url } = await request.json();

    if (!recipient_id || !title) {
      return NextResponse.json({ error: 'recipient_id and title are required' }, { status: 400 });
    }

    const supabase = createClient();

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', recipient_id);

    if (error || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title,
      message: message || '',
      url: url || '/technician/notifications',
      tag: `notif-${Date.now()}`,
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 410 Gone or 404 = subscription expired, clean up
        if (statusCode === 410 || statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints);
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('Send push error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
