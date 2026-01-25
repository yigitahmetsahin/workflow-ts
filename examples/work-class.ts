/**
 * Work class example - Defining standalone, reusable work units with Work.tree()
 *
 * Note: When using Work class instances with Work.tree(), the data types need to match.
 * For simpler usage with dynamic data, prefer inline work definitions.
 */
import { Work } from '../src';

async function main() {
  // Define reusable work units using the Work class
  // Using generic data access for flexibility
  const fetchUser = new Work({
    name: 'fetchUser',
    execute: async (ctx) => {
      const userId = String(ctx.data.userId);
      console.log(`Fetching user: ${userId}`);
      await new Promise((r) => setTimeout(r, 100));
      return { id: userId, name: 'John Doe', email: 'john@example.com' };
    },
  });

  const fetchOrders = new Work({
    name: 'fetchOrders',
    execute: async (ctx) => {
      const userId = String(ctx.data.userId);
      console.log(`Fetching orders for: ${userId}`);
      await new Promise((r) => setTimeout(r, 80));
      return [
        { id: 'order-1', total: 99.99 },
        { id: 'order-2', total: 149.99 },
      ];
    },
  });

  const fetchPreferences = new Work({
    name: 'fetchPreferences',
    execute: async (ctx) => {
      const userId = String(ctx.data.userId);
      console.log(`Fetching preferences for: ${userId}`);
      await new Promise((r) => setTimeout(r, 60));
      return { theme: 'dark', language: 'en' };
    },
  });

  // Work with conditional execution
  const sendNotification = new Work({
    name: 'sendNotification',
    shouldRun: (ctx) => Boolean(ctx.data.sendNotifications),
    execute: async () => {
      console.log('Sending notification...');
      await new Promise((r) => setTimeout(r, 50));
      return { sent: true, timestamp: new Date().toISOString() };
    },
  });

  // Build tree using Work instances
  // Can mix Work instances with inline definitions
  const tree = Work.tree('userDashboard')
    .addSerial(fetchUser)
    .addParallel([fetchOrders, fetchPreferences])
    .addSerial({
      // Inline definition mixed with Work instances
      name: 'generateSummary',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser').result;
        const orders = ctx.workResults.get('fetchOrders').result;
        const prefs = ctx.workResults.get('fetchPreferences').result;
        return {
          userName: user?.name,
          orderCount: (orders as { id: string; total: number }[])?.length ?? 0,
          totalSpent:
            (orders as { id: string; total: number }[])?.reduce((sum, o) => sum + o.total, 0) ?? 0,
          preferences: prefs,
        };
      },
    })
    .addSerial(sendNotification);

  console.log('Running tree with notifications enabled...\n');
  const result = await tree.run({ userId: 'user-123', sendNotifications: true });

  if (result.status === 'completed') {
    console.log('\n✅ Tree completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('Summary:', result.context.workResults.get('generateSummary').result);
    console.log('Notification:', result.context.workResults.get('sendNotification').result);
  }

  // Demonstrate reusing same Work instances in different tree
  console.log('\n--- Reusing works in a simpler tree ---\n');

  const simpleTree = Work.tree('simpleTree').addSerial(fetchUser).addSerial(fetchOrders);

  const simpleResult = await simpleTree.run({ userId: 'user-456', sendNotifications: false });

  if (simpleResult.status === 'completed') {
    console.log('\n✅ Simple tree completed!');
    console.log('User:', simpleResult.context.workResults.get('fetchUser').result);
    console.log('Orders:', simpleResult.context.workResults.get('fetchOrders').result);
  }
}

main().catch(console.error);
