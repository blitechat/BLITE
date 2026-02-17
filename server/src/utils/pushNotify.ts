import webPush from 'web-push';
import { db } from '../db/connection';
import { pushSubscriptions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '../config';

// Initialize web-push if VAPID keys are configured
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('[Push] Web push configured with VAPID keys');
} else {
  console.log('[Push] VAPID keys not configured - push notifications disabled');
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    const payload = JSON.stringify({
      title,
      body,
      data,
    });

    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (err: any) {
        // Remove invalid subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }
  } catch (err) {
    console.error('[Push] Failed to send notification:', err);
  }
}
