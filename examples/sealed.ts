/**
 * Sealed workflow example - Prevent modifications after construction
 */
import { Workflow, ISealedWorkflow } from '../src';

interface UserData {
  userId: string;
}

type UserWorkResults = {
  validate: boolean;
  fetchUser: { id: string; name: string; email: string };
};

/**
 * Factory function that returns a sealed workflow.
 * Once sealed, the workflow cannot be modified.
 */
function buildUserWorkflow(): ISealedWorkflow<UserData, UserWorkResults> {
  return new Workflow<UserData>()
    .serial({
      name: 'validate',
      execute: async (ctx) => {
        console.log(`Validating user ID: ${ctx.data.userId}`);
        return ctx.data.userId.length > 0;
      },
    })
    .serial({
      name: 'fetchUser',
      execute: async (ctx) => {
        const isValid = ctx.workResults.get('validate').result;
        if (!isValid) {
          throw new Error('Invalid user ID');
        }
        console.log(`Fetching user: ${ctx.data.userId}`);
        await new Promise((r) => setTimeout(r, 100));
        return { id: ctx.data.userId, name: 'John Doe', email: 'john@example.com' };
      },
    })
    .seal();
}

async function main() {
  console.log('=== Sealed Workflow Example ===\n');

  // Create a sealed workflow from the factory
  const userWorkflow = buildUserWorkflow();

  // Sealed workflow has name, works, options, isSealed(), and run()
  console.log(`Name: ${userWorkflow.name}`); // 'seal'
  console.log(`Works: ${userWorkflow.works.length} work groups`);
  console.log(`Options: failFast=${userWorkflow.options.failFast}`);
  console.log(`Is sealed: ${userWorkflow.isSealed()}`); // true

  // TypeScript prevents modifications:
  // userWorkflow.serial(...) // ❌ Error: Property 'serial' does not exist
  // userWorkflow.parallel(...) // ❌ Error: Property 'parallel' does not exist

  // Use run() to execute the sealed workflow
  console.log('\nRunning sealed workflow...\n');
  const result = await userWorkflow.run({ userId: 'user-123' });

  if (result.status === 'completed') {
    console.log('\n✅ Workflow completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('User:', result.context.workResults.get('fetchUser').result);
  }

  // Run again with different data
  console.log('\n--- Second Run ---\n');
  const result2 = await userWorkflow.run({ userId: 'user-456' });

  if (result2.status === 'completed') {
    console.log('✅ Second run completed!');
    console.log('User:', result2.context.workResults.get('fetchUser').result);
  }
}

main().catch(console.error);
