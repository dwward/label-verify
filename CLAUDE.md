# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**SPEC.md is the source of truth. Work one milestone at a time and stop for review after each.**

## Project Overview

This is an AI-powered alcohol label verification web application prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance agents. The app compares uploaded alcohol label images against application form data and produces per-field verification verdicts using Claude vision for text extraction and deterministic logic for comparison.

**Critical success criteria:**
- **Speed: Results in under 5 seconds** — A prior vendor pilot failed at 30–40 seconds. Display elapsed processing time prominently in the UI.
- **Three-state verdicts:** `MATCH` (green), `MISMATCH` (red), `NEEDS_REVIEW` (yellow) — Never cry wolf on trivial differences
- **Dual matching philosophy:** Fuzzy matching for brand/identity fields (handles "STONE'S THROW" vs "Stone's Throw"), but EXACT character-level matching for the Government Warning statement

## Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript
- **Styling:** Tailwind CSS
- **AI:** Anthropic API with `@anthropic-ai/sdk`
  - Primary model: `claude-haiku-4-5` (configured in [lib/config.ts](lib/config.ts))
  - Model ID is a single swappable constant
- **Image handling:** Client-side compression/resize before upload (target: max 2048px dimension, JPEG quality 0.85) to stay under Vercel's 4.5 MB body limit
- **Deployment:** Vercel
- **No database** — All processing is request/response with no persistence (deliberate privacy choice)

## Development Commands

```bash
# Install dependencies
npm install

# Set up environment (copy and edit .env.local.example)
cp .env.local.example .env.local
# Add: ANTHROPIC_API_KEY=your_key_here

# Run development server
npm run dev

# Run tests (unit tests for comparison logic)
npm test

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

**Always-Batch Queue:** No separate batch mode. Single entry = batch of one. Two entry modalities:

1. **Test Bench** - Manual form entry (4 fields + 1-4 images)
2. **CAP Packages** - Drag-and-drop .zip files or folders

Both feed a unified results queue with auto-processing (concurrency limit: 5).

```
User enters data via Test Bench OR drops CAP package
         ↓
lib/image-compression.ts → Compress/resize client-side
         ↓
Queue orchestrator → /api/verify (accepts 1-4 images per application)
         ↓
lib/extraction.ts → Claude vision call (multi-image) → ExtractedLabel JSON with foundOn
         ↓
lib/comparison.ts → Pure deterministic functions → FieldVerdict[]
         ↓
UI displays color-coded verdicts + foundOn panel badges + timing
```

**Key principle:** The LLM extracts, deterministic code judges. All comparison logic lives in pure functions with unit tests.

## Core Logic Rules

### Extraction (lib/extraction.ts)
- Single Claude vision API call per image
- Returns structured JSON matching `ExtractedLabel` schema
- Transcribes verbatim (no normalization during extraction)
- Character-level transcription of government warning text
- Sets `max_tokens: 1500`
- Times the call with `performance.now()`
- Defensive parsing: strips markdown fences, handles parse failures gracefully
- Low confidence → caps all verdicts at `NEEDS_REVIEW`

### Field Comparison (lib/comparison.ts) — Fuzzy Logic

General normalization for identity fields: lowercase, trim, collapse whitespace, strip quotes, normalize typographic characters.

**Brand name & class/type:**
- Exact after normalization → `MATCH`
- Levenshtein similarity ≥ 0.9 → `NEEDS_REVIEW` (possible typo/OCR artifact)
- Otherwise → `MISMATCH`
- Missing from label → `MISMATCH`

**Alcohol content:**
- Parse numeric percentage (handles "45% Alc./Vol.", "90 Proof" where proof ÷ 2 = ABV)
- Numbers equal (within 0.01 tolerance) → `MATCH`
- Numbers differ → `MISMATCH` (hard regulatory number)
- Unparseable → `NEEDS_REVIEW`
- Bonus: detect internal inconsistency between proof and ABV on same label

**Net contents:**
- Normalize units (750 mL = 750ml = 0.75 L)
- Compare numerically → `MATCH`/`MISMATCH`
- Unparseable → `NEEDS_REVIEW`

### Government Warning (lib/warning-text.ts) — EXACT MATCH

**Statutory text from 27 CFR 16.21** (stored as constant):
```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

**Zero-tolerance verification (report ALL failures):**
1. Warning missing → `MISMATCH`
2. "GOVERNMENT WARNING:" not in ALL CAPS → `MISMATCH` (title case is a real rejection case)
3. Header not bold → `NEEDS_REVIEW` (best-effort detection from photo)
4. Body text differs → `MISMATCH` with word-level diff
   - Only allowed normalizations: collapse whitespace/line breaks, unify hyphenation artifacts
   - Case compared exactly
   - ANY word difference, omission, or punctuation change → `MISMATCH`

**IMPORTANT:** Unit-test this function extensively with cases for:
- Correct text
- Title-case header
- One-word substitution
- Missing sentence (2)
- Extra marketing text
- Line-wrap hyphenation (should pass)

### Overall Verdict
`MISMATCH` if any field is `MISMATCH`; else `NEEDS_REVIEW` if any field is `NEEDS_REVIEW`; else `MATCH`.

## Multi-Image Processing (G3)

- `/api/verify` accepts 1-4 images per application
- All images sent in ONE Anthropic API call  
- Model merges findings with `foundOn` field ("front" | "back" | "neck" | "unknown")
- VerdictCards show panel location badges (e.g., "back label")
- No image concatenation (preserves quality)
- Rationale: Government warning frequently on back label; multi-image prevents false "warning missing" flags

## API Routes

### POST /api/verify
- **Single endpoint** (no /api/batch route)
- Accepts `multipart/form-data`: `image`, `image1`, `image2`, `image3` (1-4 files) + `application` (JSON string)
- Validates: at least one image present, type jpeg/png/webp, each ≤ 4.5 MB
- Returns `VerificationResult` as JSON
- Hard timeout: 15s on Anthropic call
- Errors return `{ error: string }` with plain-English messages

### Queue Orchestration
- **Client-side processing** — No /api/batch route
- Main page queue calls /api/verify multiple times with concurrency limit of 5 (semaphore)
- Each image compressed client-side before upload (see [lib/image-compression.ts](lib/image-compression.ts))
- Use `Promise.allSettled` with semaphore pattern to avoid firing 300 requests at once
- Benefits:
  - Avoids Vercel function timeout issues with large batches
  - Stays under 4.5 MB body limit per request
  - Real-time progress updates as each verification completes
  - Failed images don't block the entire batch

## UI Requirements

**Design principle:** A 73-year-old with minimal tech experience must succeed on first try.

- Minimum 16px text, large click targets, high contrast
- Every verdict with icon + color + word (never color alone for accessibility)
- ✓ green "Match", ✗ red "Mismatch", ⚠ yellow "Needs Review"
- No technical jargon — errors read like helpful colleague
- Live processing timer ("Checking… 1.8s")
- Pre-fill sample data via "Load sample" link for instant demo

### Single Label Page (app/page.tsx)
- Left: application data form (collapsible optional fields)
- Right: drag-and-drop upload with preview
- Big "Verify Label" button (disabled until form + image present)
- Results: overall verdict banner + VerdictCard per field + timing badge
- Yellow note if image quality issues detected

### Unified Queue Interface (app/page.tsx)

**Entry Area 1: Test Bench**
- Application data form (4 required fields)
- Image upload (1-4 images per application)
- Sample dropdown with test cases + dataset loader

**Entry Area 2: CAP Package Drop Zone**
- Drag-and-drop .zip, folders, or loose files
- Four package layouts supported (see CAP format in SPEC.md)
- Progressive validation and processing

**Results Section**
- Queue progress bar
- Results table (expandable rows)
- Triage sort (errors → mismatches → needs review → matches)
- CSV export button

## Test Labels

Located in [test-labels/](test-labels/) with [manifest.md](test-labels/manifest.md) documenting each:

1. `clean-match.png` — All correct
2. `case-mismatch.png` — Brand case differs (should MATCH)
3. `wrong-abv.png` — Wrong ABV (MISMATCH)
4. `warning-titlecase.png` — Title case warning (MISMATCH)
5. `warning-modified.png` — Modified warning text (MISMATCH with diff)
6. `warning-missing.png` — No warning (MISMATCH)
7. `glare-angle.png` — Quality issues (exercises quality note)
8. `near-miss-brand.png` — Typo in brand (NEEDS_REVIEW)

Generate with AI image tools or build in HTML/CSS and screenshot for pixel-perfect text.

## Phase 4 Features (Advanced Batch Workflow & UX)

These features were implemented beyond the original specification to create a production-ready batch review workflow for TTB agents.

### Dashboard UI (UX1)
- Master-detail inspector (60/40 split when open, 100/0 when closed)
- Workflow state badges: auto_passed, approved, rejected, needs_review, pending, error
- Filter bar: All, Needs Review, Passed, Rejected, Failed Import
- Batch statistics: total count, by state, avg confidence, processing time (min/max/avg)
- Expandable row detail with full verdict breakdown
- Triage sort: errors → mismatches → needs review → matches
- Clear All button with confirmation dialog
- CSV export for batch results

### Confidence-Based Triage (UX2)
- Field-level confidence calculation (0.0-1.0 based on image quality, extraction success, comparison strength)
- Auto-routing: ≥85% confidence → auto_passed, <60% → needs_review
- Confidence bars in results table (color-coded: green/yellow/red)
- Average confidence displayed in batch statistics
- Weakest field identification in needs_review reason text

### Manual Review Workflow (UX3)
- Approve/Reject buttons for needs_review items in inspector
- Auto-advance to next needs_review item after decision
- Workflow state transitions: needs_review → approved/rejected
- Review timestamp tracking (reviewedAt field)
- Review notes field (future: persist to CSV export)
- Visual state badges in inspector header

### Image Zoom & Pan (UX4)
- Multi-level zoom: 100%, 200%, 300% with labeled buttons
- Click anywhere on image/container to cycle through zoom levels
- Drag-to-pan when zoomed (works on container, not just image)
- Recenter button with crosshair icon to reset pan position
- Delta-based drag prevents cursor stickiness
- 3px movement threshold distinguishes click from drag
- Visual cursor feedback: zoom-in (at 100%), grab (when zoomed), grabbing (while dragging)

### Navigation & Import UX (UX5)
- Sidebar navigation with TTB logo, Upload Applications / Batch Dashboard links
- Active route highlighting
- Review queue badge showing needs_review count
- Inline CAP import: drag-and-drop directly in dashboard sidebar (continuous workflow)
- Click-to-browse: hidden file input triggered by clicking upload zone text
- Image persistence: three-tier strategy (window globals → sessionStorage → localStorage)
- "Images Not Available" placeholder when File objects lost after browser refresh
- TTB logo favicon in browser tab
- Version info footer

## Critical Implementation Notes

1. **Never expose API key client-side** — All Anthropic calls happen in API routes
2. **Compress images client-side before upload** — Vercel has 4.5 MB body limit; target max 2048px dimension, JPEG quality 0.85
3. **No persistence of uploaded images** — In-memory processing only (privacy by design)
4. **All comparison logic must be pure functions** — Enables thorough unit testing
5. **Model ID in single constant** — Easy to swap `claude-haiku-4-5` → `claude-sonnet-4-6`
6. **Timing displayed everywhere** — Speed is a critical user-facing metric
7. **Defensive parsing** — Never crash on malformed LLM output
8. **Image quality gates verdicts** — Low confidence caps everything at `NEEDS_REVIEW`
9. **Batch mode = client orchestration** — No /api/batch route; batch page manages concurrency and calls /api/verify repeatedly

## Out of Scope

- Authentication/user accounts
- Database/persistence layer
- COLA integration
- Beverage-type-specific rule engines (note as future work in README)
- Mobile-specific layouts (desktop-first)

## Milestones

Work one milestone at a time, stop for review after each:

### Phase 1: Core Verification Engine ✅ COMPLETED
- ✅ **M1** — Single-label happy path (extraction, basic comparison, /api/verify, UI with timer)
- ✅ **M2** — Warning checker + comparison hardening (full rule set, unit tests)
- ✅ **G1** — Always-batch queue refactor (unified architecture, no separate batch mode)

### Phase 2: Package Loading & Multi-Image ✅ COMPLETED
- ✅ **G2** — CAP loader (4 layouts, JSZip, drop zones, validation)
- ✅ **G3** — Multi-image extraction (1-4 images, foundOn tracking, panel badges)

### Phase 3: UI Polish & Deployment ✅ COMPLETED
- ✅ **M4** — Polish, test labels, deployment (8 test labels generated, Vercel configured)

### Phase 4: Advanced Batch Workflow & UX ✅ COMPLETED
- ✅ **UX1** — Dashboard UI (master-detail inspector, filter bar, batch statistics, triage sort)
- ✅ **UX2** — Confidence-based triage (field-level confidence, auto-routing, confidence bars)
- ✅ **UX3** — Manual review workflow (approve/reject buttons, auto-advance, workflow states)
- ✅ **UX4** — Image zoom & pan (multi-level zoom, drag-to-pan, recenter button)
- ✅ **UX5** — Navigation & import UX (sidebar nav, inline CAP import, click-to-browse, image persistence)

### Phase 5: Evaluation & Accuracy ⏳ IN PROGRESS
- ✅ **G4a** — Sample data generator (scripts/generate-sample-data.ts creates 200 realistic COLA packages with 8 defect types, 15% defect rate, controlled randomness)
- ✅ **G4b** — Evaluation harness (scripts/run-evals.ts runs accuracy tests, produces metrics by defect type, validates against ground truth)
- ⏳ **G4c** — Accuracy dashboard UI (integrate evaluation metrics into main app, display accuracy by defect type, historical tracking, visual charts)

### Stretch Goals (Optional)
- 🎯 **Accuracy Improvement** — Improve from 64% to 85%+ overall accuracy (see [STRETCH-GOAL-ACCURACY.md](STRETCH-GOAL-ACCURACY.md))
  - Current bottleneck: Government Warning extraction from clean synthetic labels (61% accuracy)
  - Perfect defect detection (100% on warning-missing, warning-modified, warning-titlecase)
  - Quick wins to try: Switch to Sonnet 4.6, enhance extraction prompt, improve label rendering

## Important Context

- Target user: 73-year-old TTB agent with minimal tech experience
- Real-world constraint: Prior vendor pilot at 30–40s was abandoned
- Peak season: 200–300 applications at once (drives batch requirement)
- Network constraint: Agency blocks many outbound ML endpoints (note Azure/Bedrock path in README)
- The "STONE'S THROW" problem: Fuzzy matching prevents false alarms on trivial differences
- The title-case rejection: Actual failure mode agents catch in the field
