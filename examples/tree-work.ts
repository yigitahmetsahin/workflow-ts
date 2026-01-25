/**
 * Tree Work Example - 4 Level Nested Tree
 *
 * Demonstrates deeply nested tree structures with full type inference.
 * All inner work results are accessible at any level with autocomplete.
 *
 * Structure:
 * ```
 * lv1Tree (root)
 * ├── [parallel]
 * │   ├── lv2TreeA
 * │   │   └── [serial] lv3TreeA
 * │   │       ├── [serial] lv4Step1 → { value: 'lv4-1' }
 * │   │       └── [serial] lv4Step2 → { value: 'lv4-2' }
 * │   └── lv2TreeB
 * │       └── [serial] lv3TreeB
 * │           └── [parallel]
 * │               ├── lv4Step3 → { value: 'lv4-3' }
 * │               └── lv4Step4 → { value: 'lv4-4' }
 * └── [serial] aggregate (accesses all lv4 steps with type inference)
 * ```
 */

import { Work } from '../src';

async function main() {
  console.log('=== 4 Level Nested Tree Example ===\n');

  // Level 4: Innermost leaf works (inside lv3TreeA)
  // These are the deepest works in branch A

  // Level 3: Contains level 4 works (serial)
  const lv3TreeA = Work.tree('lv3TreeA')
    .addSerial({
      name: 'lv4Step1',
      execute: async () => {
        console.log('  Executing lv4Step1');
        return { value: 'lv4-1' };
      },
    })
    .addSerial({
      name: 'lv4Step2',
      execute: async (ctx) => {
        // ✅ Can access sibling lv4Step1 with autocomplete
        const prev = ctx.workResults.get('lv4Step1').result;
        console.log('  Executing lv4Step2, prev:', prev);
        return { value: 'lv4-2' };
      },
    });

  // Level 3: Contains level 4 works (parallel)
  const lv3TreeB = Work.tree('lv3TreeB').addParallel([
    {
      name: 'lv4Step3',
      execute: async () => {
        console.log('  Executing lv4Step3');
        return { value: 'lv4-3' };
      },
    },
    {
      name: 'lv4Step4',
      execute: async () => {
        console.log('  Executing lv4Step4');
        return { value: 'lv4-4' };
      },
    },
  ]);

  // Level 2: Contains level 3 tree (branch A)
  const lv2TreeA = Work.tree('lv2TreeA').addSerial(lv3TreeA);

  // Level 2: Contains level 3 tree (branch B)
  const lv2TreeB = Work.tree('lv2TreeB').addSerial(lv3TreeB);

  // Level 1: Root tree containing level 2 trees + aggregate step
  const lv1Tree = Work.tree('lv1Tree')
    .addParallel([lv2TreeA, lv2TreeB])
    .seal({
      name: 'aggregate',
      execute: async (ctx) => {
        // ✅ All level 4 works are accessible with full type inference!
        const step1 = ctx.workResults.get('lv4Step1').result;
        const step2 = ctx.workResults.get('lv4Step2').result;
        const step3 = ctx.workResults.get('lv4Step3').result;
        const step4 = ctx.workResults.get('lv4Step4').result;

        // ✅ Intermediate tree results also accessible
        const lv3A = ctx.workResults.get('lv3TreeA');
        const lv3B = ctx.workResults.get('lv3TreeB');
        const lv2A = ctx.workResults.get('lv2TreeA');
        const lv2B = ctx.workResults.get('lv2TreeB');

        console.log('\n  Aggregate - all lv4 results:');
        console.log('    lv4Step1:', step1);
        console.log('    lv4Step2:', step2);
        console.log('    lv4Step3:', step3);
        console.log('    lv4Step4:', step4);

        return {
          allValues: [step1?.value, step2?.value, step3?.value, step4?.value],
          treeStatuses: {
            lv3TreeA: lv3A.status,
            lv3TreeB: lv3B.status,
            lv2TreeA: lv2A.status,
            lv2TreeB: lv2B.status,
          },
        };
      },
    });

  // Run the tree directly
  const result = await lv1Tree.run({ userId: '123' });

  console.log('\n=== Final Results ===');
  console.log('Tree status:', result.status);
  console.log('Aggregate result:', result.workResults.get('aggregate')?.result);
  console.log('\nAll work results:');
  result.workResults.forEach((workResult: { status: string; parent?: string }, name: string) => {
    console.log(`  ${name}: ${workResult.status} (parent: ${workResult.parent ?? 'none'})`);
  });
}

main().catch(console.error);
