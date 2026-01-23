/**
 * Sealed workflow example - Prevent modifications after construction
 */
import { Workflow, WorkflowStatus } from '../src';

interface UserData {
  userId: string;
}

/**
 * Factory function that returns a sealed workflow.
 * Consumers can only execute it, not modify it.
 * TypeScript infers the return type from the workflow definition.
 */
function createUserWorkflow() {
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
    .seal(); // Seal the workflow - no more modifications allowed
}

async function main() {
  console.log('=== Sealed Workflow Example ===\n');

  // Create a sealed workflow from the factory
  const userWorkflow = createUserWorkflow();

  // TypeScript prevents modifications:
  // userWorkflow.serial(...) // ❌ Error: Property 'serial' does not exist
  // userWorkflow.parallel(...) // ❌ Error: Property 'parallel' does not exist

  // Only run() is available
  console.log('Running sealed workflow...\n');
  const result = await userWorkflow.run({ userId: 'user-123' });

  if (result.status === WorkflowStatus.COMPLETED) {
    console.log('\n✅ Workflow completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('User:', result.context.workResults.get('fetchUser').result);
  }

  // The same sealed workflow can be reused
  console.log('\n--- Running again with different data ---\n');
  const result2 = await userWorkflow.run({ userId: 'user-456' });

  if (result2.status === WorkflowStatus.COMPLETED) {
    console.log('\n✅ Second run completed!');
    console.log('User:', result2.context.workResults.get('fetchUser').result);
  }
}

main().catch(console.error);
