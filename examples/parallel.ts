/**
 * Parallel workflow example - Concurrent execution
 */
import { Workflow, WorkflowStatus } from '@yigitahmetsahin/workflow-ts';

interface OrderData {
  orderId: string;
  userId: string;
}

async function main() {
  const workflow = new Workflow<OrderData>()
    .serial({
      name: 'validateOrder',
      execute: async (ctx) => {
        console.log(`Validating order: ${ctx.data.orderId}`);
        await new Promise((r) => setTimeout(r, 50));
        return { valid: true };
      },
    })
    // These three tasks run in parallel
    .parallel([
      {
        name: 'fetchUserProfile',
        execute: async (ctx) => {
          console.log(`Fetching user profile: ${ctx.data.userId}`);
          await new Promise((r) => setTimeout(r, 200));
          return { name: 'Jane Smith', tier: 'premium' };
        },
      },
      {
        name: 'fetchInventory',
        execute: async (ctx) => {
          console.log(`Checking inventory for order: ${ctx.data.orderId}`);
          await new Promise((r) => setTimeout(r, 150));
          return { inStock: true, quantity: 5 };
        },
      },
      {
        name: 'calculateShipping',
        execute: async (ctx) => {
          console.log('Calculating shipping...');
          await new Promise((r) => setTimeout(r, 100));
          return { cost: 9.99, estimatedDays: 3 };
        },
      },
    ])
    .serial({
      name: 'processOrder',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUserProfile');
        const inventory = ctx.workResults.get('fetchInventory');
        const shipping = ctx.workResults.get('calculateShipping');

        console.log('\nProcessing order with:');
        console.log(`  User: ${user?.name} (${user?.tier})`);
        console.log(`  In Stock: ${inventory?.inStock}`);
        console.log(`  Shipping: $${shipping?.cost}`);

        return {
          confirmed: true,
          total: 99.99 + (shipping?.cost ?? 0),
        };
      },
    });

  console.log('Starting order workflow...\n');
  const start = Date.now();

  const result = await workflow.run({ orderId: 'ORD-001', userId: 'user-456' });

  if (result.status === WorkflowStatus.COMPLETED) {
    console.log('\n✅ Order processed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log(`(Parallel tasks saved ~${200 + 150 + 100 - 200}ms by running concurrently)`);
    console.log('\nFinal result:', result.results.processOrder);
  }
}

main().catch(console.error);
