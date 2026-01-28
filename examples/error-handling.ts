/**
 * Error handling example with Work.tree()
 *
 * Demonstrates:
 * - Using onError callbacks
 * - Error propagation vs swallowing
 * - WorkTreeError base class for catching all library errors
 */
import { Work, WorkStatus, WorkTreeError, TimeoutError } from '../src';

async function main() {
  // ==========================================================================
  // Example 1: Basic error handling with onError
  // ==========================================================================
  console.log('=== Example 1: Basic error handling ===\n');

  const tree = Work.tree('paymentProcessing')
    .addSerial({
      name: 'validateCard',
      execute: async (ctx) => {
        console.log('Validating card...');
        const cardNumber = String(ctx.data.cardNumber);
        if (!cardNumber.startsWith('4')) {
          throw new Error('Only Visa cards (starting with 4) are accepted');
        }
        return { valid: true, type: 'visa' };
      },
      onError: async (error) => {
        console.error(`❌ Card validation failed: ${error.message}`);
        // Log to monitoring service, send alert, etc.
        // Re-throw to stop execution
        throw error;
      },
    })
    .addSerial({
      name: 'processPayment',
      execute: async (ctx) => {
        console.log(`Processing payment of $${ctx.data.amount}...`);
        await new Promise((r) => setTimeout(r, 100));

        // Simulate random failure
        if (Math.random() < 0.3) {
          throw new Error('Payment gateway timeout');
        }

        return { transactionId: 'TXN-' + Date.now(), status: 'completed' };
      },
      onError: async (error) => {
        console.error(`❌ Payment failed: ${error.message}`);
        console.log('  → Would retry or notify support here');
        throw error;
      },
    })
    .addSerial({
      name: 'sendReceipt',
      execute: async (ctx) => {
        const payment = ctx.workResults.get('processPayment').result;
        console.log(`Sending receipt for transaction: ${payment?.transactionId}`);
        return { receiptSent: true };
      },
    });

  // Test with valid card
  console.log('=== Test 1: Valid Visa card ===\n');
  let result = await tree.run({ amount: 99.99, cardNumber: '4111111111111111' });

  if (result.status === WorkStatus.Completed) {
    console.log('\n✅ Payment successful!');
    console.log('Transaction:', result.context.workResults.get('processPayment').result);
  } else {
    console.log('\n❌ Payment failed:', result.error?.message);
  }

  // Test with invalid card
  console.log('\n=== Test 2: Invalid card (MasterCard) ===\n');
  result = await tree.run({ amount: 49.99, cardNumber: '5111111111111111' });

  if (result.status === WorkStatus.Completed) {
    console.log('\n✅ Payment successful!');
  } else {
    console.log('\n❌ Tree failed:', result.error?.message);
  }

  // ==========================================================================
  // Example 2: Using WorkTreeError base class
  // ==========================================================================
  console.log('\n=== Example 3: WorkTreeError base class ===\n');

  const timeoutTree = Work.tree('withTimeout').addSerial({
    name: 'slowOperation',
    execute: async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 'done';
    },
    timeout: 50, // Will timeout
  });

  const timeoutResult = await timeoutTree.run({});

  if (timeoutResult.status === WorkStatus.Failed && timeoutResult.error) {
    const error = timeoutResult.error;

    // Check for specific error type
    if (error instanceof TimeoutError) {
      console.log('⏱️ Timeout error detected!');
      console.log(`   Work: ${error.workName}`);
      console.log(`   Timeout: ${error.timeoutMs}ms`);
    }

    // Or catch any work-tree error
    if (error instanceof WorkTreeError) {
      console.log('\n📦 This is a WorkTreeError (base class)');
      console.log(`   Name: ${error.name}`);
      console.log(`   Message: ${error.message}`);
    }
  }
}

main().catch(console.error);
