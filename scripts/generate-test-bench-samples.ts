/**
 * Generate Test Bench Sample Images
 * Creates 4 sample cases with front/back panels for the Test Bench dropdown
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SAMPLES = [
  {
    id: 'clean-match',
    config: {
      brandName: 'OLD TOM DISTILLERY',
      classType: 'Kentucky Straight Bourbon Whiskey',
      alcoholContent: '45% Alc./Vol.',
      netContents: '750 mL',
      warningHeaderCaps: 'true',
      warningHeaderBold: 'true'
    }
  },
  {
    id: 'abv-mismatch',
    config: {
      brandName: 'EAGLE PEAK DISTILLERY',
      classType: 'Tennessee Whiskey',
      alcoholContent: '50% Alc./Vol.', // Mismatch: app says 45%
      netContents: '750 mL',
      warningHeaderCaps: 'true',
      warningHeaderBold: 'true'
    }
  },
  {
    id: 'warning-titlecase',
    config: {
      brandName: 'RIVER VALLEY SPIRITS',
      classType: 'Straight Rye Whiskey',
      alcoholContent: '43% Alc./Vol.',
      netContents: '750 mL',
      warningHeaderCaps: 'false', // Defect: title case
      warningHeaderBold: 'true'
    }
  },
  {
    id: 'multi-image-back-warning',
    config: {
      brandName: 'MOUNTAIN HERITAGE DISTILLERY',
      classType: 'American Whiskey',
      alcoholContent: '40% Alc./Vol.',
      netContents: '1 L',
      warningHeaderCaps: 'true',
      warningHeaderBold: 'true'
    }
  }
];

async function generateSamples() {
  const outputDir = join(process.cwd(), 'public', 'samples');
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 1
  });

  const templatePath = join(process.cwd(), 'test-labels', 'template-multi-panel.html');

  console.log('🖼️  Generating Test Bench sample images...\n');

  for (const sample of SAMPLES) {
    console.log(`Generating ${sample.id}...`);

    // Front panel (no warning)
    const frontPage = await context.newPage();
    const frontParams = new URLSearchParams({
      panel: 'front',
      showWarning: 'false',
      ...sample.config
    });

    const frontUrl = `file:///${templatePath.replace(/\\/g, '/')}?${frontParams}`;
    await frontPage.goto(frontUrl);
    await frontPage.waitForTimeout(500);
    await frontPage.screenshot({
      path: join(outputDir, `${sample.id}-front.png`),
      type: 'png'
    });
    await frontPage.close();

    console.log(`  ✓ ${sample.id}-front.png`);

    // Back panel (with warning)
    const backPage = await context.newPage();
    const backParams = new URLSearchParams({
      panel: 'back',
      showWarning: 'true',
      ...sample.config
    });

    const backUrl = `file:///${templatePath.replace(/\\/g, '/')}?${backParams}`;
    await backPage.goto(backUrl);
    await backPage.waitForTimeout(500);
    await backPage.screenshot({
      path: join(outputDir, `${sample.id}-back.png`),
      type: 'png'
    });
    await backPage.close();

    console.log(`  ✓ ${sample.id}-back.png`);
  }

  await browser.close();
  console.log(`\n✅ Generated ${SAMPLES.length * 2} sample images in public/samples/`);
}

generateSamples().catch((error) => {
  console.error('Error generating samples:', error);
  process.exit(1);
});
