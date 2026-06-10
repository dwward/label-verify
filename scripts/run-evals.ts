import { readFileSync } from 'fs';
import { join } from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface Fixture {
  id: string;
  description: string;
  applicationData: any;
  expectedVerdicts: Record<string, string>;
}

interface VerificationResult {
  verdicts: Array<{
    field: string;
    status: string;
    explanation: string;
  }>;
  overall: string;
  processingMs: number;
}

async function runEvaluations() {
  const fixturesPath = join(process.cwd(), 'test-labels', 'fixtures.json');
  const fixtures: Fixture[] = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

  console.log('Running end-to-end evaluations...\n');
  console.log('Fixture ID          | Overall | Fields | Timing  | Result');
  console.log('--------------------+---------+--------+---------+--------');

  let passCount = 0;
  let failCount = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const fixture of fixtures) {
    const imagePath = join(process.cwd(), 'test-labels', `${fixture.id}.png`);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('image', readFileSync(imagePath), {
        filename: `${fixture.id}.png`,
        contentType: 'image/png',
      });
      formData.append('application', JSON.stringify(fixture.applicationData));

      // POST to /api/verify
      const response = await fetch('http://localhost:3000/api/verify', {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders() as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result: VerificationResult = await response.json();

      // Compare verdicts
      let allMatch = true;
      const fieldResults: string[] = [];
      const mismatches: string[] = [];

      for (const verdict of result.verdicts) {
        const expected = fixture.expectedVerdicts[verdict.field];
        const match = verdict.status === expected;
        if (!match) {
          allMatch = false;
          mismatches.push(
            `${verdict.field}: expected ${expected}, got ${verdict.status}`
          );
        }
        fieldResults.push(match ? '✓' : '✗');
      }

      // Check overall
      const overallMatch = result.overall === fixture.expectedVerdicts.overall;
      if (!overallMatch) {
        allMatch = false;
        mismatches.push(
          `Overall: expected ${fixture.expectedVerdicts.overall}, got ${result.overall}`
        );
      }

      const passed = allMatch && overallMatch;
      if (passed) {
        passCount++;
      } else {
        failCount++;
        failures.push({
          id: fixture.id,
          reason: mismatches.join('; '),
        });
      }

      const overallStatus = overallMatch
        ? '✓'
        : `✗ (${result.overall})`;
      const fieldStatus = fieldResults.join('');
      const timing = `${result.processingMs}ms`;
      const resultIcon = passed ? '✓ PASS' : '✗ FAIL';

      console.log(
        `${fixture.id.padEnd(19)} | ${overallStatus.padEnd(7)} | ${fieldStatus.padEnd(6)} | ${timing.padEnd(7)} | ${resultIcon}`
      );
    } catch (error: any) {
      failCount++;
      const errorMsg = error.message || String(error);
      failures.push({
        id: fixture.id,
        reason: errorMsg,
      });
      console.log(
        `${fixture.id.padEnd(19)} | ERROR   |        |         | ✗ FAIL`
      );
    }
  }

  console.log('--------------------+---------+--------+---------+--------');
  console.log(`Results: ${passCount} passed, ${failCount} failed\n`);

  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => {
      console.log(`  - ${f.id}: ${f.reason}`);
    });
    console.log('');
  }

  if (failCount > 0) {
    process.exit(1);
  }
}

// Check if dev server is running
fetch('http://localhost:3000')
  .then(() => runEvaluations())
  .catch(() => {
    console.error('Error: Next.js dev server not running on http://localhost:3000');
    console.error('Start the server with: npm run dev');
    process.exit(1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
