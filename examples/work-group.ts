/**
 * WorkGroup Example
 *
 * This example demonstrates using WorkGroup to dynamically build
 * a collection of parallel works based on runtime conditions.
 */

import { Workflow, Work, WorkGroup } from '../src';

// Simulated data type
interface UserContext {
  userId: string;
  options: {
    includeOrders: boolean;
    includeNotifications: boolean;
    includeAnalytics: boolean;
  };
}

// Define reusable Work instances
const fetchUser = new Work({
  name: 'fetchUser',
  execute: async (ctx: { data: UserContext }) => {
    console.log('  Fetching user...');
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { id: ctx.data.userId, name: 'John Doe', email: 'john@example.com' };
  },
});

const fetchOrders = new Work({
  name: 'fetchOrders',
  execute: async (_ctx: { data: UserContext }) => {
    console.log('  Fetching orders...');
    await new Promise((resolve) => setTimeout(resolve, 80));
    return [
      { id: 'order-1', total: 99.99 },
      { id: 'order-2', total: 149.99 },
    ];
  },
});

const fetchNotifications = new Work({
  name: 'fetchNotifications',
  execute: async (_ctx: { data: UserContext }) => {
    console.log('  Fetching notifications...');
    await new Promise((resolve) => setTimeout(resolve, 60));
    return [{ id: 'notif-1', message: 'Welcome!' }];
  },
});

const fetchAnalytics = new Work({
  name: 'fetchAnalytics',
  execute: async (_ctx: { data: UserContext }) => {
    console.log('  Fetching analytics...');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { pageViews: 1234, sessions: 56 };
  },
});

async function main() {
  console.log('=== WorkGroup Example ===\n');

  // Example 1: Dynamic WorkGroup based on conditions
  console.log('Example 1: Dynamic WorkGroup\n');

  const options = {
    includeOrders: true,
    includeNotifications: true,
    includeAnalytics: false, // Analytics will be skipped
  };

  // Build the group dynamically
  const dataFetchGroup = new WorkGroup<UserContext>();

  // Always fetch user
  dataFetchGroup.addWork(fetchUser);

  // Conditionally add other works
  if (options.includeOrders) {
    dataFetchGroup.addWork(fetchOrders);
  }

  if (options.includeNotifications) {
    dataFetchGroup.addWork(fetchNotifications);
  }

  if (options.includeAnalytics) {
    dataFetchGroup.addWork(fetchAnalytics);
  }

  console.log(`WorkGroup contains ${dataFetchGroup.length} works\n`);

  const workflow = new Workflow<UserContext>().parallel(dataFetchGroup).serial({
    name: 'processResults',
    execute: async (ctx) => {
      const user = ctx.workResults.get('fetchUser').result;
      console.log(`\n  Processing data for user: ${user?.name}`);

      // Safely access conditional results
      if (ctx.workResults.has('fetchOrders')) {
        const orders = ctx.workResults.get('fetchOrders').result;
        console.log(`  Found ${orders?.length} orders`);
      }

      if (ctx.workResults.has('fetchNotifications')) {
        const notifications = ctx.workResults.get('fetchNotifications').result;
        console.log(`  Found ${notifications?.length} notifications`);
      }

      return { processed: true };
    },
  });

  const result = await workflow.run({
    userId: 'user-123',
    options,
  });

  console.log('\nResult:', result.status);
  console.log('Duration:', result.totalDuration, 'ms');

  // Example 2: Mixing arrays and WorkGroups
  console.log('\n\n=== Example 2: Mixing Arrays and WorkGroups ===\n');

  const additionalGroup = new WorkGroup<UserContext>().addWork({
    name: 'groupWork',
    execute: async () => {
      console.log('  Executing group work...');
      return 'from group';
    },
  });

  const mixedWorkflow = new Workflow<UserContext>()
    // Array syntax
    .parallel([
      { name: 'arrayWork1', execute: async () => 'from array 1' },
      { name: 'arrayWork2', execute: async () => 'from array 2' },
    ])
    // WorkGroup syntax
    .parallel(additionalGroup)
    .serial({
      name: 'summarize',
      execute: async (ctx) => {
        return {
          fromArray1: ctx.workResults.get('arrayWork1').result,
          fromArray2: ctx.workResults.get('arrayWork2').result,
          fromGroup: ctx.workResults.get('groupWork').result,
        };
      },
    });

  const mixedResult = await mixedWorkflow.run({
    userId: 'user-456',
    options: { includeOrders: false, includeNotifications: false, includeAnalytics: false },
  });

  console.log('\nSummary:', mixedResult.context.workResults.get('summarize').result);

  // Example 3: Empty WorkGroup handling
  console.log('\n\n=== Example 3: Empty WorkGroup ===\n');

  const emptyGroup = new WorkGroup<UserContext>();
  console.log('Empty group isEmpty:', emptyGroup.isEmpty()); // true
  console.log('Empty group length:', emptyGroup.length); // 0

  const workflowWithEmptyGroup = new Workflow<UserContext>()
    .serial({ name: 'before', execute: async () => 'before' })
    .parallel(emptyGroup) // This is safely handled
    .serial({ name: 'after', execute: async () => 'after' });

  const emptyGroupResult = await workflowWithEmptyGroup.run({
    userId: 'user-789',
    options: { includeOrders: false, includeNotifications: false, includeAnalytics: false },
  });

  console.log('Workflow with empty group:', emptyGroupResult.status);
}

main().catch(console.error);
