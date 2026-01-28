/**
 * Retry mechanism example with Work.tree()
 *
 * Demonstrates various retry patterns:
 * - Simple retry count
 * - Retry with delay
 * - Exponential backoff
 * - Conditional retry (shouldRetry)
 * - Retry hooks (onRetry)
 */
import { Work } from '../src';

async function main() {
  // ==========================================================================
  // Example 1: Simple retry count
  // ==========================================================================
  console.log('=== Example 1: Simple retry count ===\n');

  let attempt1 = 0;
  const simpleRetryTree = Work.tree('simpleRetry').addSerial({
    name: 'unreliableApi',
    execute: async () => {
      attempt1++;
      console.log(`  Attempt ${attempt1}...`);
      if (attempt1 < 3) {
        throw new Error('Connection timeout');
      }
      return { data: 'Success!' };
    },
    retry: 3, // Retry up to 3 times
  });

  const result1 = await simpleRetryTree.run({});
  console.log(`  Status: ${result1.status}`);
  console.log(`  Attempts: ${result1.context.workResults.get('unreliableApi').attempts}`);
  console.log(
    `  Result: ${JSON.stringify(result1.context.workResults.get('unreliableApi').result)}`
  );

  // ==========================================================================
  // Example 2: Retry with fixed delay
  // ==========================================================================
  console.log('\n=== Example 2: Retry with fixed delay (100ms) ===\n');

  let attempt2 = 0;
  const delayRetryTree = Work.tree('delayRetry').addSerial({
    name: 'rateLimitedApi',
    execute: async () => {
      attempt2++;
      const time = new Date().toISOString().split('T')[1];
      console.log(`  [${time}] Attempt ${attempt2}...`);
      if (attempt2 < 3) {
        throw new Error('Rate limited');
      }
      return 'OK';
    },
    retry: {
      maxRetries: 3,
      delay: 100, // 100ms between retries
    },
  });

  const result2 = await delayRetryTree.run({});
  console.log(`  Status: ${result2.status}`);

  // ==========================================================================
  // Example 3: Exponential backoff
  // ==========================================================================
  console.log('\n=== Example 3: Exponential backoff (50ms, 100ms, 200ms...) ===\n');

  let attempt3 = 0;
  const startTime = Date.now();
  const exponentialTree = Work.tree('exponentialRetry').addSerial({
    name: 'busyService',
    execute: async () => {
      attempt3++;
      const elapsed = Date.now() - startTime;
      console.log(`  [+${elapsed}ms] Attempt ${attempt3}...`);
      if (attempt3 < 4) {
        throw new Error('Service busy');
      }
      return 'Done';
    },
    retry: {
      maxRetries: 4,
      delay: 50,
      backoff: 'exponential',
      backoffMultiplier: 2,
      maxDelay: 500, // Cap delay at 500ms
    },
  });

  const result3 = await exponentialTree.run({});
  console.log(`  Total duration: ${result3.totalDuration}ms`);

  // ==========================================================================
  // Example 4: Conditional retry with shouldRetry
  // ==========================================================================
  console.log('\n=== Example 4: Conditional retry (only for transient errors) ===\n');

  let attempt4 = 0;
  const conditionalTree = Work.tree('conditionalRetry').addSerial({
    name: 'apiCall',
    execute: async () => {
      attempt4++;
      console.log(`  Attempt ${attempt4}...`);

      // Simulate different error types
      if (attempt4 === 1) {
        throw new Error('NETWORK_TIMEOUT');
      }
      if (attempt4 === 2) {
        throw new Error('AUTH_FAILED'); // Non-retryable
      }
      return 'Success';
    },
    retry: {
      maxRetries: 5,
      shouldRetry: (error, _attempt) => {
        // Only retry network errors, not auth errors
        const isRetryable = !error.message.includes('AUTH');
        console.log(`    shouldRetry: ${error.message} -> ${isRetryable}`);
        return isRetryable;
      },
    },
  });

  const result4 = await conditionalTree.run({});
  console.log(`  Status: ${result4.status}`);
  console.log(`  Stopped at attempt: ${result4.context.workResults.get('apiCall').attempts}`);
  console.log(`  Error: ${result4.error?.message}`);

  // ==========================================================================
  // Example 5: Using onRetry hook for logging/metrics
  // ==========================================================================
  console.log('\n=== Example 5: onRetry hook for logging ===\n');

  let attempt5 = 0;
  const hookTree = Work.tree('hookRetry').addSerial({
    name: 'monitoredApi',
    execute: async () => {
      attempt5++;
      if (attempt5 < 3) {
        throw new Error(`Error on attempt ${attempt5}`);
      }
      return 'Success';
    },
    retry: {
      maxRetries: 3,
      delay: 50,
      onRetry: async (error, attempt, ctx) => {
        // In real code, you might log to a monitoring service
        console.log(`  [onRetry] Retry #${attempt + 1} after error: ${error.message}`);
        console.log(`    Context data: ${JSON.stringify(ctx.data)}`);
      },
    },
  });

  await hookTree.run({ requestId: 'req-123' });
  console.log('  Completed successfully after retries');

  // ==========================================================================
  // Example 6: Combining retry with silenceError
  // ==========================================================================
  console.log('\n=== Example 6: Retry + silenceError (non-critical work) ===\n');

  const combinedTree = Work.tree('combinedRetry')
    .addSerial({
      name: 'criticalWork',
      execute: async () => {
        console.log('  Critical work succeeded');
        return 'critical-data';
      },
    })
    .addSerial({
      name: 'nonCriticalMetrics',
      execute: async () => {
        throw new Error('Metrics service down');
      },
      retry: 2, // Try a few times
      silenceError: true, // But don't fail the tree if it keeps failing
    })
    .addSerial({
      name: 'finalWork',
      execute: async () => {
        console.log('  Final work continues despite metrics failure');
        return 'completed';
      },
    });

  const result6 = await combinedTree.run({});
  console.log(`  Tree status: ${result6.status}`);
  console.log(
    `  Metrics attempts: ${result6.context.workResults.get('nonCriticalMetrics').attempts}`
  );
  console.log(`  Metrics status: ${result6.context.workResults.get('nonCriticalMetrics').status}`);
  console.log(`  Final result: ${result6.context.workResults.get('finalWork').result}`);
}

main().catch(console.error);
