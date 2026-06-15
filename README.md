# TTB Label Verification App

AI-powered prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance agents to verify alcohol label images against COLA application data.

## Overview

Compares label images to form data and produces per-field verification verdicts (MATCH/MISMATCH/NEEDS_REVIEW). Uses Claude vision for extraction, deterministic logic for comparison. Processes results in under 5 seconds with batch support for 200-300 applications.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Add your API key: ANTHROPIC_API_KEY=sk-ant-...

# Run development server
npm run dev
# Open http://localhost:3000

# Run unit tests
npm test

# While server is running
npm run evals:run

# Generate test labels
npm run labels:generate
```

## Approach, Tools, and Assumptions

### Approach

**Model extracts, code judges.** Claude vision reads labels and transcribes fields verbatim. Every match/mismatch decision happens in unit-tested functions—no LLM in the verdict path. Verdicts are reproducible and auditable.

**Two matching philosophies:**
- **Fuzzy for identity fields** (brand, class/type) - Handles "STONE'S THROW" vs "Stone's Throw" without false rejections
- **Character-exact for government warning** - 27 CFR 16.21 statutory text, byte-for-byte

**Three states:** MATCH / MISMATCH / NEEDS_REVIEW. Low extraction confidence and ambiguous near-misses land in NEEDS_REVIEW—the safe failure mode.

**Multi-image extraction:** Front/back/neck panels processed together (government warning typically on back). One application = batch of one.

### Tools

- **Framework:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **AI:** Anthropic Claude Haiku for vision extraction
- **Deployment:** Vercel (single public URL)
- **Batch:** Client-side orchestration (JSZip, image compression)
- **No database:** Request/response only (privacy by design)

### Assumptions

**From stakeholder interviews:**
- Sub-5-second target (prior vendor at 30-40s abandoned)
- Batch handles 200-300 applications (peak season)
- Warning matched exactly—all caps header, no word changes
- Trivial text differences normalized (case, spacing)

**Scoping decisions:**
- Distilled spirits only (beer/wine rules noted as future work)
- No image persistence by design
- ABV matched exactly (regulatory number)
- Public deployment without auth (prototype scope)

**CAP format:** COLA Application Package—a versioned JSON Schema defined for this prototype to pair application data with label images (stand-in for COLA export).

## Sample Datasets

### Evaluator Quick Start (30 seconds)

1. Open the app at http://localhost:3000
2. Download sample data (4 data sets provided)
3. Drag the downloaded zip onto the batch upload dialog
4. Watch applications process with multi-image extraction
5. Review applications with issues

**S3-Hosted Sample Data:**

- [sample-1.zip](https://label-verify-samples.s3.amazonaws.com/sample-1.zip) — Single application for quick testing
- [sample-10.zip](https://label-verify-samples.s3.amazonaws.com/sample-10.zip) — Small batch (10 applications)
- [sample-100.zip](https://label-verify-samples.s3.amazonaws.com/sample-100.zip) — Large batch (100 applications)
- [sample-real-photos-3.zip](https://label-verify-samples.s3.amazonaws.com/sample-real-photos-3.zip) — Real label photos (3 applications)

**Generate your own:**
```bash
npm run sample:generate -- --source=synthetic --count=200

# Output: sample-data/
#   - cola-sample-batch.zip (200 applications)
#   - cola-sample-small.zip (12 applications)
```

## Features

### Core Verification
- **Multi-image processing:** 1-4 label panels (front, back, neck) per application
- **Three-state verdicts:** MATCH (green), MISMATCH (red), NEEDS_REVIEW (yellow)
- **Dual matching philosophy:**
  - Fuzzy for brand/identity (handles "STONE'S THROW" vs "Stone's Throw")
  - Character-exact for government warning (27 CFR 16.21)

### Batch Workflow
- **CAP format support:** COLA Application Package interchange format (4 layouts)
- **Client-side orchestration:** 5 concurrent verifications, real-time progress
- **Manual review UI:** Approve/reject workflow with confidence-based triage
- **Image zoom & pan:** Multi-level zoom with drag-to-pan for detailed inspection

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

## CAP Package Format

COLA Application Package interchange format for pairing application data with label images. Supports 4 layouts:

1. **Package zip:** `application.json` + images in one archive
2. **Batch zip:** Multiple subfolders, each with `application.json` + images
3. **Manifest mode:** Root `applications.json` (array) + images
4. **Loose drop:** `application.json` + images as separate files

**Schema:** [lib/cap-schema.json](lib/cap-schema.json)

**Example:**
```json
{
  "schemaVersion": "1.0",
  "ttbId": "26999001000123",
  "productType": "DISTILLED_SPIRITS",
  "label": {
    "brandName": "OLD TOM DISTILLERY",
    "classType": "Kentucky Straight Bourbon Whiskey",
    "alcoholContent": "45% Alc./Vol.",
    "netContents": "750 mL"
  },
  "images": [
    { "file": "front.png", "panel": "front" },
    { "file": "back.png", "panel": "back" }
  ]
}
```

## Performance

- **Target:** <5 seconds per application
- **Measured:** ~1.5-3s typical (AI verification only, server-side)
- **Timing displayed:** Per-item in results table and batch average
- **Optimization:** Client-side image compression for faster uploads

**Note on timing:** Processing time displayed reflects AI extraction and comparison only (server-side measurement). Network transfer time varies by connection speed and is excluded—consistent with the requirement that verification itself complete in under 5 seconds. On a fast connection, total response time (including upload) will be ~3-4s; on mobile LTE it may be 8-10s, but the displayed verification time remains consistent at ~3s.

## Deployment

**Prototype:** Calls Anthropic API directly from Vercel serverless functions. Public URL—no agency firewall during evaluation.

**Production:** Agency networks block outbound ML endpoints. Recommended paths:
- Azure Government hosted model (FedRAMP-authorized)
- AWS Bedrock Claude
- Self-hosted vision model
- Agency-approved proxy

**Easy migration:** All Anthropic API calls isolated to `lib/extraction.ts`. Swap extraction backend without touching comparison logic, UI, or queue.

**Error handling:** User-friendly messages for auth failures, network issues, rate limits, timeouts. No stack traces exposed.

## Known Limitations

- Synthetic test data (real-world label photos may perform differently)
- No authentication/user accounts
- No database/persistence layer

## Project Structure

```
├── app/                    # Next.js pages (upload, dashboard, appmaker)
├── lib/                    # Core logic
│   ├── extraction.ts       # Claude vision extraction
│   ├── comparison.ts       # Deterministic comparison functions
│   ├── warning-text.ts     # Government warning verification
│   ├── cap-loader.ts       # CAP package loading with JSZip
│   ├── cap-schema.json     # JSON Schema for validation
│   └── types.ts            # TypeScript interfaces
├── components/             # React components
├── docs/                   # Architecture & decision documentation
├── sample-data/            # 200 synthetic test packages + ground truth
├── scripts/                # Sample data generator & eval harness
└── test-labels/            # 8 fixture test images
```

## License

Prototype for government evaluation. Not for commercial use.
