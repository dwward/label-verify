# Implementation Guide

**Project:** TTB Label Verification Prototype  
**Last Updated:** 2026-06-14  
**Audience:** Developers working on or extending this codebase

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Key Architecture Principles](#key-principles)
3. [Component Organization](#component-organization)
4. [Core Workflows](#core-workflows)
5. [Adding New Features](#adding-features)
6. [Common Patterns](#common-patterns)
7. [Testing Strategy](#testing-strategy)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

<a name="system-overview"></a>
## System Overview

### What This System Does

Verifies alcohol label images against COLA (Certificate of Label Approval) application data:
1. **Agent uploads** application data (brand, ABV, volume) + 1-4 label images
2. **Claude vision extracts** text from label images (OCR + understanding)
3. **Deterministic comparison** checks if extracted text matches application
4. **Results displayed** with color-coded verdicts (MATCH/MISMATCH/NEEDS_REVIEW)

**Critical requirement:** Must complete in < 5 seconds (prior vendor failed at 30-40s).

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │ Image Comp.  │→ │  JSZip Parser  │→ │  Queue UI   │ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
│         ↓                                     ↓          │
└─────────┼─────────────────────────────────────┼─────────┘
          │                                     │
          └──────────────── FormData ───────────┘
                             ↓
┌─────────────────────────────────────────────────────────┐
│                 Next.js API Route (/api/verify)         │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │   Anthropic  │→ │   Extraction   │→ │ Comparison  │ │
│  │   API Call   │  │   (lib/extract)│  │ (lib/compare│ │
│  └──────────────┘  └────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────┘
          ↓
    JSON Response (Verdicts + Timing)
```

**Key Design Choices:**
- **Client-side processing:** ZIP parsing, image compression (bypasses Vercel 4.5 MB limit)
- **Server-side extraction:** Anthropic API calls (hides API key)
- **Pure function comparison:** No API calls, fast, testable
- **No database:** Privacy by design, ephemeral state only

---

<a name="key-principles"></a>
## Key Architecture Principles

### 1. LLM Extracts, Code Judges
- **LLM (Claude vision):** Extract text from image (probabilistic, leverages OCR + understanding)
- **Code (comparison.ts):** Judge if extracted matches application (deterministic, testable)
- **Why:** Speed (<1ms per comparison), cost ($0), testability (unit tests), explainability

### 2. Privacy by Design
- **No database:** Zero persistence (no PostgreSQL, Redis, S3)
- **Ephemeral state:** React state + sessionStorage (metadata) + window globals (images)
- **Export instead of save:** User downloads JSON/CSV on demand
- **Why:** No privacy policy needed, no GDPR compliance, no data breach risk

### 3. Client-Side Heavy
- **ZIP parsing:** JSZip in browser
- **Image compression:** browser-image-compression library
- **Validation:** JSON Schema (AJV) client-side
- **Why:** Bypasses Vercel body limit, instant feedback, better UX

### 4. Single-Page Always-Batch
- **No multi-page navigation:** All features on one page
- **Progressive disclosure:** Statistics/inspector appear when needed
- **Queue-first:** Single application = batch of one
- **Why:** Simpler mental model, 45% less code, better for elderly users

### 5. Accessibility First
- **Target user:** 73-year-old with minimal tech experience
- **14px minimum font size:** All text ≥14px
- **Icon + color + text:** Never color alone
- **Plain-English errors:** No jargon

---

<a name="component-organization"></a>
## Component Organization

### Directory Structure

```
label-verify/
├── app/                      # Next.js App Router pages
│   ├── page.tsx              # Root redirect to /upload
│   ├── upload/page.tsx       # Main application page (upload + queue + inspector)
│   ├── dashboard/page.tsx    # Batch dashboard with triage workflow
│   ├── appmaker/page.tsx     # Internal tool (CAP package creator)
│   └── api/
│       └── verify/route.ts   # POST /api/verify endpoint
├── components/               # React components
│   ├── AppNavigation.tsx     # Sidebar nav (Upload/Dashboard/AppMaker)
│   ├── ApplicationForm.tsx   # Form for manual data entry
│   └── ImageUpload.tsx       # Multi-file drag-drop component
├── lib/                      # Core business logic
│   ├── extraction.ts         # Claude API call, JSON parsing
│   ├── comparison.ts         # Pure function comparison logic
│   ├── warning-text.ts       # Government warning exact-match
│   ├── cap-loader.ts         # ZIP parsing, 4 layout types
│   ├── cap-utils.ts          # CAP format conversion, validation
│   ├── cap-schema.json       # JSON Schema for CAP format
│   ├── triage.ts             # Confidence scoring, workflow states
│   ├── config.ts             # All tunable constants
│   └── types.ts              # TypeScript interfaces
├── test-labels/              # 8 test cases (clean-match, wrong-abv, etc.)
├── sample-data/              # 200 synthetic applications for evaluation
├── scripts/                  # Data generation, evaluation harness
│   ├── generate-labels.ts    # Render test labels from HTML
│   ├── generate-sample-data.ts  # Create 200 synthetic packages
│   └── run-evals.ts          # Accuracy evaluation harness
└── docs/                     # Documentation
    ├── ARCHITECTURE-DECISIONS.md  # This document's companion
    ├── IMPLEMENTATION-GUIDE.md    # You are here
    └── decisions/            # Session-by-session decision logs
```

### Critical Files to Understand

| File | Purpose | Key Functions |
|------|---------|---------------|
| `app/api/verify/route.ts` | API endpoint | POST handler, FormData parsing |
| `lib/extraction.ts` | Claude API | `extractLabelData()` |
| `lib/comparison.ts` | Comparison logic | `verifyLabel()`, field comparators |
| `lib/warning-text.ts` | Exact-match warning | `verifyGovernmentWarning()` |
| `lib/cap-loader.ts` | ZIP parsing | `loadCAPPackages()`, layout detection |
| `lib/config.ts` | Configuration | Model ID, thresholds, timeouts |
| `components/AppNavigation.tsx` | Navigation | Sidebar, badge counts |

---

<a name="core-workflows"></a>
## Core Workflows

### Workflow 1: Single Label Verification

```
1. User fills form (brand, class, ABV, volume)
2. User uploads 1-4 images
3. Client compresses images (browser-image-compression)
4. Click "Verify Label"
5. FormData → POST /api/verify
6. API route:
   a. Calls Claude API (lib/extraction.ts)
   b. Parses JSON response (defensive)
   c. Runs comparison logic (lib/comparison.ts)
   d. Returns verdicts + timing
7. UI displays results (VerdictCard components)
8. Total time: < 5 seconds
```

**Key Files:**
- `app/upload/page.tsx` (form + upload UI)
- `app/api/verify/route.ts` (API handler)
- `lib/extraction.ts` (Claude call)
- `lib/comparison.ts` (pure function comparison)

### Workflow 2: Batch ZIP Upload

```
1. User drags/drops CAP package ZIP
2. Client parses ZIP (JSZip) → loadCAPPackages()
3. Auto-detect layout (4 types: package/batch/manifest/loose)
4. Validate JSON Schema (AJV) → immediate errors
5. Extract File objects for images
6. Add to queue (React state)
7. Auto-start processing (concurrency limit: 5)
8. For each application:
   a. Compress images
   b. POST /api/verify (same as Workflow 1)
   c. Update queue item with result
9. Display results table + statistics
10. Inspector panel (side drawer) for detail view
```

**Key Files:**
- `lib/cap-loader.ts` (ZIP parsing, layout detection)
- `lib/cap-schema.json` (validation schema)
- `lib/cap-utils.ts` (validation wrapper)
- `app/dashboard/page.tsx` (queue UI + inspector)

### Workflow 3: Confidence-Based Triage

```
1. After verification completes:
   a. Calculate field-level confidence (0.0-1.0)
   b. Application confidence = minimum of all fields
2. Route based on confidence:
   - ≥85% + MATCH → auto_passed
   - <85% OR MISMATCH/NEEDS_REVIEW → needs_review
3. Auto-switch to "Needs Review" filter
4. Auto-open first needs_review item (lowest confidence)
5. Agent reviews in inspector panel:
   - View images (zoom/pan)
   - See field verdicts + confidence
   - Approve/Reject/Flag
6. Auto-advance to next needs_review item
7. Export dispositions (JSON) for shift handoff
```

**Key Files:**
- `lib/triage.ts` (confidence calculation, routing)
- `app/dashboard/page.tsx` (filter bar, inspector, approve/reject)

---

<a name="adding-features"></a>
## Adding New Features

### Adding a New Comparison Field

**Example:** Add "Bottler Name" comparison

**Step 1:** Update types (`lib/types.ts`)
```typescript
export interface ApplicationData {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  bottlerName?: string;  // Add this
}
```

**Step 2:** Add extraction field (`lib/extraction.ts`)
```typescript
// Update extraction prompt
const extractionPrompt = `...
- bottler_name_address: Bottler name and address (string or null)
...`;

// Update schema
export interface ExtractedLabel {
  // ...
  bottlerNameAddress: string | null;  // Add this
}
```

**Step 3:** Add comparison function (`lib/comparison.ts`)
```typescript
function compareBottlerName(
  appValue: string | undefined,
  labelValue: string | null
): FieldVerdict {
  if (!appValue) return { status: "MATCH", message: "Not required" };
  if (!labelValue) return { status: "MISMATCH", message: "Missing from label" };
  
  // Fuzzy match (similar to brand name)
  const normApp = normalize(appValue);
  const normLabel = normalize(labelValue);
  
  if (normApp === normLabel) return { status: "MATCH", message: "Exact match" };
  
  const similarity = levenshteinSimilarity(normApp, normLabel);
  if (similarity >= 0.9) {
    return { status: "NEEDS_REVIEW", message: "Close match", confidence: similarity };
  }
  
  return { status: "MISMATCH", message: "Does not match" };
}
```

**Step 4:** Integrate in `verifyLabel()` (`lib/comparison.ts`)
```typescript
const verdicts: FieldVerdict[] = [
  // ... existing verdicts
  compareBottlerName(applicationData.bottlerName, extracted.bottlerNameAddress),
];
```

**Step 5:** Add unit tests (`lib/comparison.test.ts`)
```typescript
describe('compareBottlerName', () => {
  it('should match normalized bottler names', () => {
    const result = compareBottlerName(
      'Old Distillery LLC',
      'OLD DISTILLERY LLC'
    );
    expect(result.status).toBe('MATCH');
  });
  
  // ... more test cases
});
```

**Step 6:** Update UI form (`app/upload/page.tsx`)
```typescript
<input
  type="text"
  value={applicationData.bottlerName || ''}
  onChange={(e) => setApplicationData({...applicationData, bottlerName: e.target.value})}
  placeholder="Bottler Name (optional)"
/>
```

---

### Adding a New Package Layout Type

**Example:** Support nested batch ZIPs (`batch/subfolder1/app-001/...`)

**Step 1:** Update types (`lib/types.ts`)
```typescript
export type PackageLayout = 
  | "package-zip"
  | "batch-zip"
  | "manifest-mode"
  | "loose-drop"
  | "nested-batch-zip";  // Add this
```

**Step 2:** Add detection logic (`lib/cap-loader.ts`)
```typescript
async function loadZipPackage(zipFile: File): Promise<LoadResult> {
  // ... existing detection logic
  
  // Check for nested batch (2+ levels deep)
  const hasNestedFolders = files.some(f => {
    const parts = f.split('/');
    return parts.length > 2 && parts[parts.length-1] === 'application.json';
  });
  
  if (hasNestedFolders) {
    return loadNestedBatchZip(zip, zipFile.name);
  }
  
  // ... rest of logic
}
```

**Step 3:** Implement loader function
```typescript
async function loadNestedBatchZip(
  zip: JSZip,
  source: string
): Promise<LoadResult> {
  // Find all application.json files at any depth
  const jsonFiles = Object.keys(zip.files)
    .filter(f => f.endsWith('application.json'));
  
  // For each application.json, extract cap + images
  for (const jsonPath of jsonFiles) {
    const folderPath = jsonPath.substring(0, jsonPath.lastIndexOf('/'));
    // ... extract cap and images from folderPath
  }
  
  // ... return result
}
```

**Step 4:** Document in CAP spec (`M3-AMENDMENT.md` or README)

---

### Adding a New Workflow State

**Example:** Add "escalated" state for supervisor review

**Step 1:** Update types (`lib/types.ts`)
```typescript
export type WorkflowState =
  | "pending"
  | "processing"
  | "auto_passed"
  | "needs_review"
  | "approved"
  | "rejected"
  | "flagged"
  | "escalated"  // Add this
  | "error";
```

**Step 2:** Add UI button (`app/dashboard/page.tsx`)
```typescript
<button
  onClick={() => handleEscalate(selectedItem.id)}
  className="px-4 py-2 bg-orange-600 text-white rounded"
>
  Escalate to Supervisor
</button>
```

**Step 3:** Add handler function
```typescript
const handleEscalate = (id: string) => {
  setQueue(queue => queue.map(item =>
    item.id === id
      ? { ...item, workflowState: "escalated", escalatedAt: Date.now() }
      : item
  ));
};
```

**Step 4:** Add filter button
```typescript
<button
  onClick={() => setFilterState("escalated")}
  className={filterState === "escalated" ? "active" : ""}
>
  Escalated ({statistics?.byWorkflowState.escalated || 0})
</button>
```

**Step 5:** Update statistics calculation (`lib/triage.ts`)
```typescript
export function calculateBatchStatistics(queue: QueueItem[]): BatchStatistics {
  const byWorkflowState = {
    // ... existing states
    escalated: queue.filter(q => q.workflowState === "escalated").length,
  };
  // ...
}
```

---

<a name="common-patterns"></a>
## Common Patterns

### Pattern 1: Defensive JSON Parsing

**Problem:** Claude sometimes returns JSON wrapped in markdown fences.

**Solution:**
```typescript
try {
  let jsonText = content.text.trim();
  // Strip markdown fences
  jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  extracted = JSON.parse(jsonText);
} catch (parseError) {
  console.error("JSON parse failed:", parseError);
  // Return low-confidence result, never crash
  extracted = {
    brandName: null,
    classType: null,
    // ... all nulls
    imageQuality: "low",
  };
}
```

**Always:**
- Strip markdown fences before `JSON.parse`
- Catch errors, never crash
- Return low-confidence result on failure
- Log errors for debugging

---

### Pattern 2: Performance Timing

**Pattern:**
```typescript
const start = performance.now();

// ... do work (API call, processing, etc.) ...

const processingMs = Math.round(performance.now() - start);

return { result, processingMs };
```

**Always display timing:**
- In results panel: "Completed in 3.2 seconds"
- In batch statistics: "Avg time: 4.0s"
- Live timer during processing: "Checking… 1.8s"

**Why:** Speed is a critical success metric (< 5s requirement).

---

### Pattern 3: Normalization for Comparison

**Pattern:**
```typescript
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .replace(/['"''""]/g, '')  // Strip quotes
    .replace(/[—–]/g, '-');    // Normalize dashes
}
```

**Use for:**
- Brand name comparison
- Class/type comparison
- Any identity field

**Do NOT use for:**
- Government warning (exact match required)
- Numeric fields (parse separately)

---

### Pattern 4: Confidence Calculation

**Pattern:**
```typescript
function calculateFieldConfidence(verdict: FieldVerdict): number {
  let confidence = 1.0;
  
  // Factor 1: Extraction success
  if (!verdict.extracted) confidence *= 0.5;
  
  // Factor 2: Match strength
  if (verdict.status === "MISMATCH") confidence *= 0.0;
  else if (verdict.status === "NEEDS_REVIEW") confidence *= 0.7;
  
  // Factor 3: Image quality
  if (imageQuality === "low") confidence *= 0.5;
  else if (imageQuality === "medium") confidence *= 0.75;
  
  return Math.max(0, Math.min(1, confidence));
}

// Application confidence = minimum of all fields
const applicationConfidence = Math.min(...fieldConfidences);
```

**Thresholds:**
- `≥0.85`: High confidence (auto-pass if MATCH)
- `0.60-0.84`: Medium confidence (needs review)
- `<0.60`: Low confidence (flag for careful review)

---

### Pattern 5: Error Accumulation (Non-Fatal Failures)

**Pattern:**
```typescript
const result: LoadResult = {
  applications: [],
  errors: [],
  layout: "batch-zip",
};

for (const folder of subfolders) {
  try {
    const cap = parseApplicationJSON(jsonText);
    const images = extractImages(folder);
    result.applications.push({ cap, images, source: folder });
  } catch (error: any) {
    // Log error, continue processing rest
    result.errors.push({
      source: folder,
      message: error.message,
    });
  }
}

return result; // Partial success is better than total failure
```

**Why:** One bad package shouldn't block entire batch.

---

<a name="testing-strategy"></a>
## Testing Strategy

### Unit Tests (Jest)

**Coverage:**
- `lib/comparison.ts` - 63 tests (all comparison functions)
- `lib/warning-text.ts` - 12 tests (government warning logic)
- `lib/cap-utils.ts` - 8 tests (validation, conversion)

**Run:**
```bash
npm test
npm test -- --coverage
```

**Pattern:**
```typescript
describe('compareBrandOrClass', () => {
  it('should match after normalization', () => {
    const result = compareBrandOrClass(
      'brandName',
      "Stone's Throw",
      "STONE'S THROW"
    );
    expect(result.status).toBe('MATCH');
    expect(result.message).toContain('match');
  });
  
  it('should flag near-miss with Levenshtein', () => {
    const result = compareBrandOrClass(
      'brandName',
      'Old Distillery',
      'Old Distillry'  // Missing 'e'
    );
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});
```

---

### Integration Tests (Fixtures)

**8 Test Labels:**
1. `clean-match.png` - All correct (happy path)
2. `case-mismatch.png` - Brand case differs
3. `wrong-abv.png` - Wrong ABV
4. `warning-titlecase.png` - Title case warning
5. `warning-modified.png` - Modified warning text
6. `warning-missing.png` - No warning
7. `glare-angle.png` - Poor image quality
8. `near-miss-brand.png` - Typo in brand

**Run:**
```bash
npm run test:fixtures
```

**Generates:**
```
test-labels/
├── manifest.md           # Expected verdicts
├── fixtures.json         # Configuration + ground truth
└── *.png                 # Test images
```

---

### Evaluation Harness (Ground Truth)

**200 Synthetic Applications:**
- 15% defect rate (30 defective)
- 8 defect types (brand-mismatch, wrong-abv, warning-titlecase, etc.)
- Controlled randomness (seed = 42)

**Run:**
```bash
npm run eval
```

**Output:**
```
Overall accuracy: 64%
By defect type:
  - warning-missing: 100%
  - warning-modified: 100%
  - brand-mismatch: 58%
  ...
```

**Files:**
- `scripts/run-evals.ts` - Harness script
- `sample-data/ground-truth.json` - Expected verdicts
- `sample-data/applications/` - CAP packages

---

<a name="deployment"></a>
## Deployment

### Vercel Deployment

**Setup:**
```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Set environment variable
vercel env add ANTHROPIC_API_KEY

# Deploy
vercel --prod
```

**Environment Variables:**
- `ANTHROPIC_API_KEY` - Required (get from console.anthropic.com)
- `NEXT_PUBLIC_*` - Optional (client-side env vars)

**Build Configuration:**
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next`
- Install command: `npm install`

---

### Alternative Deployment (Azure/Bedrock)

**Why:** Agency networks may block direct Anthropic API access.

**Option 1: Azure OpenAI**
- Use Azure's Claude offering (via Azure Marketplace)
- Update `lib/extraction.ts` to use Azure endpoint
- No code changes (same Claude models)

**Option 2: AWS Bedrock**
- Use Bedrock's Claude access
- Update SDK initialization:
  ```typescript
  import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
  // ... configure AWS credentials
  ```

**Documentation:** See README.md § Deployment for full instructions.

---

<a name="troubleshooting"></a>
## Troubleshooting

### Issue: "Failed to extract label data"

**Symptom:** API returns error, no verdicts displayed.

**Causes:**
1. Anthropic API key invalid/missing
2. Image too large (>4.5 MB after compression)
3. Anthropic API timeout (>15s)
4. Rate limit exceeded

**Debug:**
1. Check API key: `echo $ANTHROPIC_API_KEY`
2. Check image size: "Compressing..." should appear
3. Check logs: `vercel logs` or browser console
4. Check API status: status.anthropic.com

**Fix:**
- Verify API key in `.env.local`
- Reduce image quality (config.ts: `IMAGE_QUALITY = 0.75`)
- Retry after rate limit cooldown

---

### Issue: CAP Package Fails to Load

**Symptom:** "Unrecognized package format" error.

**Causes:**
1. ZIP structure doesn't match 4 expected layouts
2. `application.json` malformed/missing
3. JSON Schema validation failure

**Debug:**
1. Check ZIP structure: `unzip -l package.zip`
2. Check JSON validity: `cat application.json | jq .`
3. Check error details: Browser console → "CAP Package Loading Errors:"

**Expected structures:**
- Package-ZIP: `application.json` at root
- Batch-ZIP: Subfolders with `application.json` each
- Manifest-mode: `applications.json` (array) at root
- Loose-drop: Multiple files dragged together

**Fix:**
- Verify ZIP structure matches one of 4 layouts
- Validate JSON against schema: `lib/cap-schema.json`
- Check ttbId format: 14 numeric digits (`^[0-9]{14}$`)

---

### Issue: Low Extraction Accuracy

**Symptom:** Claude extracts wrong text, confidence is low.

**Causes:**
1. Poor image quality (blurry, angled, glare)
2. Model not optimal (haiku-4-5 less accurate than sonnet)
3. Extraction prompt needs tuning

**Debug:**
1. Check `imageQuality` field in response (should be "high")
2. Try with known-good test label: `test-labels/clean-match.png`
3. Check extraction prompt: `lib/extraction.ts`

**Fix:**
- Upgrade model: `ANTHROPIC_MODEL = "claude-sonnet-4-6"` (slower, more accurate)
- Enhance prompt: Add examples, clarify instructions
- Improve image quality: Better lighting, straight-on angle
- Add OCR pre-processing: Tesseract.js for text hints

---

### Issue: Slow Processing (>5 seconds)

**Symptom:** Timer shows >5s, user complains about speed.

**Causes:**
1. Large images (compression insufficient)
2. Slow model (sonnet vs haiku)
3. Network latency (Anthropic API far from user)
4. Multi-image extraction (1-4 images in one call)

**Debug:**
1. Check image sizes after compression (should be <3 MB each)
2. Check model: `ANTHROPIC_MODEL` (haiku fastest)
3. Check timing breakdown: `processingMs` in response
4. Check network: `curl https://api.anthropic.com` from server

**Fix:**
- Reduce compression quality: `IMAGE_QUALITY = 0.75`
- Reduce max dimension: `IMAGE_MAX_DIMENSION = 1536`
- Use haiku model: `ANTHROPIC_MODEL = "claude-haiku-4-5"`
- Optimize prompt: Shorter extraction prompt
- Consider caching: Cache extraction results by image hash

---

## Quick Reference

### Configuration Constants (`lib/config.ts`)

| Constant | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_MODEL` | `"claude-haiku-4-5"` | Model ID (haiku fastest, sonnet most accurate) |
| `ANTHROPIC_MAX_TOKENS` | `1500` | Max response length |
| `ANTHROPIC_TIMEOUT_MS` | `15000` | API timeout (15s) |
| `IMAGE_MAX_DIMENSION` | `2048` | Max image size (px) |
| `IMAGE_QUALITY` | `0.85` | JPEG compression quality |
| `CONFIDENCE_THRESHOLD` | `0.85` | Auto-pass threshold |
| `LOW_CONFIDENCE_THRESHOLD` | `0.60` | Review flag threshold |
| `LEVENSHTEIN_SIMILARITY_THRESHOLD` | `0.9` | Fuzzy match threshold |

### Key Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
npm start                # Start production server

# Testing
npm test                 # Run unit tests
npm test -- --coverage   # With coverage report
npm run test:fixtures    # Run 8 fixture tests

# Evaluation
npm run eval             # Run accuracy evaluation
npm run labels:generate  # Generate test labels from HTML

# Data Generation
npm run generate:samples # Create 200 synthetic applications
```

### Import Patterns

```typescript
// Types
import type { VerificationResult, FieldVerdict, QueueItem } from '@/lib/types';

// Business Logic
import { verifyLabel } from '@/lib/comparison';
import { extractLabelData } from '@/lib/extraction';
import { verifyGovernmentWarning } from '@/lib/warning-text';

// Utilities
import { applicationDataToCAP, validateCAP } from '@/lib/cap-utils';
import { loadCAPPackages } from '@/lib/cap-loader';
import { triageApplication, calculateBatchStatistics } from '@/lib/triage';

// Components
import AppNavigation from '@/components/AppNavigation';
import ApplicationForm from '@/components/ApplicationForm';
```

---

**Next Steps:**
1. Read `ARCHITECTURE-DECISIONS.md` for context on why things are this way
2. Review `docs/decisions/` for session-by-session decision logs
3. Run `npm test` to verify your environment
4. Try modifying a test label and re-running fixtures
5. Experiment with confidence thresholds in `lib/config.ts`

**Questions?** Check:
- README.md - Setup instructions
- SPEC.md - Original specification
- CLAUDE.md - Project guidance for AI assistants
- GitHub Issues - Known problems and feature requests
