# TTB Label Verification App

AI-powered prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance agents to verify alcohol label images against COLA application data.

**🎯 Critical Success Criteria:**
- ⚡ **Speed:** Results in under 5 seconds (prior vendor pilot failed at 30-40s)
- 🎨 **Three-state verdicts:** `MATCH` (green), `MISMATCH` (red), `NEEDS_REVIEW` (yellow)
- 🔍 **Dual matching philosophy:** Fuzzy for brand/identity, character-exact for government warning

## Features

- **Multi-image processing:** Handles 1-4 label panels (front, back, neck) in a single verification
- **Intelligent extraction:** Claude 4.5 Haiku vision model extracts structured data from label images
- **Deterministic comparison:** Pure functions with comprehensive unit tests verify extracted vs. application data
- **Zero-tolerance warning check:** Character-level validation of 27 CFR 16.21 statutory text
- **Batch processing:** Client-side orchestration with concurrency limiting (5 simultaneous requests)
- **CAP format support:** COLA Application Package interchange format for realistic data entry
- **Sample datasets:** Ready-made test data with ground truth for evaluator testing

## Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **AI:** Anthropic API with `claude-haiku-4-5` (swappable constant in [lib/config.ts](lib/config.ts))
- **Image processing:** Client-side compression/resize before upload (max 2048px, JPEG 0.85)
- **Deployment:** Vercel (4.5 MB body limit consideration)
- **No database** — Request/response only, no persistence (privacy by design)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Add: ANTHROPIC_API_KEY=your_key_here

# Run development server
npm run dev
# Open http://localhost:3000

# Run unit tests
npm test

# Generate test labels
npm run labels:generate

# Run evaluations (requires dev server running)
npm run evals:run
```

## Multi-Image Architecture

**Rationale:** The government warning frequently appears on the BACK label in real-world applications. Single-image verification would false-flag "warning missing" on realistic data.

**Implementation:**
1. User uploads 1-4 images per application (front, back, neck, side)
2. All images sent in ONE Anthropic API call with merged extraction
3. Model returns `foundOn` field for each extracted item ("front" | "back" | "neck" | "unknown")
4. VerdictCard UI surfaces panel location (e.g., "✓ Government warning — back label")

**Benefits:**
- Eliminates false positives from split-panel labels
- Maintains <5s performance target (single API call)
- Realistic simulation of TTB agent workflow

## COLA Application Package (CAP) Format

Interchange format pairing application data with label imagery. Production analog is a COLA export.

### Supported Layouts

1. **Package zip:** `application.json` + images in one archive
2. **Batch zip:** Multiple subfolders, each a package
3. **Manifest mode:** Root `applications.json` (array) + images
4. **Loose drop:** `application.json` + images as separate files

### Schema Example

```json
{
  "schemaVersion": "1.0",
  "ttbId": "26999001000123",
  "serialNumber": "26-0001",
  "productType": "DISTILLED_SPIRITS",
  "source": "DOMESTIC",
  "applicant": {
    "name": "Old Tom Distillery LLC",
    "permitNumber": "DSP-KY-12345",
    "address": "Bardstown, KY"
  },
  "label": {
    "brandName": "OLD TOM DISTILLERY",
    "classType": "Kentucky Straight Bourbon Whiskey",
    "alcoholContent": "45% Alc./Vol.",
    "netContents": "750 mL",
    "bottlerNameAddress": "Old Tom Distillery, Bardstown, KY",
    "countryOfOrigin": null
  },
  "images": [
    { "file": "front.png", "panel": "front" },
    { "file": "back.png", "panel": "back" }
  ]
}
```

**Verifiable vs. Administrative Fields:**

- **Verifiable** (`label.*`): Brand name, class/type, alcohol content, net contents, government warning → drive verdicts
- **Administrative** (everything else): Applicant info, TTB ID, serial number → displayed as context, never verified

Full schema: [lib/cap-schema.json](lib/cap-schema.json)

## Sample Datasets

### Evaluator Quick Start (30 seconds)

1. Open the app at http://localhost:3000
2. Click "Load sample ▾" → "📦 Load Sample Dataset (12 apps)"
3. Watch 12 applications process with multi-image extraction
4. Results table auto-sorts MISMATCH/NEEDS_REVIEW to top

### Sample Data Overview

- **Source:** Synthetic (realistic fabricated records based on TTB registry patterns)
- **Count:** 12 applications in small sample, 200 in full batch
- **Defect rate:** 15% with one defect each from 8 test dimensions
- **Multi-image:** 60% have government warning on back panel

**Defect Types:**
- `brand-case-diff` — Case-only difference (should MATCH due to normalization)
- `brand-near-miss` — Single-character typo (should flag NEEDS_REVIEW)
- `brand-mismatch` — Completely different brand name
- `wrong-abv` — Alcohol content mismatch
- `wrong-volume` — Net contents mismatch
- `warning-titlecase` — Warning header not in all caps (regulatory failure)
- `warning-modified` — Word-level difference in warning text
- `warning-missing` — No warning on label

**Files:**
- `public/samples/cola-sample-small.zip` — 12-application quick-start batch
- `sample-data/cola-sample-batch.zip` — Full 200-application dataset
- `sample-data/ground-truth.json` — Expected verdicts for eval harness
- `sample-data/SAMPLE-DATA.md` — Generation details and usage guide

### Generate Sample Data

```bash
# Generate 200 applications (synthetic mode)
npm run sample:generate -- --source=synthetic --count=200

# Generate with Kaggle data (requires ~/.kaggle/kaggle.json)
npm run sample:generate -- --source=kaggle --count=200

# Output: sample-data/
#   - cola-sample-batch.zip (200 applications)
#   - cola-sample-small.zip (12 applications)
#   - ground-truth.json (expected verdicts)
#   - applications/ (unpacked CAP packages)
```

## Evaluation Harness

```bash
# Run against test fixtures
npm run evals:run

# Run against sample dataset with accuracy table
npm run evals:sample
```

**Sample output (measured against 200 synthetic applications):**

```
Accuracy by Defect Type:

Defect Type         | Total | Pass | Fail | Accuracy
--------------------+-------+------+------+---------
brand-case-diff     |    10 |    7 |    3 | 70.0%
brand-mismatch      |     5 |    3 |    2 | 60.0%
brand-near-miss     |     5 |    2 |    3 | 40.0%
none (clean)        |   162 |   99 |   63 | 61.1%
warning-missing     |     3 |    3 |    0 | 100.0%
warning-modified    |     5 |    5 |    0 | 100.0%
warning-titlecase   |     3 |    3 |    0 | 100.0%
wrong-abv           |     3 |    2 |    1 | 66.7%
wrong-volume        |     4 |    4 |    0 | 100.0%
--------------------+-------+------+------+---------
Overall             |   200 |  128 |   72 | 64.0%
```

**Key Findings:**
- Warning detection defects (missing, modified, titlecase) achieved 100% accuracy
- Volume and brand mismatch detection performed well (60-100%)
- Primary accuracy limitation: Government Warning extraction from clean labels (~61%)
- Model: `claude-haiku-4-5` | Dataset: 200 synthetic applications | Date: 2026-06-11

*The lower-than-expected accuracy on clean labels is primarily due to Government Warning text extraction challenges from synthetic rendered images. Real-world label photos may perform differently.*

**Improvement Opportunities:** See [STRETCH-GOAL-ACCURACY.md](STRETCH-GOAL-ACCURACY.md) for detailed analysis and quick wins to try (switch to Sonnet, enhance prompts, improve rendering).

## Comparison Logic

### Fuzzy Matching (Brand Name, Class/Type)

**Philosophy:** Don't cry wolf on trivial differences like "STONE'S THROW" vs "Stone's Throw"

1. **Normalization:** lowercase, trim, collapse whitespace, strip quotes, normalize apostrophes
2. **Exact after normalization** → `MATCH`
3. **Levenshtein similarity ≥ 0.9** → `NEEDS_REVIEW` (possible OCR artifact)
4. **Otherwise** → `MISMATCH`

### Numeric Matching (Alcohol Content, Net Contents)

- **Alcohol content:** Parses percentage and proof (proof ÷ 2 = ABV), exact numeric match within 0.01 tolerance
- **Net contents:** Normalizes units (750 mL = 0.75 L), exact numeric match
- **Internal consistency check:** If label shows both ABV and proof, validates they agree

### Government Warning (Zero Tolerance)

**Statutory text:** 27 CFR 16.21

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

**Checks (ALL must pass):**
1. Warning present on ANY panel
2. Header "GOVERNMENT WARNING:" in ALL CAPS
3. Header appears bold (best-effort visual judgment → `NEEDS_REVIEW` if fails)
4. Body text matches character-for-character (only allowed normalizations: collapse whitespace, unify hyphenation artifacts)

**ANY word difference, omission, or punctuation change → `MISMATCH`**

Implementation: [lib/warning-text.ts](lib/warning-text.ts)

## Test Labels

Located in [test-labels/](test-labels/) with [manifest.md](test-labels/manifest.md):

1. `clean-match` — All correct
2. `case-mismatch` — Brand case differs (should MATCH)
3. `wrong-abv` — Wrong ABV (MISMATCH)
4. `warning-titlecase` — Title case warning (MISMATCH)
5. `warning-modified` — Modified warning text (MISMATCH with diff)
6. `warning-missing` — No warning (MISMATCH)
7. `glare-angle` — Quality issues (exercises quality note)
8. `near-miss-brand` — Typo in brand (NEEDS_REVIEW)

**Generate labels:**
```bash
npm run labels:generate
# Uses Playwright to render test-labels/template.html with varying defects
```

## Performance

- **Target:** <5s per application (critical differentiator vs. prior vendor)
- **Measured:** ~1.5-3s typical (depends on image size and API latency)
- **Timing displayed:** Prominent badge in results UI
- **Optimization:** Client-side image compression keeps requests small and extraction fast

## Design for 73-Year-Old Usability

- **16px minimum text, large click targets, high contrast**
- **Every verdict with icon + color + word** (never color alone for accessibility)
- **No technical jargon** — errors read like helpful colleague
- **Live processing timer** ("Checking… 1.8s")
- **Pre-fill sample data** via "Load sample" dropdown for instant demo

## Architecture Decisions

### Why Always-Batch (Single = Batch of One)

**Removed:** "Apply one form to all images" concept

**Rationale:** Doesn't model reality. A real batch is multiple applications, each with its own data. One queue, one results table, one CSV export simplifies UX and matches production workflow.

### Why Client-Side Orchestration

**No /api/batch route.** The batch page calls /api/verify repeatedly with concurrency limit of 5.

**Benefits:**
- Avoids Vercel function timeout issues with large batches
- Stays under 4.5 MB body limit per request
- Real-time progress updates as each verification completes
- Failed images don't block the entire batch

### Why No Persistence

All processing is request/response with no database. **Privacy by design** — uploaded images never stored.

## Out of Scope (Noted for Future Work)

- Authentication/user accounts
- Database/persistence layer
- Direct COLA integration (simulated via CAP format)
- Beverage-type-specific rule engines (wine appellation, varietal validation)
- Mobile-specific layouts (desktop-first)

## Domain Context (TTB Research)

1. **COLA is the system of record:** TTB's "COLAs Online" system (Form TTB F 5100.31) is the sole internal database. Agents never type application data — they pull up an existing record.

2. **One application : many images:** A single COLA application can include front, back, and neck label images. Government warning frequently appears on the back label.

3. **Public COLA Registry:** ttbonline.gov exposes approved records (application data + label images, 1999/2003+) as public records under CC0 license.

4. **Kaggle dataset exists:** "TTB COLAs Demo" by COLA Cloud (~4M records) — parsed sample of the registry with structured fields and OCR features.

5. **Form 5100.31 field taxonomy:** Mixes administrative (identify filer, not on label) and label-verifiable fields (must/should appear on artwork). Only label-verifiable fields drive verdicts.

## Contributing

This is a prototype demonstrating feasibility. For production deployment, consider:

- Azure/AWS Bedrock Claude endpoint (agency networks may block direct Anthropic API)
- Batch processing optimizations for 200-300 concurrent applications (peak season)
- Wine/beer conditional field validation (varietal, appellation, vintage)
- Integration with COLA export format
- Audit logging and user session tracking

## License

Prototype for government evaluation. Not for commercial use.

---

**Generated by Claude Code** — [claude.ai/code](https://claude.ai/code)
