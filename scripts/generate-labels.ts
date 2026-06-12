import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface Fixture {
  id: string;
  description: string;
  renderConfig: Record<string, any>;
  applicationData: any;
  expectedVerdicts: Record<string, string>;
  panels?: Array<{
    panel: 'front' | 'back' | 'neck';
    renderConfig?: Record<string, any>;
  }>;
}

async function generateLabels() {
  const fixturesPath = join(process.cwd(), 'test-labels', 'fixtures.json');
  const fixtures: Fixture[] = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

  // Ensure output directory exists
  mkdirSync(join(process.cwd(), 'test-labels'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 2, // High DPI for crisp text
  });

  console.log(`Generating ${fixtures.length} test labels...\n`);

  for (const fixture of fixtures) {
    // Check if this fixture has multiple panels
    if (fixture.panels && fixture.panels.length > 0) {
      // Generate multiple panels
      for (const panelConfig of fixture.panels) {
        const page = await context.newPage();

        // Merge base renderConfig with panel-specific config
        const mergedConfig = { ...fixture.renderConfig, ...panelConfig.renderConfig, panel: panelConfig.panel };

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(mergedConfig)) {
          params.set(key, String(value));
        }

        // Use multi-panel template
        const templatePath = join(process.cwd(), 'test-labels', 'template-multi-panel.html');
        const templateUrl = `file:///${templatePath.replace(/\\/g, '/')}?${params}`;

        await page.goto(templateUrl);
        await page.waitForTimeout(500);

        const outputPath = join(process.cwd(), 'test-labels', `${fixture.id}-${panelConfig.panel}.png`);
        await page.screenshot({ path: outputPath, type: 'png' });

        console.log(`✓ Generated ${fixture.id}-${panelConfig.panel}.png`);
        await page.close();
      }
    } else {
      // Generate single panel (legacy behavior)
      const page = await context.newPage();

      // Build query string from renderConfig
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(fixture.renderConfig)) {
        params.set(key, String(value));
      }

      // Use file:// protocol for local HTML file
      const templatePath = join(process.cwd(), 'test-labels', 'template.html');
      const templateUrl = `file:///${templatePath.replace(/\\/g, '/')}?${params}`;

      await page.goto(templateUrl);

      // Wait for fonts and layout to settle
      await page.waitForTimeout(500);

      const outputPath = join(process.cwd(), 'test-labels', `${fixture.id}.png`);
      await page.screenshot({ path: outputPath, type: 'png' });

      console.log(`✓ Generated ${fixture.id}.png`);
      await page.close();
    }
  }

  await browser.close();
  console.log(`\n✓ Generated ${fixtures.length} test labels in test-labels/`);
}

generateLabels().catch((error) => {
  console.error('Error generating labels:', error);
  process.exit(1);
});
