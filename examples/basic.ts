/**
 * Basic workflow example - Simple serial execution
 */
import { Workflow, WorkflowStatus } from '@yigitahmetsahin/workflow-ts';

interface UserData {
  userId: string;
}

async function main() {
  const workflow = new Workflow<UserData>()
    .serial({
      name: 'fetchUser',
      execute: async (ctx) => {
        console.log(`Fetching user: ${ctx.data.userId}`);
        // Simulate API call
        await new Promise((r) => setTimeout(r, 100));
        return { id: ctx.data.userId, name: 'John Doe', email: 'john@example.com' };
      },
    })
    .serial({
      name: 'sendWelcomeEmail',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser');
        console.log(`Sending welcome email to: ${user?.email}`);
        await new Promise((r) => setTimeout(r, 50));
        return { sent: true, timestamp: new Date().toISOString() };
      },
    });

  const result = await workflow.run({ userId: 'user-123' });

  if (result.status === WorkflowStatus.COMPLETED) {
    console.log('\n✅ Workflow completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('Results:', {
      user: result.results.fetchUser,
      email: result.results.sendWelcomeEmail,
    });
  }
}

main().catch(console.error);
