/**
 * Conditional workflow example - Skip steps based on conditions
 */
import { Workflow } from '../src';

interface NotificationData {
  userId: string;
  sendEmail: boolean;
  sendSms: boolean;
  sendPush: boolean;
}

async function main() {
  const workflow = new Workflow<NotificationData>()
    .serial({
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
    .serial({
      name: 'sendEmailNotification',
      shouldRun: (ctx) => ctx.data.sendEmail,
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`📧 Sending email to: ${prefs?.email}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'email', sent: true };
      },
    })
    .serial({
      name: 'sendSmsNotification',
      shouldRun: (ctx) => ctx.data.sendSms,
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`📱 Sending SMS to: ${prefs?.phone}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'sms', sent: true };
      },
    })
    .serial({
      name: 'sendPushNotification',
      shouldRun: (ctx) => ctx.data.sendPush,
      execute: async (ctx) => {
        const prefs = ctx.workResults.get('fetchUserPreferences').result;
        console.log(`🔔 Sending push to device: ${prefs?.deviceToken}`);
        await new Promise((r) => setTimeout(r, 100));
        return { type: 'push', sent: true };
      },
    })
    .serial({
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
  let result = await workflow.run({
    userId: 'user-1',
    sendEmail: true,
    sendSms: false,
    sendPush: false,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);

  console.log('\n=== Scenario 2: All notifications ===\n');
  result = await workflow.run({
    userId: 'user-2',
    sendEmail: true,
    sendSms: true,
    sendPush: true,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);

  console.log('\n=== Scenario 3: No notifications ===\n');
  result = await workflow.run({
    userId: 'user-3',
    sendEmail: false,
    sendSms: false,
    sendPush: false,
  });
  console.log('Result:', result.context.workResults.get('logNotifications').result);
}

main().catch(console.error);
