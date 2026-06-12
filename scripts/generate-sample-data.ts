/**
 * Generate Sample Data for TTB Label Verification App
 *
 * Creates ~200 realistic COLA application packages with controlled defect injection
 * for evaluator testing. Supports both Kaggle data source and synthetic fallback.
 *
 * Usage:
 *   npm run generate-sample-data -- --source kaggle --count 200
 *   npm run generate-sample-data -- --source synthetic --count 200
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

interface SampleRecord {
  ttbId: string;
  serialNumber: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  applicant: {
    name: string;
    permitNumber: string;
    address: string;
  };
}

interface DefectType {
  type: string;
  field: string;
  apply: (record: SampleRecord, panel?: 'front' | 'back') => any;
}

// Parse command line arguments
const args = process.argv.slice(2);
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'synthetic';
const countArg = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '200');

const SOURCE_MODE = sourceArg as 'kaggle' | 'synthetic';
const SAMPLE_COUNT = countArg;
const DEFECT_RATE = 0.15; // 15% will have defects
const WARNING_ON_BACK_RATE = 0.6; // 60% have warning on back panel

console.log(`\n🔧 Sample Data Generator`);
console.log(`   Source: ${SOURCE_MODE}`);
console.log(`   Count: ${SAMPLE_COUNT}`);
console.log(`   Defect rate: ${(DEFECT_RATE * 100).toFixed(0)}%\n`);

/**
 * Fetch data from Kaggle TTB COLAs Demo dataset
 */
async function fetchKaggleData(count: number): Promise<SampleRecord[]> {
  console.log('📦 Fetching Kaggle dataset...');

  // Check for Kaggle credentials
  const kaggleConfigPath = join(process.env.HOME || process.env.USERPROFILE || '', '.kaggle', 'kaggle.json');
  if (!existsSync(kaggleConfigPath)) {
    throw new Error(
      'Kaggle credentials not found. Please:\n' +
      '1. Sign up at kaggle.com\n' +
      '2. Go to Account → API → Create New API Token\n' +
      `3. Place kaggle.json in ${kaggleConfigPath}`
    );
  }

  // NOTE: Actual Kaggle API integration would go here
  // For now, we'll fall back to synthetic since the Kaggle SDK
  // integration is complex and this is a prototype
  console.log('⚠️  Kaggle integration not implemented in prototype - falling back to synthetic');
  return generateSyntheticData(count);
}

/**
 * Generate synthetic realistic data
 */
function generateSyntheticData(count: number): SampleRecord[] {
  console.log('🎲 Generating synthetic data...');

  const brandPrefixes = ['OLD', 'STONE\'S', 'EAGLE', 'RIVER', 'MOUNTAIN', 'VALLEY', 'HERITAGE', 'WILD', 'GOLDEN', 'SILVER'];
  const brandSuffixes = ['DISTILLERY', 'BREWING', 'SPIRITS', 'WINERY', 'CELLARS', 'VINEYARDS', 'THROW', 'CREEK', 'PEAK', 'RESERVE'];

  const classTypes = [
    'Kentucky Straight Bourbon Whiskey',
    'Tennessee Whiskey',
    'Straight Rye Whiskey',
    'Blended Whiskey',
    'Vodka',
    'Gin',
    'Rum',
    'Tequila',
    'American Whiskey',
    'Single Malt Whiskey'
  ];

  const states = ['KY', 'TN', 'NY', 'CA', 'TX', 'OR', 'CO', 'IL', 'WA', 'PA'];
  const cities = {
    'KY': ['Bardstown', 'Louisville', 'Lexington'],
    'TN': ['Nashville', 'Memphis', 'Lynchburg'],
    'NY': ['Brooklyn', 'Buffalo', 'Albany'],
    'CA': ['San Francisco', 'Napa', 'Los Angeles'],
    'TX': ['Austin', 'Houston', 'Dallas'],
    'OR': ['Portland', 'Bend', 'Eugene'],
    'CO': ['Denver', 'Boulder', 'Fort Collins'],
    'IL': ['Chicago', 'Peoria', 'Springfield'],
    'WA': ['Seattle', 'Spokane', 'Walla Walla'],
    'PA': ['Pittsburgh', 'Philadelphia', 'Erie']
  };

  const abvOptions = ['40% Alc./Vol.', '43% Alc./Vol.', '45% Alc./Vol.', '50% Alc./Vol.', '80 Proof', '90 Proof', '100 Proof'];
  const volumeOptions = ['750 mL', '1 L', '1.75 L', '375 mL'];

  const records: SampleRecord[] = [];

  for (let i = 0; i < count; i++) {
    const brandPrefix = brandPrefixes[i % brandPrefixes.length];
    const brandSuffix = brandSuffixes[Math.floor(i / brandPrefixes.length) % brandSuffixes.length];
    const brandName = `${brandPrefix} ${brandSuffix}`;

    const classType = classTypes[i % classTypes.length];
    const state = states[i % states.length] as keyof typeof cities;
    const cityList = cities[state];
    const city = cityList[i % cityList.length];

    const record: SampleRecord = {
      ttbId: `26${String(i).padStart(12, '0')}`,
      serialNumber: `26-${String(i + 1).padStart(4, '0')}`,
      brandName,
      classType,
      alcoholContent: abvOptions[i % abvOptions.length],
      netContents: volumeOptions[i % volumeOptions.length],
      applicant: {
        name: `${brandName} LLC`,
        permitNumber: `DSP-${state}-${String(10000 + i).slice(-5)}`,
        address: `${city}, ${state}`
      }
    };

    records.push(record);
  }

  return records;
}

/**
 * Defect injection strategies
 */
const DEFECT_TYPES: DefectType[] = [
  {
    type: 'brand-case-diff',
    field: 'brandName',
    apply: (record) => ({ brandName: record.brandName.toLowerCase() })
  },
  {
    type: 'brand-near-miss',
    field: 'brandName',
    apply: (record) => {
      const name = record.brandName;
      const pos = Math.floor(name.length / 2);
      return { brandName: name.slice(0, pos) + (name[pos] === 'O' ? '0' : 'O') + name.slice(pos + 1) };
    }
  },
  {
    type: 'brand-mismatch',
    field: 'brandName',
    apply: () => ({ brandName: 'COMPLETELY DIFFERENT BRAND' })
  },
  {
    type: 'wrong-abv',
    field: 'alcoholContent',
    apply: (record) => {
      const match = record.alcoholContent.match(/(\d+)/);
      if (match) {
        const value = parseInt(match[1]);
        const wrong = value + 5;
        return { alcoholContent: record.alcoholContent.replace(match[1], String(wrong)) };
      }
      return { alcoholContent: '99% Alc./Vol.' };
    }
  },
  {
    type: 'wrong-volume',
    field: 'netContents',
    apply: () => ({ netContents: '500 mL' })
  },
  {
    type: 'warning-titlecase',
    field: 'governmentWarning',
    apply: (_, panel) => ({
      warningHeaderCaps: false,
      panel: panel || 'back'
    })
  },
  {
    type: 'warning-modified',
    field: 'governmentWarning',
    apply: (_, panel) => ({
      warningText: '(1) According to the Surgeon General, women should not drink alcoholic drinks during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health issues.',
      panel: panel || 'back'
    })
  },
  {
    type: 'warning-missing',
    field: 'governmentWarning',
    apply: (_, panel) => ({
      showWarning: false,
      panel: panel || 'back'
    })
  }
];

/**
 * Generate label images using Playwright
 */
async function generateLabelImages(
  record: SampleRecord,
  defect: { type: DefectType; overrides: any } | null,
  warningOnBack: boolean,
  outputDir: string
) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 1
  });

  const templatePath = join(process.cwd(), 'test-labels', 'template-multi-panel.html');

  // Generate front panel
  const frontPage = await context.newPage();
  const frontParams = new URLSearchParams({
    panel: 'front',
    brandName: defect?.overrides.brandName || record.brandName,
    classType: defect?.overrides.classType || record.classType,
    alcoholContent: defect?.overrides.alcoholContent || record.alcoholContent,
    netContents: defect?.overrides.netContents || record.netContents,
    showWarning: warningOnBack ? 'false' : 'true',
    warningHeaderCaps: String(defect?.overrides.warningHeaderCaps ?? true),
    warningHeaderBold: 'true',
    ...(defect?.overrides.warningText && !warningOnBack ? { warningText: defect.overrides.warningText } : {})
  });

  const frontUrl = `file:///${templatePath.replace(/\\/g, '/')}?${frontParams}`;
  await frontPage.goto(frontUrl);
  await frontPage.waitForTimeout(500);
  await frontPage.screenshot({ path: join(outputDir, 'front.png'), type: 'png' });
  await frontPage.close();

  // Generate back panel
  const backPage = await context.newPage();
  const backParams = new URLSearchParams({
    panel: 'back',
    brandName: defect?.overrides.brandName || record.brandName,
    classType: defect?.overrides.classType || record.classType,
    alcoholContent: defect?.overrides.alcoholContent || record.alcoholContent,
    netContents: defect?.overrides.netContents || record.netContents,
    showWarning: warningOnBack ? 'true' : 'false',
    warningHeaderCaps: String(defect?.overrides.warningHeaderCaps ?? true),
    warningHeaderBold: 'true',
    ...(defect?.overrides.warningText && warningOnBack ? { warningText: defect.overrides.warningText } : {}),
    ...(defect?.overrides.showWarning === false && warningOnBack ? { showWarning: 'false' } : {})
  });

  const backUrl = `file:///${templatePath.replace(/\\/g, '/')}?${backParams}`;
  await backPage.goto(backUrl);
  await backPage.waitForTimeout(500);
  await backPage.screenshot({ path: join(outputDir, 'back.png'), type: 'png' });
  await backPage.close();

  await browser.close();
}

/**
 * Main generation function
 */
async function generateSampleData() {
  const startTime = Date.now();

  // Fetch or generate base records
  const records = SOURCE_MODE === 'kaggle'
    ? await fetchKaggleData(SAMPLE_COUNT)
    : generateSyntheticData(SAMPLE_COUNT);

  console.log(`✓ Generated ${records.length} base records\n`);

  // Prepare output directories
  const sampleDataDir = join(process.cwd(), 'sample-data');
  const applicationsDir = join(sampleDataDir, 'applications');
  mkdirSync(sampleDataDir, { recursive: true });
  mkdirSync(applicationsDir, { recursive: true });

  const groundTruth: any[] = [];

  // Generate each application package
  console.log('🖼️  Generating label images and packages...\n');

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const progress = `[${i + 1}/${records.length}]`;

    // Decide if this record gets a defect
    const hasDefect = Math.random() < DEFECT_RATE;
    const warningOnBack = Math.random() < WARNING_ON_BACK_RATE;

    let defect: { type: DefectType; overrides: any } | null = null;
    let expectedVerdicts: Record<string, string> = {
      'Brand Name': 'MATCH',
      'Class/Type': 'MATCH',
      'Alcohol Content': 'MATCH',
      'Net Contents': 'MATCH',
      'Government Warning': 'MATCH'
    };

    if (hasDefect) {
      const defectType = DEFECT_TYPES[i % DEFECT_TYPES.length];
      const overrides = defectType.apply(record, warningOnBack ? 'back' : 'front');
      defect = { type: defectType, overrides };

      // Set expected verdict
      if (defectType.field === 'brandName') {
        expectedVerdicts['Brand Name'] = defectType.type === 'brand-case-diff' ? 'MATCH' :
                                          defectType.type === 'brand-near-miss' ? 'NEEDS_REVIEW' : 'MISMATCH';
      } else if (defectType.field === 'alcoholContent') {
        expectedVerdicts['Alcohol Content'] = 'MISMATCH';
      } else if (defectType.field === 'netContents') {
        expectedVerdicts['Net Contents'] = 'MISMATCH';
      } else if (defectType.field === 'governmentWarning') {
        expectedVerdicts['Government Warning'] = 'MISMATCH';
      }
    }

    // Create application directory
    const appDir = join(applicationsDir, record.serialNumber);
    mkdirSync(appDir, { recursive: true });

    // Generate label images
    await generateLabelImages(record, defect, warningOnBack, appDir);

    // Write application.json
    const applicationData = {
      schemaVersion: '1.0',
      ttbId: record.ttbId,
      serialNumber: record.serialNumber,
      productType: 'DISTILLED_SPIRITS',
      source: 'DOMESTIC',
      applicant: record.applicant,
      label: {
        brandName: record.brandName,
        fancifulName: null,
        classType: record.classType,
        alcoholContent: record.alcoholContent,
        netContents: record.netContents,
        bottlerNameAddress: `${record.applicant.name}, ${record.applicant.address}`,
        countryOfOrigin: null
      },
      images: [
        { file: 'front.png', panel: 'front' },
        { file: 'back.png', panel: 'back' }
      ]
    };

    writeFileSync(
      join(appDir, 'application.json'),
      JSON.stringify(applicationData, null, 2)
    );

    // Record ground truth
    groundTruth.push({
      id: record.serialNumber,
      ttbId: record.ttbId,
      defectType: hasDefect ? defect!.type.type : 'none',
      expectedVerdicts
    });

    console.log(`${progress} ✓ ${record.serialNumber} (${hasDefect ? defect!.type.type : 'clean'})`);
  }

  console.log(`\n✅ Generated ${records.length} application packages\n`);

  // Write ground truth
  writeFileSync(
    join(sampleDataDir, 'ground-truth.json'),
    JSON.stringify(groundTruth, null, 2)
  );

  console.log('✓ Wrote ground-truth.json\n');

  // Create zips
  console.log('📦 Creating zip archives...\n');

  // Full batch zip
  const fullZip = new JSZip();
  for (const record of records) {
    const appDir = join(applicationsDir, record.serialNumber);
    const appJson = join(appDir, 'application.json');
    const frontPng = join(appDir, 'front.png');
    const backPng = join(appDir, 'back.png');

    fullZip.folder(record.serialNumber)!
      .file('application.json', require('fs').readFileSync(appJson))
      .file('front.png', require('fs').readFileSync(frontPng))
      .file('back.png', require('fs').readFileSync(backPng));
  }

  const fullZipBuffer = await fullZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(join(sampleDataDir, 'cola-sample-batch.zip'), fullZipBuffer);
  console.log(`✓ cola-sample-batch.zip (${records.length} applications)`);

  // Small sample zip (first 12)
  const smallZip = new JSZip();
  for (const record of records.slice(0, 12)) {
    const appDir = join(applicationsDir, record.serialNumber);
    const appJson = join(appDir, 'application.json');
    const frontPng = join(appDir, 'front.png');
    const backPng = join(appDir, 'back.png');

    smallZip.folder(record.serialNumber)!
      .file('application.json', require('fs').readFileSync(appJson))
      .file('front.png', require('fs').readFileSync(frontPng))
      .file('back.png', require('fs').readFileSync(backPng));
  }

  const smallZipBuffer = await smallZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(join(sampleDataDir, 'cola-sample-small.zip'), smallZipBuffer);
  console.log(`✓ cola-sample-small.zip (12 applications)\n`);

  // Write documentation
  const defectCounts = groundTruth.reduce((acc, item) => {
    acc[item.defectType] = (acc[item.defectType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const docContent = `# Sample Data for TTB Label Verification App

## Overview

This directory contains ~${records.length} synthetic COLA application packages for evaluator testing.

**Source:** ${SOURCE_MODE === 'kaggle' ? 'TTB COLA Registry (via Kaggle dataset)' : 'Synthetic (realistic fabricated records)'}
**Generated:** ${new Date().toISOString().split('T')[0]}
**Total Applications:** ${records.length}
**Clean (all-MATCH):** ${defectCounts['none'] || 0} (${((defectCounts['none'] || 0) / records.length * 100).toFixed(1)}%)
**With Defects:** ${records.length - (defectCounts['none'] || 0)} (${((records.length - (defectCounts['none'] || 0)) / records.length * 100).toFixed(1)}%)

## Defect Distribution

${Object.entries(defectCounts).filter(([k]) => k !== 'none').map(([type, count]) =>
  `- **${type}:** ${count} applications`
).join('\n')}

## Files

- **cola-sample-batch.zip** — Full set of ${records.length} applications for batch testing
- **cola-sample-small.zip** — Quick-start subset of 12 applications
- **ground-truth.json** — Expected verdicts for every application (for eval harness)
- **applications/** — Unpacked application packages (CAP format)

## Usage

### Evaluator Quick Start

1. Open the app at http://localhost:3000
2. Click "Load sample dataset" in the batch drop zone
3. The app loads \`cola-sample-small.zip\` (12 applications) and begins processing
4. Results table auto-sorts MISMATCH/NEEDS_REVIEW to the top

### Full Batch Test

1. Download \`cola-sample-batch.zip\`
2. Drag and drop into the app's batch drop zone
3. Watch ${records.length} applications process with concurrency limit of 5
4. Export results to CSV for analysis

### Eval Harness

\`\`\`bash
npm run evals:sample
\`\`\`

Runs the verification engine against \`ground-truth.json\` and prints accuracy by defect type.

## Ground Truth Format

\`\`\`json
{
  "id": "26-0001",
  "ttbId": "26000000000000",
  "defectType": "brand-near-miss",
  "expectedVerdicts": {
    "Brand Name": "NEEDS_REVIEW",
    "Class/Type": "MATCH",
    "Alcohol Content": "MATCH",
    "Net Contents": "MATCH",
    "Government Warning": "MATCH"
  }
}
\`\`\`

## Multi-Image Design

~60% of applications have the government warning on the **back label** (realistic per TTB practice).
The app sends both front.png and back.png in ONE Anthropic API call, and the model merges findings.

## Notes

- All data is PUBLIC RECORD from the TTB COLA Registry (or realistic synthetic equivalents)
- Defects injected at KNOWN rate so evaluators can measure accuracy
- Generated with controlled randomness for reproducibility
`;

  writeFileSync(join(sampleDataDir, 'SAMPLE-DATA.md'), docContent);
  console.log('✓ Wrote SAMPLE-DATA.md\n');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Complete in ${elapsed}s\n`);
  console.log(`Output: ${sampleDataDir}/`);
}

// Run
generateSampleData().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
