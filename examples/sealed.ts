/**
 * Sealed Tree Example
 *
 * Demonstrates how to seal a tree to prevent modifications:
 * - Simple seal (prevents addSerial/addParallel)
 * - Seal with a final work
 * - isSealed() and options access
 */

import { Work } from '../src';

async function main() {
  console.log('=== Sealed Tree Example ===\n');

  // --- Example 1: Simple Seal ---
  console.log('1. Simple Seal (prevents modifications)\n');

  const tree1 = Work.tree('simpleTree')
    .addSerial({
      name: 'step1',
      execute: async () => {
        console.log('  Executing step1');
        return 'result1';
      },
    })
    .addSerial({
      name: 'step2',
      execute: async (ctx) => {
        const prev = ctx.workResults.get('step1').result;
        console.log('  Executing step2, prev:', prev);
        return 'result2';
      },
    });

  console.log('  Before seal:');
  console.log('    isSealed():', tree1.isSealed());

  // Seal the tree - returns a SealedTreeWork (no addSerial/addParallel methods)
  const sealed1 = tree1.seal();

  console.log('  After seal:');
  console.log('    isSealed():', sealed1.isSealed());
  console.log('    options:', sealed1.options);

  // Run the sealed tree
  const result1 = await sealed1.run({});
  console.log('  Status:', result1.status);
  console.log('  Total duration:', result1.totalDuration, 'ms\n');

  // --- Example 2: Seal with Final Work ---
  console.log('2. Seal with Final Work\n');

  const tree2 = Work.tree('treeWithFinal')
    .addParallel([
      {
        name: 'fetchUser',
        execute: async () => {
          console.log('  Fetching user...');
          return { id: 1, name: 'John' };
        },
      },
      {
        name: 'fetchOrders',
        execute: async () => {
          console.log('  Fetching orders...');
          return [{ orderId: 101 }, { orderId: 102 }];
        },
      },
    ])
    // Seal with a final aggregation work
    .seal({
      name: 'aggregate',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser').result;
        const orders = ctx.workResults.get('fetchOrders').result;
        console.log('  Aggregating results...');
        return {
          userName: user?.name,
          orderCount: orders?.length ?? 0,
        };
      },
    });

  console.log('  isSealed():', tree2.isSealed());

  const result2 = await tree2.run({});
  console.log('  Status:', result2.status);
  console.log('  Aggregate result:', result2.context.workResults.get('aggregate').result);
  console.log('  Total duration:', result2.totalDuration, 'ms\n');

  // --- Example 3: Seal with Options ---
  console.log('3. Seal with failFast Option\n');

  const tree3 = Work.tree('treeWithOptions', { failFast: false })
    .addParallel([
      {
        name: 'task1',
        execute: async () => {
          console.log('  Task1 executing');
          return 'task1-done';
        },
      },
      {
        name: 'task2',
        execute: async () => {
          console.log('  Task2 executing');
          return 'task2-done';
        },
      },
    ])
    .seal();

  console.log('  options:', tree3.options);
  console.log('  options.failFast:', tree3.options.failFast);

  const result3 = await tree3.run({});
  console.log('  Status:', result3.status);
  console.log('  Task1 result:', result3.context.workResults.get('task1').result);
  console.log('  Task2 result:', result3.context.workResults.get('task2').result);
  console.log();

  // --- Summary ---
  console.log('=== Summary ===');
  console.log('- seal() prevents further modifications (no addSerial/addParallel)');
  console.log('- seal(finalWork) adds a final work before sealing');
  console.log('- isSealed() returns true after sealing');
  console.log('- options gives access to tree configuration (e.g., failFast)');
  console.log('- Sealed trees can still be run()');
}

main().catch(console.error);
