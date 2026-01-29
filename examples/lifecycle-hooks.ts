/**
 * Lifecycle Hooks example - onBefore and onAfter hooks for trees and works
 * Demonstrates setup/cleanup patterns, logging, and typed workResults access
 */
import { Work, WorkStatus } from '../src';

async function main() {
  console.log('=== Example 1: Work-level onBefore and onAfter ===\n');

  // Individual Work instances can have their own lifecycle hooks
  const workWithHooks = new Work({
    name: 'workWithHooks',
    onBefore: async (ctx) => {
      console.log(`[Work onBefore] Starting work with data: ${JSON.stringify(ctx.data)}`);
    },
    execute: async (ctx) => {
      console.log('  Executing work...');
      return `Hello, ${ctx.data.name}!`;
    },
    onAfter: async (_ctx, outcome) => {
      console.log(`[Work onAfter] Work finished with status: ${outcome.status}`);
      if (outcome.status === WorkStatus.Completed) {
        console.log(`[Work onAfter] Result: ${outcome.result}`);
      }
    },
  });

  // Use the work in a tree
  const treeWithWorkHooks = Work.tree('treeWithWorkHooks').addSerial(workWithHooks);

  await treeWithWorkHooks.run({ name: 'World' });

  console.log('\n=== Example 2: Tree-level onBefore and onAfter ===\n');

  const basicTree = Work.tree<{ userId: string }>('basicWorkflow', {
    onBefore: async (ctx) => {
      console.log(`[onBefore] Starting workflow for user: ${ctx.data.userId}`);
      console.log(`[onBefore] Timestamp: ${new Date().toISOString()}`);
    },
    onAfter: async (_ctx, outcome) => {
      console.log(`[onAfter] Workflow finished with status: ${outcome.status}`);
      if (outcome.status === WorkStatus.Completed) {
        console.log(`[onAfter] Final result:`, outcome.result);
      }
    },
  })
    .addSerial({
      name: 'fetchUser',
      execute: async (ctx) => {
        console.log('  Fetching user...');
        await new Promise((r) => setTimeout(r, 50));
        return { id: ctx.data.userId, name: 'John Doe' };
      },
    })
    .addSerial({
      name: 'processUser',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser').result;
        console.log(`  Processing user: ${user?.name}`);
        return `Processed: ${user?.name}`;
      },
    });

  await basicTree.run({ userId: 'user-123' });

  console.log('\n=== Example 3: setOnAfter with Full Type Inference ===\n');

  const typedTree = Work.tree('typedWorkflow')
    .addSerial({
      name: 'fetchProfile',
      execute: async () => {
        console.log('  Fetching profile...');
        return { name: 'Alice', email: 'alice@example.com' };
      },
    })
    .addSerial({
      name: 'fetchOrders',
      execute: async () => {
        console.log('  Fetching orders...');
        return [
          { id: 1, total: 99.99 },
          { id: 2, total: 149.99 },
        ];
      },
    })
    .addSerial({
      name: 'calculateTotal',
      execute: async (ctx) => {
        const orders = ctx.workResults.get('fetchOrders').result;
        return orders?.reduce((sum, order) => sum + order.total, 0) ?? 0;
      },
    })
    .setOnAfter(async (_ctx, outcome) => {
      // Full type inference for workResults!
      const profile = outcome.workResults.get('fetchProfile').result;
      const orders = outcome.workResults.get('fetchOrders').result;
      const total = outcome.workResults.get('calculateTotal').result;

      console.log(`[setOnAfter] Customer: ${profile?.name} (${profile?.email})`);
      console.log(`[setOnAfter] Orders: ${orders?.length}`);
      console.log(`[setOnAfter] Total: $${total?.toFixed(2)}`);
    });

  await typedTree.run({});

  console.log('\n=== Example 4: Error Handling with onAfter ===\n');

  const errorTree = Work.tree('errorWorkflow', {
    onBefore: async () => {
      console.log('[onBefore] Starting risky workflow...');
    },
    onAfter: async (_ctx, outcome) => {
      if (outcome.status === WorkStatus.Failed) {
        console.log(`[onAfter] Workflow failed: ${outcome.error?.message}`);
        console.log('[onAfter] Performing cleanup...');
      } else {
        console.log('[onAfter] Workflow succeeded');
      }
    },
  }).addSerial({
    name: 'riskyOperation',
    execute: async () => {
      console.log('  Attempting risky operation...');
      throw new Error('Something went wrong!');
    },
  });

  await errorTree.run({});

  console.log('\n=== Example 5: Safe Lock/Unlock (try/finally semantics) ===\n');

  // Simulating a lock that must be released even if onBefore fails after acquiring
  let lockHeld = false;

  const lockTree = Work.tree('lockWorkflow', {
    onBefore: async () => {
      console.log('[onBefore] Acquiring lock...');
      lockHeld = true;
      console.log('[onBefore] Lock acquired!');
      // Simulate an error AFTER acquiring the lock
      throw new Error('Something failed after acquiring lock!');
    },
    onAfter: async () => {
      // This is ALWAYS called if onBefore was invoked (try/finally semantics)
      console.log('[onAfter] Releasing lock...');
      lockHeld = false;
      console.log('[onAfter] Lock released!');
    },
  }).addSerial({
    name: 'criticalSection',
    execute: async () => {
      console.log('  In critical section (should not run)');
      return 'done';
    },
  });

  await lockTree.run({});
  console.log(`Lock still held? ${lockHeld}`); // Should be false!

  console.log('\n=== Example 6: Nested Trees with Hooks ===\n');

  const innerTree = Work.tree('innerTree', {
    onBefore: async () => console.log('    [Inner onBefore]'),
    onAfter: async () => console.log('    [Inner onAfter]'),
  }).addSerial({
    name: 'innerStep',
    execute: async () => {
      console.log('      Executing inner step...');
      return 'inner result';
    },
  });

  const outerTree = Work.tree('outerTree', {
    onBefore: async () => console.log('[Outer onBefore]'),
    onAfter: async () => console.log('[Outer onAfter]'),
  })
    .addSerial({
      name: 'beforeInner',
      execute: async () => {
        console.log('  Executing before inner...');
        return 'before';
      },
    })
    .addSerial(innerTree)
    .addSerial({
      name: 'afterInner',
      execute: async (ctx) => {
        const inner = ctx.workResults.get('innerStep').result;
        console.log(`  Executing after inner (got: ${inner})...`);
        return 'after';
      },
    });

  await outerTree.run({});

  console.log('\n=== Example 7: Transaction-like Pattern ===\n');

  // Simulating a transaction with setup and cleanup
  const transactionTree = Work.tree('transaction', {
    onBefore: async () => {
      console.log('[onBefore] Opening database connection...');
      console.log('[onBefore] Starting transaction...');
    },
    onAfter: async (_ctx, outcome) => {
      if (outcome.status === WorkStatus.Completed) {
        console.log('[onAfter] Committing transaction...');
      } else {
        console.log('[onAfter] Rolling back transaction...');
      }
      console.log('[onAfter] Closing database connection...');
    },
  })
    .addSerial({
      name: 'insertUser',
      execute: async () => {
        console.log('  INSERT INTO users...');
        return { userId: 1 };
      },
    })
    .addSerial({
      name: 'insertProfile',
      execute: async (ctx) => {
        const user = ctx.workResults.get('insertUser').result;
        console.log(`  INSERT INTO profiles (user_id=${user?.userId})...`);
        return { profileId: 100 };
      },
    })
    .addSerial({
      name: 'sendWelcomeEmail',
      execute: async () => {
        console.log('  Sending welcome email...');
        return { sent: true };
      },
    });

  await transactionTree.run({});

  console.log('\n=== Example 8: Conditional Skip (onAfter not called) ===\n');

  const skippableTree = Work.tree('skippable', {
    shouldRun: (ctx) => Boolean(ctx.data.enabled),
    onSkipped: async () => {
      console.log('[onSkipped] Tree was skipped');
    },
    onBefore: async () => {
      console.log('[onBefore] This should NOT be called when skipped');
    },
    onAfter: async () => {
      console.log('[onAfter] This should NOT be called when skipped');
    },
  }).addSerial({
    name: 'step',
    execute: async () => 'done',
  });

  console.log('Running with enabled=false:');
  await skippableTree.run({ enabled: false });

  console.log('\nRunning with enabled=true:');
  await skippableTree.run({ enabled: true });

  console.log('\nDone!');
}

main().catch(console.error);
