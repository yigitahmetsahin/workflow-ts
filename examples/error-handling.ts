/**
 * Error handling example with Work.tree()
 */
import { Work, WorkStatus } from '../src';

async function main() {
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
}

main().catch(console.error);
