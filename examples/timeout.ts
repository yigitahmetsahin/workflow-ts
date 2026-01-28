/**
 * Timeout mechanism example with Work.tree()
 *
 * Demonstrates various timeout patterns:
 * - Simple timeout in milliseconds
 * - Timeout with onTimeout callback
 * - Tree-level timeout
 * - Timeout with retry
 * - Timeout with error handling
 */
import { Work, TimeoutError } from '../src';

// Helper to simulate slow operations
const slowOperation = (ms: number): Promise<string> =>
  new Promise((resolve) => setTimeout(() => resolve('completed'), ms));

async function main() {
  // ==========================================================================
  // Example 1: Simple timeout
  // ==========================================================================
  console.log('=== Example 1: Simple timeout ===\n');

  const simpleTimeoutTree = Work.tree('simpleTimeout').addSerial({
    name: 'slowWork',
    execute: async () => {
      console.log('  Starting slow operation (will timeout)...');
      return await slowOperation(200); // Takes 200ms
    },
    timeout: 50, // Timeout after 50ms
  });

  const result1 = await simpleTimeoutTree.run({});
  console.log(`  Status: ${result1.status}`);
  if (result1.error instanceof TimeoutError) {
    console.log(`  Timeout error: ${result1.error.message}`);
    console.log(`  Work that timed out: ${result1.error.workName}`);
    console.log(`  Timeout duration: ${result1.error.timeoutMs}ms`);
  }

  // ==========================================================================
  // Example 2: Work completes before timeout
  // ==========================================================================
  console.log('\n=== Example 2: Work completes before timeout ===\n');

  const fastWorkTree = Work.tree('fastWork').addSerial({
    name: 'quickOperation',
    execute: async () => {
      console.log('  Starting quick operation...');
      return await slowOperation(20); // Takes 20ms
    },
    timeout: 100, // Timeout after 100ms (plenty of time)
  });

  const result2 = await fastWorkTree.run({});
  console.log(`  Status: ${result2.status}`);
  console.log(`  Result: ${result2.context.workResults.get('quickOperation').result}`);

  // ==========================================================================
  // Example 3: Timeout with onTimeout callback
  // ==========================================================================
  console.log('\n=== Example 3: Timeout with onTimeout callback ===\n');

  const callbackTimeoutTree = Work.tree('callbackTimeout').addSerial({
    name: 'monitoredWork',
    execute: async () => {
      console.log('  Starting monitored operation...');
      return await slowOperation(200);
    },
    timeout: {
      ms: 50,
      onTimeout: (ctx) => {
        console.log('  [onTimeout] Operation timed out!');
        console.log(`  [onTimeout] Context data: ${JSON.stringify(ctx.data)}`);
        // This is useful for logging, alerting, or cleanup
      },
    },
  });

  await callbackTimeoutTree.run({ userId: 'user-123' });

  // ==========================================================================
  // Example 4: Tree-level timeout
  // ==========================================================================
  console.log('\n=== Example 4: Tree-level timeout ===\n');

  const treeLevelTimeoutTree = Work.tree('treeTimeout', {
    timeout: 100, // Entire tree must complete within 100ms
  })
    .addSerial({
      name: 'step1',
      execute: async () => {
        console.log('  Step 1: Starting (40ms)...');
        await slowOperation(40);
        console.log('  Step 1: Completed');
        return 'step1-done';
      },
    })
    .addSerial({
      name: 'step2',
      execute: async () => {
        console.log('  Step 2: Starting (100ms - will cause tree timeout)...');
        await slowOperation(100);
        console.log('  Step 2: Completed'); // This won't print
        return 'step2-done';
      },
    });

  const result4 = await treeLevelTimeoutTree.run({});
  console.log(`  Tree status: ${result4.status}`);
  if (result4.error instanceof TimeoutError) {
    console.log(`  Tree timeout error: ${result4.error.message}`);
  }

  // ==========================================================================
  // Example 5: Timeout with retry
  // ==========================================================================
  console.log('\n=== Example 5: Timeout with retry ===\n');

  let attempt5 = 0;
  const timeoutRetryTree = Work.tree('timeoutRetry').addSerial({
    name: 'unreliableService',
    execute: async () => {
      attempt5++;
      console.log(`  Attempt ${attempt5}...`);
      if (attempt5 < 3) {
        // First two attempts are slow (will timeout)
        await slowOperation(200);
      }
      // Third attempt is fast
      await slowOperation(10);
      return 'success!';
    },
    timeout: 50, // Times out after 50ms
    retry: 3, // Retry up to 3 times on any error (including timeout)
  });

  const result5 = await timeoutRetryTree.run({});
  console.log(`  Status: ${result5.status}`);
  console.log(`  Total attempts: ${result5.context.workResults.get('unreliableService').attempts}`);
  console.log(`  Result: ${result5.context.workResults.get('unreliableService').result}`);

  // ==========================================================================
  // Example 6: Timeout with silenceError (continue on timeout)
  // ==========================================================================
  console.log('\n=== Example 6: Timeout with silenceError ===\n');

  const silencedTimeoutTree = Work.tree('silencedTimeout')
    .addSerial({
      name: 'optionalSlowWork',
      execute: async () => {
        console.log('  Optional slow work starting...');
        return await slowOperation(200);
      },
      timeout: 50,
      silenceError: true, // Tree continues even if this times out
    })
    .addSerial({
      name: 'requiredWork',
      execute: async () => {
        console.log('  Required work starting...');
        return 'required-work-done';
      },
    });

  const result6 = await silencedTimeoutTree.run({});
  console.log(`  Tree status: ${result6.status}`);
  console.log(
    `  Optional work status: ${result6.context.workResults.get('optionalSlowWork').status}`
  );
  console.log(`  Required work result: ${result6.context.workResults.get('requiredWork').result}`);

  // ==========================================================================
  // Example 7: Timeout with onError handler
  // ==========================================================================
  console.log('\n=== Example 7: Timeout with onError handler ===\n');

  const onErrorTimeoutTree = Work.tree('onErrorTimeout')
    .addSerial({
      name: 'handledTimeout',
      execute: async () => {
        console.log('  Work starting (will timeout)...');
        return await slowOperation(200);
      },
      timeout: 50,
      onError: (error, _ctx) => {
        if (error instanceof TimeoutError) {
          console.log(`  [onError] Handling timeout: ${error.message}`);
          // By not throwing, we allow the tree to continue
        }
      },
    })
    .addSerial({
      name: 'afterTimeout',
      execute: async () => {
        console.log('  After timeout work running...');
        return 'continued-after-timeout';
      },
    });

  const result7 = await onErrorTimeoutTree.run({});
  console.log(`  Tree status: ${result7.status}`);
  console.log(`  After timeout result: ${result7.context.workResults.get('afterTimeout').result}`);

  // ==========================================================================
  // Example 8: Parallel works with individual timeouts
  // ==========================================================================
  console.log('\n=== Example 8: Parallel works with individual timeouts ===\n');

  const parallelTimeoutTree = Work.tree('parallelTimeout', { failFast: false })
    .addParallel([
      {
        name: 'slowApi',
        execute: async () => {
          console.log('  Slow API starting...');
          return await slowOperation(200);
        },
        timeout: 50,
      },
      {
        name: 'fastApi',
        execute: async () => {
          console.log('  Fast API starting...');
          return await slowOperation(20);
        },
        timeout: 100,
      },
      {
        name: 'mediumApi',
        execute: async () => {
          console.log('  Medium API starting...');
          return await slowOperation(60);
        },
        timeout: 100,
      },
    ])
    .addSerial({
      name: 'processResults',
      execute: async (ctx) => {
        const slowStatus = ctx.workResults.get('slowApi').status;
        const fastResult = ctx.workResults.get('fastApi').result;
        const mediumResult = ctx.workResults.get('mediumApi').result;
        return `slow: ${slowStatus}, fast: ${fastResult}, medium: ${mediumResult}`;
      },
    });

  const result8 = await parallelTimeoutTree.run({});
  console.log(`  Tree status: ${result8.status}`);
  console.log(`  Slow API status: ${result8.context.workResults.get('slowApi').status}`);
  console.log(`  Fast API result: ${result8.context.workResults.get('fastApi').result}`);
  console.log(`  Medium API result: ${result8.context.workResults.get('mediumApi').result}`);
  console.log(`  Process results: ${result8.context.workResults.get('processResults').result}`);

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n=== Summary ===');
  console.log(`
Timeout options:
  - Simple: timeout: 5000 (5 seconds)
  - With callback: timeout: { ms: 5000, onTimeout: (ctx) => {} }

Tree-level timeout:
  - Work.tree('name', { timeout: 60000 }) // 60 second timeout for entire tree

Timeout integrates with:
  - retry: Timeout errors trigger retries
  - silenceError: Continue tree on timeout
  - onError: Handle timeout errors manually

TimeoutError properties:
  - error.workName: Name of the work that timed out
  - error.timeoutMs: The timeout duration in milliseconds
  - error.message: Human-readable error message
`);
}

main().catch(console.error);
