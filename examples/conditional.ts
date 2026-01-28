/**
 * Conditional example - Skip steps based on conditions with Work.tree()
 * Demonstrates shouldRun and onSkipped hooks
 */
import { Work } from '../src';

async function main() {
  const tree = Work.tree('notifications')
    .addSerial({
      name: 'fetchUserPreferences',
      execute: async (ctx) => {
        console.log(`Fetching preferences for user: ${ctx.data.userId}`);
        return {
          email: 'user@example.com',
          phone: '+1234567890',
          deviceToken: 'abc123',
        };
      },
    })
    .addSerial({
      name: 'sendEmailNotification',
      shouldRun: (ctx) => Boolean(ctx.data.sendEmail),
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`📧 Sending email to: ${prefs?.email}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'email', sent: true };
      },
      onSkipped: (ctx) => {
        console.log(`⏭️ Email notification skipped for user: ${ctx.data.userId}`);
      },
    })
    .addSerial({
      name: 'sendSmsNotification',
      shouldRun: (ctx) => Boolean(ctx.data.sendSms),
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`📱 Sending SMS to: ${prefs?.phone}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'sms', sent: true };
      },
      onSkipped: (ctx) => {
        console.log(`⏭️ SMS notification skipped for user: ${ctx.data.userId}`);
      },
    })
    .addSerial({
      name: 'sendPushNotification',
      shouldRun: (ctx) => Boolean(ctx.data.sendPush),
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`🔔 Sending push to device: ${prefs?.deviceToken}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'push', sent: true };
      },
      onSkipped: (ctx) => {
        console.log(`⏭️ Push notification skipped for user: ${ctx.data.userId}`);
      },
    })
    .addSerial({
      name: 'logNotifications',
      execute: async (ctx) => {
        const sent: string[] = [];
        if (ctx.workResults.get('sendEmailNotification').result) sent.push('email');
        if (ctx.workResults.get('sendSmsNotification').result) sent.push('sms');
        if (ctx.workResults.get('sendPushNotification').result) sent.push('push');
        return { notificationsSent: sent };
      },
    });

  console.log('=== Scenario 1: Email only ===\n');
  let result = await tree.run({
    userId: 'user-1',
    sendEmail: true,
    sendSms: false,
    sendPush: false,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);

  console.log('\n=== Scenario 2: All notifications ===\n');
  result = await tree.run({
    userId: 'user-2',
    sendEmail: true,
    sendSms: true,
    sendPush: true,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);

  console.log('\n=== Scenario 3: No notifications ===\n');
  result = await tree.run({
    userId: 'user-3',
    sendEmail: false,
    sendSms: false,
    sendPush: false,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);
}

main().catch(console.error);
