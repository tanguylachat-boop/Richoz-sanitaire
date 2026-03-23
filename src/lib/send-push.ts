/**
 * Send a push notification to a user. Fire-and-forget, never throws.
 */
export function sendPush(params: {
  recipient_id: string;
  title: string;
  message?: string;
  url?: string;
}) {
  fetch('/api/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {});
}
