/**
 * Basic example - Simple serial execution with Work.tree()
 */
import { Work, WorkStatus } from '../src';

async function main() {
  const tree = Work.tree('userOnboarding')
    .addSerial({
      name: 'fetchUser',
      execute: async (ctx) => {
        console.log(`Fetching user: ${ctx.data.userId}`);
        // Simulate API call
        await new Promise((r) => setTimeout(r, 100));
        return { id: ctx.data.userId, name: 'John Doe', email: 'john@example.com' };
      },
    })
    .addSerial({
      name: 'sendWelcomeEmail',
      execute: async (ctx) => {
        const user = ctx.workResults.get('fetchUser').result;
        console.log(`Sending welcome email to: ${user?.email}`);
        await new Promise((r) => setTimeout(r, 50));
        return { sent: true, timestamp: new Date().toISOString() };
      },
    });

  const result = await tree.run({ userId: 'user-123' });

  if (result.status === WorkStatus.Completed) {
    console.log('\n✅ Tree completed!');
    console.log(`Total duration: ${result.totalDuration}ms`);
    console.log('Results:', {
      user: result.context.workResults.get('fetchUser').result,
      email: result.context.workResults.get('sendWelcomeEmail').result,
    });
  }
}

main().catch(console.error);
