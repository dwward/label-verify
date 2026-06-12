import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface Fixture {
  id: string;
  description?: string;
  applicationData?: any;
  expectedVerdicts: Record<string, string>;
  ttbId?: string;
  defectType?: string;
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
  // Check for --source argument
  const args = process.argv.slice(2);
  const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1];

  let fixturesPath: string;
  let isSampleData = false;
  let sampleDataDir = '';

  if (sourceArg) {
    fixturesPath = join(process.cwd(), sourceArg);
    isSampleData = sourceArg.includes('sample-data');
    if (isSampleData) {
      sampleDataDir = join(process.cwd(), 'sample-data', 'applications');
    }
  } else {
    fixturesPath = join(process.cwd(), 'test-labels', 'fixtures.json');
  }

  if (!existsSync(fixturesPath)) {
    console.error(`Error: Fixtures file not found: ${fixturesPath}`);
    process.exit(1);
  }

  const fixtures: Fixture[] = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

  console.log(`Running end-to-end evaluations (${isSampleData ? 'sample data' : 'test fixtures'})...\n`);
  console.log('Fixture ID          | Overall | Fields | Timing  | Result');
  console.log('--------------------+---------+--------+---------+--------');

  let passCount = 0;
  let failCount = 0;
  const failures: Array<{ id: string; reason: string }> = [];
  const defectTypeAccuracy: Record<string, { pass: number; fail: number }> = {};

  for (const fixture of fixtures) {
    let imagePath: string;
    let applicationData: any;
    let images: string[] = [];

    if (isSampleData) {
      // Sample data: load application.json and images from directory
      const appDir = join(sampleDataDir, fixture.id);
      const appJsonPath = join(appDir, 'application.json');

      if (!existsSync(appJsonPath)) {
        console.log(`${fixture.id.padEnd(19)} | ERROR   |        |         | ✗ FAIL (app not found)`);
        failCount++;
        continue;
      }

      const appData = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
      applicationData = appData.label;
      images = appData.images.map((img: any) => join(appDir, img.file));
    } else {
      // Test fixtures: single image
      imagePath = join(process.cwd(), 'test-labels', `${fixture.id}.png`);
      images = [imagePath];
      applicationData = fixture.applicationData;
    }

    try {
      // Create form data
      const formData = new FormData();

      // Append all images
      images.forEach((imgPath, idx) => {
        const key = idx === 0 ? 'image' : `image${idx}`;
        formData.append(key, readFileSync(imgPath), {
          filename: imgPath.split(/[/\\]/).pop() || 'image.png',
          contentType: 'image/png',
        });
      });

      formData.append('application', JSON.stringify(applicationData));

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

      // Check overall - compute expected if not provided
      let expectedOverall = fixture.expectedVerdicts.overall;
      if (!expectedOverall) {
        // Compute expected overall from individual field verdicts
        const fieldVerdicts = Object.values(fixture.expectedVerdicts);
        if (fieldVerdicts.includes('MISMATCH')) {
          expectedOverall = 'MISMATCH';
        } else if (fieldVerdicts.includes('NEEDS_REVIEW')) {
          expectedOverall = 'NEEDS_REVIEW';
        } else {
          expectedOverall = 'MATCH';
        }
      }

      const overallMatch = result.overall === expectedOverall;
      if (!overallMatch) {
        allMatch = false;
        mismatches.push(
          `Overall: expected ${expectedOverall}, got ${result.overall}`
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

      // Track defect type accuracy for sample data
      if (isSampleData && fixture.defectType) {
        const defectType = fixture.defectType;
        if (!defectTypeAccuracy[defectType]) {
          defectTypeAccuracy[defectType] = { pass: 0, fail: 0 };
        }
        if (passed) {
          defectTypeAccuracy[defectType].pass++;
        } else {
          defectTypeAccuracy[defectType].fail++;
        }
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

  // Print defect type accuracy table for sample data
  if (isSampleData && Object.keys(defectTypeAccuracy).length > 0) {
    console.log('Accuracy by Defect Type:\n');
    console.log('Defect Type         | Total | Pass | Fail | Accuracy');
    console.log('--------------------+-------+------+------+---------');

    for (const [defectType, stats] of Object.entries(defectTypeAccuracy).sort()) {
      const total = stats.pass + stats.fail;
      const accuracy = ((stats.pass / total) * 100).toFixed(1);
      console.log(
        `${defectType.padEnd(19)} | ${String(total).padStart(5)} | ${String(stats.pass).padStart(4)} | ${String(stats.fail).padStart(4)} | ${accuracy}%`
      );
    }

    const totalTests = Object.values(defectTypeAccuracy).reduce((sum, s) => sum + s.pass + s.fail, 0);
    const totalPass = Object.values(defectTypeAccuracy).reduce((sum, s) => sum + s.pass, 0);
    const overallAccuracy = ((totalPass / totalTests) * 100).toFixed(1);

    console.log('--------------------+-------+------+------+---------');
    console.log(`Overall             | ${String(totalTests).padStart(5)} | ${String(totalPass).padStart(4)} | ${String(totalTests - totalPass).padStart(4)} | ${overallAccuracy}%\n`);
  }

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
