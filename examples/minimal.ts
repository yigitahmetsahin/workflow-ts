/**
 * Minimal example - The simplest possible Work.tree() usage
 */
import { Work, WorkStatus } from '../src';

async function main() {
  // Build and run a simple 2-step tree
  const result = await Work.tree('greeting')
    .addSerial({
      name: 'getName',
      execute: async () => 'World',
    })
    .addSerial({
      name: 'greet',
      execute: async (ctx) => {
        const name = ctx.workResults.get('getName').result;
        return `Hello, ${name}!`;
      },
    })
    .run({});

  // Check result
  if (result.status === WorkStatus.Completed) {
    console.log(result.context.workResults.get('greet').result);
    // Output: Hello, World!
  }
}

main().catch(console.error);
