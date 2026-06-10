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

```
User uploads label + enters application data
         ↓
lib/image-compression.ts → Compress/resize client-side
         ↓
API route /api/verify (single endpoint for both single & batch)
         ↓
lib/extraction.ts → Claude vision call → ExtractedLabel JSON
         ↓
lib/comparison.ts → Pure deterministic functions → FieldVerdict[]
         ↓
UI displays color-coded verdicts + timing

Batch mode: Client orchestrates multiple /api/verify calls with concurrency limit 5
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

## API Routes

### POST /api/verify
- **Single endpoint for both single and batch modes**
- Accepts `multipart/form-data`: `image` (file) + `application` (JSON string)
- Validates: image present, type jpeg/png/webp, ≤ 4.5 MB (Vercel body limit)
- Returns `VerificationResult` as JSON
- Hard timeout: 15s on Anthropic call
- Errors return `{ error: string }` with plain-English messages

### Batch Mode Implementation
- **Client-side orchestration** — No /api/batch route needed
- Batch page calls /api/verify multiple times with concurrency limit of 5
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

### Batch Page (app/batch/page.tsx)
- Multi-file drop zone (up to 50 files in prototype)
- Data entry modes: "Same data for all" OR "CSV upload"
- Include CSV template download link
- **Client-side orchestration:**
  - Compress each image with [lib/image-compression.ts](lib/image-compression.ts)
  - Call /api/verify with concurrency limit of 5 (semaphore pattern)
  - Update progress bar in real-time as each verification completes
- Results table with expandable rows
- "Download results (CSV)" button

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

## Build Order (From SPEC)

Work one milestone at a time, stop for review after each:

**M1** — Skeleton & single-label happy path (extraction, basic comparison, /api/verify, UI with timer)
**M2** — Warning checker & comparison hardening (full rule set, unit tests)
**M3** — Batch (multi-upload, concurrency limiting, CSV export)
**M4** — Polish, test labels, docs, deploy to Vercel

## Important Context

- Target user: 73-year-old TTB agent with minimal tech experience
- Real-world constraint: Prior vendor pilot at 30–40s was abandoned
- Peak season: 200–300 applications at once (drives batch requirement)
- Network constraint: Agency blocks many outbound ML endpoints (note Azure/Bedrock path in README)
- The "STONE'S THROW" problem: Fuzzy matching prevents false alarms on trivial differences
- The title-case rejection: Actual failure mode agents catch in the field
