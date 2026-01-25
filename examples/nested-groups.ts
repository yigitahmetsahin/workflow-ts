/**
 * Nested Groups Example - Tree-like workflows with serial/parallel nesting
 *
 * This example demonstrates how to create complex workflow structures where
 * groups of works can be nested inside parallel executions, enabling patterns like:
 * - Fallback chains (try primary, then fallback)
 * - Parallel data fetching with sequential validation
 * - Complex dependency graphs
 *
 * TYPE INFERENCE: Full type inference is supported for up to 5 levels of nesting.
 * All work names and their result types are automatically inferred - no type casts needed!
 */
import { Workflow, WorkStatus } from '../src';

interface UserData {
  userId: string;
}

async function main() {
  console.log('=== Nested Groups Example ===\n');

  // Example 1: Fallback Pattern
  // Try to collect address from primary source, fall back to alternative if it fails
  console.log('--- Example 1: Fallback Pattern ---\n');

  const fallbackWorkflow = new Workflow<UserData>()
    .parallel([
      {
        name: 'addressCollection',
        serial: [
          // This is a serial group inside parallel - demonstrating nesting
          {
            name: 'collectAddressPrimary',
            execute: async () => {
              console.log('Attempting primary address service...');
              await new Promise((r) => setTimeout(r, 50));
              // Simulate failure
              throw new Error('Primary service unavailable');
            },
            silenceError: true, // Don't fail the workflow
          },
          {
            name: 'collectAddressFallback',
            shouldRun: (ctx) => {
              // Only run if primary failed
              // Note: For sibling works, use has() then access via underlying Map
              // (siblings aren't known at compile time)
              if (ctx.workResults.has('collectAddressPrimary')) {
                const primaryResult = (
                  ctx.workResults as unknown as Map<string, { status: WorkStatus }>
                ).get('collectAddressPrimary');
                return primaryResult?.status === WorkStatus.Failed;
              }
              return false;
            },
            execute: async () => {
              console.log('Using fallback address service...');
              await new Promise((r) => setTimeout(r, 50));
              return { street: '123 Fallback St', city: 'Default City' };
            },
          },
        ],
      },
      {
        name: 'collectHistory',
        execute: async () => {
          console.log('Fetching address history (in parallel)...');
          await new Promise((r) => setTimeout(r, 100));
          return [{ year: 2023, address: 'Old Address' }];
        },
      },
    ])
    .serial({
      name: 'collectAddress',
      execute: async (ctx) => {
        // Type inference works for nested works up to 5 levels!
        // No type casts needed:
        const fallbackResult = ctx.workResults.get('collectAddressFallback').result;
        const historyResult = ctx.workResults.get('collectHistory').result;

        console.log('Collecting address, fallback was:', fallbackResult);
        console.log('History:', historyResult);
        await new Promise((r) => setTimeout(r, 100));
        return fallbackResult ?? { street: '123 Main St', city: 'New York' };
      },
    });

  const result1 = await fallbackWorkflow.run({ userId: 'user-1' });

  // Type inference works for all nested works (up to 5 levels)!
  // No type casts needed:
  console.log('\nResults:');
  console.log('  Primary status:', result1.context.workResults.get('collectAddressPrimary').status);
  console.log(
    '  Fallback result:',
    result1.context.workResults.get('collectAddressFallback').result
  );
  console.log('  History:', result1.context.workResults.get('collectHistory').result);
  console.log(
    '  Address group result:',
    result1.context.workResults.get('addressCollection').result
  );

  // Check parent references - nested works have parent set to their group name
  console.log('\nParent references:');
  console.log(
    '  collectAddressPrimary.parent:',
    result1.context.workResults.get('collectAddressPrimary').parent
  );
  console.log(
    '  collectAddressFallback.parent:',
    result1.context.workResults.get('collectAddressFallback').parent
  );
  console.log('  collectHistory.parent:', result1.context.workResults.get('collectHistory').parent);

  // Example 2: Nested Parallel in Serial
  console.log('\n\n--- Example 2: Complex Nesting ---\n');

  const complexWorkflow = new Workflow<UserData>()
    .serial({
      name: 'authenticate',
      execute: async (ctx) => {
        console.log('Authenticating user:', ctx.data.userId);
        await new Promise((r) => setTimeout(r, 30));
        return { authenticated: true };
      },
    })
    .parallel([
      {
        name: 'dataFetch',
        parallel: [
          {
            name: 'fetchProfile',
            execute: async () => {
              console.log('Fetching profile...');
              await new Promise((r) => setTimeout(r, 80));
              return { name: 'John Doe', email: 'john@example.com' };
            },
          },
          {
            name: 'fetchOrders',
            execute: async () => {
              console.log('Fetching orders...');
              await new Promise((r) => setTimeout(r, 100));
              return [{ id: 'ord-1', total: 99.99 }];
            },
          },
        ],
      },
      {
        name: 'configChain',
        serial: [
          {
            name: 'loadConfig',
            execute: async () => {
              console.log('Loading config...');
              await new Promise((r) => setTimeout(r, 40));
              return { theme: 'dark', locale: 'en' };
            },
          },
          {
            name: 'applyConfig',
            execute: async (ctx) => {
              // For sibling works in the same group, access via underlying Map
              // (siblings aren't known at compile time)
              type ConfigType = { theme: string; locale: string };
              const configResult = (
                ctx.workResults as unknown as Map<string, { result?: ConfigType }>
              ).get('loadConfig');
              const config = configResult?.result;
              console.log('Applying config:', config);
              await new Promise((r) => setTimeout(r, 20));
              return { applied: true, ...config };
            },
          },
        ],
      },
    ])
    .serial({
      name: 'buildDashboard',
      execute: async (ctx) => {
        // Type inference works for all nested works (up to 5 levels)!
        // No type casts needed:
        const profile = ctx.workResults.get('fetchProfile').result;
        const orders = ctx.workResults.get('fetchOrders').result;
        const config = ctx.workResults.get('applyConfig').result;

        console.log('\nBuilding dashboard with all data...');

        return {
          user: profile,
          orderCount: orders?.length ?? 0,
          config,
        };
      },
    });

  const result2 = await complexWorkflow.run({ userId: 'user-123' });

  console.log('\nFinal dashboard:', result2.context.workResults.get('buildDashboard').result);
  console.log('Total duration:', result2.totalDuration, 'ms');

  // Show the tree structure via parent references
  console.log('\nWork tree structure (via parent references):');
  result2.workResults.forEach((workResult, name) => {
    const indent = workResult.parent ? '    ' : '  ';
    const parentInfo = workResult.parent ? ` (parent: ${workResult.parent})` : '';
    console.log(`${indent}${String(name)}: ${workResult.status}${parentInfo}`);
  });
}

main().catch(console.error);
