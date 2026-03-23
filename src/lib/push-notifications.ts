import { createClient } from '@/lib/supabase/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function unregisterPushSubscription(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;

    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return true;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Remove from database
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', endpoint);
      }
    }

    console.log('[Push] Unsubscribed');
    return true;
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err);
    return false;
  }
}

/**
 * Register push subscription. Throws on failure with a descriptive message.
 */
export async function registerPushSubscription(): Promise<void> {
  console.log('[Push] Starting registration...');

  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker non supporté par ce navigateur');
  }
  if (!('PushManager' in window)) {
    throw new Error('Push API non supportée par ce navigateur');
  }
  if (!('Notification' in window)) {
    throw new Error('Notifications non supportées par ce navigateur');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Clé VAPID non configurée (contactez l\'administrateur)');
  }

  // Request permission
  const permission = await Notification.requestPermission();
  console.log('[Push] Permission:', permission);
  if (permission === 'denied') {
    throw new Error('Notifications bloquées — activez-les dans Réglages > Safari > Notifications');
  }
  if (permission !== 'granted') {
    throw new Error('Permission de notification refusée');
  }

  // Register service worker
  console.log('[Push] Registering service worker...');
  let registration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[Push] SW register failed:', err);
    throw new Error(`Échec enregistrement Service Worker: ${(err as Error).message}`);
  }

  try {
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[Push] SW ready failed:', err);
    throw new Error(`Service Worker non prêt: ${(err as Error).message}`);
  }
  console.log('[Push] Service worker ready, scope:', registration.scope);

  // Check for existing subscription
  let subscription = await registration.pushManager.getSubscription();

  // Subscribe if not already subscribed
  if (!subscription) {
    console.log('[Push] Creating new subscription...');
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
      throw new Error(`Échec souscription push: ${(err as Error).message}`);
    }
  } else {
    console.log('[Push] Existing subscription found');
  }

  // Extract keys
  const key = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!key || !auth) {
    throw new Error('Clés de souscription manquantes (p256dh/auth)');
  }

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)));
  const authKey = btoa(String.fromCharCode(...new Uint8Array(auth)));

  // Save to Supabase
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Utilisateur non authentifié');
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: p256dh,
        auth: authKey,
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('[Push] DB save failed:', error);
    throw new Error(`Échec sauvegarde: ${error.message}`);
  }

  console.log('[Push] Registration complete for user', user.id);
}
