# TTB Label Verification App

AI-powered prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance agents to verify alcohol label images against COLA application data.

## Overview

This application compares uploaded label images to form data and produces per-field verification verdicts (MATCH/MISMATCH/NEEDS_REVIEW) using Claude vision for extraction and deterministic logic for comparison. Built to process results in under 5 seconds with support for batch workflows (200-300 applications at once).

**📄 See [docs/APPROACH.md](docs/APPROACH.md) for approach, tools, and assumptions.**

## Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **AI:** Anthropic API with `claude-haiku-4-5` (configured in [lib/config.ts](lib/config.ts))
- **Image processing:** Client-side compression (max 2048px, JPEG 0.85)
- **Deployment:** Vercel
- **No database** — Request/response only (privacy by design)

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
│   ├── APPROACH.md         # Approach, tools, and assumptions
│   ├── ARCHITECTURE-DECISIONS.md
│   └── IMPLEMENTATION-GUIDE.md
├── sample-data/            # 200 synthetic test packages + ground truth
├── scripts/                # Sample data generator & eval harness
└── test-labels/            # 8 fixture test images
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

## Sample Datasets

### Evaluator Quick Start (30 seconds)

1. Open the app at http://localhost:3000
2. Click "Load sample ▾" → "Load Sample Dataset (10 apps)"
3. Drag the downloaded zip onto the batch upload dialog
4. Watch 10 applications process with multi-image extraction
5. Results table auto-sorts MISMATCH/NEEDS_REVIEW to top

### Sample Data Overview

- **Source:** Synthetic (realistic fabricated records based on TTB registry patterns)
- **Count:** 1 in single example, 10 applications in small sample, 200 in full batch, 3 in photos I took
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

**S3-Hosted Sample Data:**

- [sample-1.zip](https://label-verify-samples.s3.amazonaws.com/sample-1.zip) — Single application for quick testing
- [sample-10.zip](https://label-verify-samples.s3.amazonaws.com/sample-10.zip) — Small batch (10 applications)
- [sample-100.zip](https://label-verify-samples.s3.amazonaws.com/sample-100.zip) — Large batch (100 applications)
- [sample-real-photos-3.zip](https://label-verify-samples.s3.amazonaws.com/sample-real-photos-3.zip) — Real label photos (3 applications)

### Generate Sample Data

Or generate your own:
```bash
npm run sample:generate -- --source=synthetic --count=200

# Generate with Kaggle data (requires ~/.kaggle/kaggle.json)
npm run sample:generate -- --source=kaggle --count=200

# Output: sample-data/
#   - cola-sample-batch.zip (200 applications)
#   - cola-sample-small.zip (12 applications)
#   - applications/ (unpacked CAP packages)
```
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

## Network and Deployment Considerations

### Prototype Environment
This prototype calls the Anthropic API directly from a Vercel serverless function. Evaluators access the app via its public Vercel URL—no agency firewall is involved during evaluation.

### Production Deployment
In a production deployment inside the agency network, outbound calls to commercial AI endpoints would be blocked per the network restrictions described in the discovery sessions (Marcus Williams, IT Systems Administrator).

**Recommended production paths:**
- **Azure Government hosted model** — FedRAMP-authorized, stays inside the network boundary; aligns with the agency's existing Azure infrastructure (post-2019 migration to Azure cloud)
- **AWS Bedrock Claude** — Government cloud deployment with agency-approved egress
- **Self-hosted vision model** — Deployed within the network perimeter, no outbound dependency
- **Approved agency proxy** — Route Anthropic API calls through an authorized egress point

### Architecture for Easy Migration
The prototype isolates all Anthropic API calls to a single file ([lib/extraction.ts](lib/extraction.ts)). Swapping the extraction backend for any of the above paths requires changes to that file only—the comparison logic ([lib/comparison.ts](lib/comparison.ts), [lib/warning-text.ts](lib/warning-text.ts)), CAP loader, UI, and queue architecture are unaffected.

**Migration checklist:**
1. Replace Anthropic SDK initialization in `lib/extraction.ts`
2. Update `buildVisionPrompt()` to target model's message format
3. Update response parsing to match new model's output structure
4. Set `ANTHROPIC_API_KEY` environment variable to new endpoint credentials
5. All other code remains unchanged

### Error Handling
The app gracefully handles API failures with user-friendly messages:
- **Missing API Key:** "API authentication failed. Please check your API key configuration."
- **Network Unavailable:** "Network connection failed. Please check your internet connection."
- **Rate Limit:** "Rate limit exceeded. Please wait a moment and try again."
- **Timeout:** "Verification took too long. Please try again with a clearer image."
- **Unknown Error:** "Verification service unavailable. Please try again or contact your administrator."

No technical details (stack traces, error codes) are exposed to users—all errors return plain-English guidance.

## Design Principles

Built for 73-year-old usability:
- 16px minimum text, large click targets, high contrast
- Every verdict with icon + color + word (never color alone)
- No technical jargon — errors read like helpful colleague
- Live processing timer for perceived speed
- Sample data pre-loaded via dropdown for instant demo

## Architecture Decisions

See [docs/ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md) for detailed rationale.

**Key decisions:**
- **LLM extracts, code judges:** Claude vision transcribes, deterministic functions verify
- **Always-batch queue:** Single entry = batch of one
- **Client-side orchestration:** No /api/batch route, concurrency limit of 5
- **No persistence:** Privacy by design
- **Multi-image extraction:** 1-4 images per API call for government warning detection

## Documentation

- **[APPROACH.md](docs/APPROACH.md)** — Approach, tools, and assumptions *(submission requirement)*
- **[ARCHITECTURE-DECISIONS.md](docs/ARCHITECTURE-DECISIONS.md)** — Major design decisions and rationale
- **[IMPLEMENTATION-GUIDE.md](docs/IMPLEMENTATION-GUIDE.md)** — Developer guide with patterns and pitfalls
- **[docs/decisions/](docs/decisions/)** — Session-by-session decision logs

## Known Limitations

- Desktop-first (no mobile-specific layouts)
- Synthetic test data (real-world label photos may perform differently)
- Government warning extraction: 61% accuracy on synthetic labels, 100% on defects
- No authentication/user accounts
- No database/persistence layer

## Out of Scope (Future Work)

- Direct COLA integration (simulated via CAP format)
- Wine/beer conditional validation (varietal, appellation, vintage)
- Beverage-type-specific rule engines
- Azure/AWS Bedrock endpoint (note: agency networks may block direct Anthropic API)
- Mobile-specific layouts

## Deployment

Built for Vercel with considerations for:
- 4.5 MB body limit → Client-side image compression
- Serverless timeout → Client-side batch orchestration
- No cold starts → Haiku-class model for speed

For production deployment, consider:
- Azure/AWS Bedrock Claude endpoint (agency network compatibility)
- Batch processing optimizations for 300 concurrent applications
- Authentication and audit logging
- Integration with COLA export format

## License

Prototype for government evaluation. Not for commercial use.
