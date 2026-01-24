/**
 * Work class example - Defining standalone, reusable work units
 */
import { Workflow, Work } from '../src';

interface UserData {
  userId: string;
  sendNotifications: boolean;
}

// Define reusable work units using the Work class
const fetchUser = new Work({
  name: 'fetchUser',
  execute: async (ctx: { data: UserData }) => {
    console.log(`Fetching user: ${ctx.data.userId}`);
    await new Promise((r) => setTimeout(r, 100));
    return { id: ctx.data.userId, name: 'John Doe', email: 'john@example.com' };
  },
});

const fetchOrders = new Work({
  name: 'fetchOrders',
  execute: async (ctx: { data: UserData }) => {
    console.log(`Fetching orders for: ${ctx.data.userId}`);
    await new Promise((r) => setTimeout(r, 80));
    return [
      { id: 'order-1', total: 99.99 },
      { id: 'order-2', total: 149.99 },
    ];
  },
});

const fetchPreferences = new Work({
  name: 'fetchPreferences',
  execute: async (ctx: { data: UserData }) => {
    console.log(`Fetching preferences for: ${ctx.data.userId}`);
    await new Promise((r) => setTimeout(r, 60));
    return { theme: 'dark', language: 'en' };
  },
});

// Work with conditional execution
const sendNotification = new Work({
  name: 'sendNotification',
  shouldRun: (ctx: { data: UserData }) => ctx.data.sendNotifications,
  execute: async () => {
    console.log('Sending notification...');
    await new Promise((r) => setTimeout(r, 50));
    return { sent: true, timestamp: new Date().toISOString() };
  },
});

async function main() {
  // Build workflow using Work instances
  // Can mix Work instances with inline definitions
  const workflow = new Workflow<UserData>()
    .serial(fetchUser)
    .parallel([fetchOrders, fetchPreferences])
    .serial({
      // Inline definition mixed with Work instances
      name: 'generateSummary',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser').result;
        const orders = ctx.workResults.get('fetchOrders').result;
        const prefs = ctx.workResults.get('fetchPreferences').result;
        return {
          userName: user?.name,
          orderCount: orders?.length ?? 0,
          totalSpent: orders?.reduce((sum, o) => sum + o.total, 0) ?? 0,
          preferences: prefs,
        };
      },
    })
    .serial(sendNotification);

  console.log('Running workflow with notifications enabled...\n');
  const result = await workflow.run({ userId: 'user-123', sendNotifications: true });

  if (result.status === 'completed') {
    console.log('\n✅ Workflow completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('Summary:', result.context.workResults.get('generateSummary').result);
    console.log('Notification:', result.context.workResults.get('sendNotification').result);
  }

  // Demonstrate reusing same Work instances in different workflow
  console.log('\n--- Reusing works in a simpler workflow ---\n');

  const simpleWorkflow = new Workflow<UserData>().serial(fetchUser).serial(fetchOrders);

  const simpleResult = await simpleWorkflow.run({ userId: 'user-456', sendNotifications: false });

  if (simpleResult.status === 'completed') {
    console.log('\n✅ Simple workflow completed!');
    console.log('User:', simpleResult.context.workResults.get('fetchUser').result);
    console.log('Orders:', simpleResult.context.workResults.get('fetchOrders').result);
  }
}

main().catch(console.error);
