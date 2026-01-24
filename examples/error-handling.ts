/**
 * Error handling workflow example
 */
import { Workflow, WorkflowStatus } from '../src';

interface PaymentData {
  amount: number;
  cardNumber: string;
}

async function main() {
  const workflow = new Workflow<PaymentData>()
    .serial({
      name: 'validateCard',
      execute: async (ctx) => {
        console.log('Validating card...');
        if (!ctx.data.cardNumber.startsWith('4')) {
          throw new Error('Only Visa cards (starting with 4) are accepted');
        }
        return { valid: true, type: 'visa' };
      },
      onError: async (error) => {
        console.error(`❌ Card validation failed: ${error.message}`);
        // Log to monitoring service, send alert, etc.
      },
    })
    .serial({
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
      },
    })
    .serial({
      name: 'sendReceipt',
      execute: async (ctx) => {
        const payment = ctx.workResults.get('processPayment').result;
        console.log(`Sending receipt for transaction: ${payment?.transactionId}`);
        return { receiptSent: true };
      },
    });

  // Test with valid card
  console.log('=== Test 1: Valid Visa card ===\n');
  let result = await workflow.run({ amount: 99.99, cardNumber: '4111111111111111' });

  if (result.status === WorkflowStatus.Completed) {
    console.log('\n✅ Payment successful!');
    console.log('Transaction:', result.context.workResults.get('processPayment').result);
  } else {
    console.log('\n❌ Payment failed:', result.error?.message);
  }

  // Test with invalid card
  console.log('\n=== Test 2: Invalid card (MasterCard) ===\n');
  result = await workflow.run({ amount: 49.99, cardNumber: '5111111111111111' });

  if (result.status === WorkflowStatus.Completed) {
    console.log('\n✅ Payment successful!');
  } else {
    console.log('\n❌ Workflow failed:', result.error?.message);
  }
}

main().catch(console.error);
