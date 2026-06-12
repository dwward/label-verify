# SPEC: AI-Powered Alcohol Label Verification App (TTB Prototype)

> **How to use this file:** Place it in the root of your project folder as `SPEC.md`.
> Then start Claude Code and say: *"Read SPEC.md. Build this project following the Build Order
> at the bottom. Work through one milestone at a time and stop for my review after each."*

---

## 1. Overview & Domain Context

Build a web application prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance
agents. The app compares uploaded alcohol label images against application form data and
produces a per-field verification verdict, so agents can stop doing visual matching by hand.

**Core flow:** Agent loads application data → attaches label image(s) → app extracts label text
using Claude vision → app compares extracted fields to application data using deterministic
logic → app displays a clear verdict per field.

This is a standalone proof-of-concept. No COLA integration, no auth, no PII storage.

### Domain Research Findings (treat as ground truth)

These facts come from TTB's public documentation and inform the design:

1. **The system of record is COLA.** Industry members apply for label approval through
   TTB's "COLAs Online" system using Form TTB F 5100.31 ("Application for and
   Certification/Exemption of Label/Bottle Approval", rev. 04/2023). COLAs Online is the
   sole internal database TTB's Alcohol Labeling and Formulation Division uses to track
   all label submissions. Agents never type application data — they pull up an existing
   record. **Our manual-entry form simulates the COLA record** because direct COLA
   integration was explicitly ruled out of scope by the IT stakeholder.

2. **One application : many images.** A single COLA application can include multiple
   label images — front, back, neck. The government warning frequently appears on the
   BACK label. Single-image verification would therefore false-flag "warning missing"
   on realistic data. Each TTB record is keyed by a 14-character TTB ID.

3. **The Public COLA Registry** (ttbonline.gov, no login required) exposes approved
   records — application data and label images, from 1999/2003 onward — as public
   records (data.gov lists it under a CC0 license). Real approved applications are
   therefore legitimate source material for sample data.

4. **A public Kaggle dataset exists**: "TTB COLAs Demo" by COLA Cloud
   (kaggle.com/datasets/colacloud/ttb-colas-demo) — a parsed sample of the registry
   (~4M records in the full registry). It includes structured fields and OCR-derived
   features (e.g., `ocr_abv`, `ocr_volume`).

5. **Form 5100.31 field taxonomy.** The form mixes two kinds of fields:
   - **Administrative** (identify the filer; mostly NOT on the label): applicant name &
     address, basic permit / plant registry / brewer's number, serial number, mailing
     address, signature, date, type of application.
   - **Label-verifiable** (must/should appear on the artwork): brand name, fanciful name
     (if any), class/type designation, alcohol content, net contents, bottler/producer
     name & address, country of origin (imports), and wine-only conditionals (varietal,
     appellation, vintage).
   Verdicts are computed ONLY for label-verifiable fields. Administrative fields are
   carried and displayed as record context, never "verified" against artwork.
   Wine/beer conditional fields exist in the schema but comparison logic for them is
   out of scope (distilled-spirits focus) — mark as future work in README.

### Hard Requirements (in priority order)

1. **Speed: results in under 5 seconds** for a single application. A prior vendor pilot failed at
   30–40 seconds and agents abandoned it. Display elapsed processing time in the UI next to
   every result.
2. **Three-state verdicts, not binary.** Each field resolves to one of:
   - `MATCH` (green) — confident match after normalization
   - `MISMATCH` (red) — confident mismatch
   - `NEEDS_REVIEW` (yellow) — ambiguous; a human should look
   This reflects how real agents work: "STONE'S THROW" vs "Stone's Throw" is a match in
   substance, and the tool must not cry wolf on trivial differences.
3. **Government Warning statement: EXACT match required.** This is the opposite of fuzzy
   matching. See §5 for the statutory text and rules. Getting the dual matching philosophy
   right (fuzzy for brand, exact for warning) is the most important correctness requirement
   in this project.
4. **Batch mode via application packages.** Agents receive 200–300 applications at once during peak season. Support
   multi-package upload with a results table and CSV export.
5. **Extreme UI simplicity.** Target user benchmark: a 73-year-old with minimal tech
   experience. Half the agent workforce is over 50. One obvious action per screen, large
   buttons, large readable text, color + icon + text for every verdict (never color alone),
   zero jargon.
6. **Graceful handling of imperfect images** (angle, glare, blur). The vision model handles
   most of this; when extraction confidence is low, say so and return `NEEDS_REVIEW` rather
   than guessing.

---

## 2. Architecture

### Always-Batch Design (single = batch of one)

There is no separate "batch mode." The engine always processes a **queue of application
records**. A manual single entry is a queue of length one. Consequences:

- One verification pipeline, one progress mechanism, one results table, one CSV export.
- The results table auto-expands its row when the queue has exactly one item.
- No "same data for all images" concept — it does not model reality (no real batch shares form data).

### Two Entry Modalities Feed the Same Queue

1. **Test Bench (manual entry).** A form labeled "Application Data (as filed in COLA)". User types one application's data, attaches
   1–4 images, submits → becomes one queue record. Includes "Load sample" prefill.
   This is the reviewer demo path.
2. **Application Packages (drag-and-drop).** Users drop package zips, folders of files,
   or a manifest+images set (format in §3). Multiple packages may be dropped
   together. Each package **validates independently and starts processing as soon as it
   validates** (progressive — do not wait for the full set). Invalid packages remain in
   the queue in a "needs attention" state with a plain-English reason; valid ones proceed.

### Processing Rules

- All zip handling is CLIENT-SIDE (JSZip). Never upload a whole zip to the server —
  Vercel's ~4.5MB body limit forbids it. The browser unpacks, validates, then streams
  per-application calls to `/api/verify`.
- Client-side image compression/resize before upload (canvas), keeping each request
  small and extraction fast.
- Concurrency limit: 5 simultaneous `/api/verify` calls (simple semaphore in the client
  orchestrator).
- Per-application timing displayed; the <5s target applies per application.

### Triage & Correction

Results table sorts MISMATCH and NEEDS_REVIEW to the top. Expanding a flagged row exposes the extracted label values as editable; editing
recomputes verdicts client-side from comparison logic only (no new extraction call) and
marks the result "verified with agent correction" — distinguishable in UI and CSV export.

---

## 3. COLA Application Package (CAP) Format v1.0

The interchange format pairing application data with label imagery. Define this in the
README under its own heading; its production analog is an export from COLA.

### Package Layouts (loader must accept and auto-detect)

1. **Package zip / folder:** contains one `application.json` + its image files.
2. **Batch zip:** contains multiple subfolders, each a package per layout 1.
3. **Manifest mode:** a root `applications.json` (JSON array of application objects)
   whose records reference image filenames elsewhere in the same zip/drop.
4. **Loose drop:** an `application.json` dropped together with its image files.

### Schema (`application.json`)

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
    "fancifulName": null,
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

- Everything under `label.*` is the verifiable set → drives verdicts.
- Everything else is administrative context → displayed, never verified.
- Validation errors must be plain-English and specific: "back.png listed in
  application.json but not found in the package"; "two applications share serial
  26-0001"; "alcoholContent missing — cannot verify ABV".
- Write a JSON Schema file (`lib/cap-schema.json`) and validate against it; include a
  "Download CAP template" link in the drop zone UI.

---

## 4. Multi-Image Extraction

`/api/verify` accepts 1–4 images per application. Send ALL images in ONE Anthropic API call (the Messages API accepts multiple image blocks in a
single user message). Prompt the model to merge findings across panels into one
`ExtractedLabel`, and add a `foundOn` field per extracted item ("front" | "back" | "neck"
| "unknown"). Surface `foundOn` in verdict cards (e.g., "Government warning — back
label"). Do NOT concatenate images into one bitmap (resolution loss on small warning
text, confused spatial reasoning, muddled quality reporting).

---

## 5. Core Logic Rules

### 5.1 Extraction (lib/extraction.ts)

One Claude vision API call per application (handles 1–4 images in a single call). Send the images plus a prompt that instructs the model to:

- Transcribe label fields verbatim (do not normalize, do not correct)
- Transcribe the government warning **character-for-character as printed**, preserving case
- Report whether the warning header is in all caps and whether it appears bold
- Assess image quality and list legibility issues
- For each extracted field, indicate which panel it was found on ("front" | "back" | "neck" | "unknown")
- Respond with **only** a JSON object matching the `ExtractedLabel` schema — no prose,
  no markdown fences

Implementation notes:
- Set `max_tokens: 1500`
- Parse defensively: strip accidental ``` fences before `JSON.parse`; on parse failure,
  return a low-confidence result that drives `NEEDS_REVIEW`, never a crash
- Time the call with `performance.now()` and return elapsed ms
- If extraction `confidence` is `"low"` or `readable` is false, every field verdict caps at
  `NEEDS_REVIEW` with explanation "Image quality too low for confident verification —
  request a clearer image"

### 5.2 Field Comparison (lib/comparison.ts) — fuzzy, judgment-based

All pure functions. General normalization applied to both sides before comparing:
lowercase, trim, collapse internal whitespace, strip surrounding quotes, normalize
typographic apostrophes/quotes (`'` → `'`).

**Brand name & class/type:**
- Exact after normalization → `MATCH` ("Differs only in capitalization/spacing" if raw differed)
- Levenshtein similarity ≥ 0.9 after normalization → `NEEDS_REVIEW` ("Very similar but not
  identical — possible typo or OCR artifact")
- Otherwise → `MISMATCH`
- Label field missing → `MISMATCH` ("Not found on label")

**Alcohol content:**
- Parse the numeric percentage out of both strings (handle "45% Alc./Vol.", "45 % ALC/VOL",
  "Alc. 45% by Vol.", "90 Proof" — proof ÷ 2 = ABV)
- Numbers equal (within 0.01 tolerance for float noise) → `MATCH`
- Numbers differ → `MISMATCH` (this is a hard regulatory number — no fuzzy tolerance)
- Can't parse a number from the label → `NEEDS_REVIEW`
- Bonus: if both % and proof appear on the label and disagree with each other, flag
  `MISMATCH` with explanation "Label's proof and ABV are internally inconsistent"

**Net contents:**
- Normalize units (750 mL = 750ml = 750 ML = 0.75 L), compare numerically → `MATCH`/`MISMATCH`
- Unparseable → `NEEDS_REVIEW`

### 5.3 Government Warning (lib/warning-text.ts) — EXACT, zero tolerance

The statutory text from 27 CFR 16.21 — store as a constant:

```
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

Verification rules, applied in order (report ALL failures found, not just the first):

1. **Presence:** warning not found at all → `MISMATCH` ("Government warning missing")
2. **Header case:** the words "GOVERNMENT WARNING:" must be ALL CAPS exactly. "Government
   Warning:" in title case → `MISMATCH` ("Header must be in capital letters") — this is a
   real rejection case agents catch
3. **Header bold:** if extraction reports `headerAppearsBold: false` → `NEEDS_REVIEW`
   ("Header may not be in bold type — verify visually"). Bold detection from a photo is
   best-effort, so this is yellow, not red.
4. **Body text:** compare transcribed text to the statutory constant. Allow ONLY these
   normalizations: collapse whitespace/line breaks (labels wrap text), and unify hyphenation
   artifacts from line-wrapping. Case is compared exactly. ANY word difference, omission,
   addition, or punctuation change → `MISMATCH`, with a word-level diff in the explanation
   (e.g., "Label says 'may cause health risks' — statute requires 'may cause health problems'")

Unit-test this function hard: correct text, title-case header, one-word substitution,
missing sentence (2), extra marketing text inserted, line-wrap hyphenation (should pass).

### 5.4 Overall verdict

`MISMATCH` if any field is `MISMATCH`; else `NEEDS_REVIEW` if any field is `NEEDS_REVIEW`;
else `MATCH`.

---

## 6. User Interface

Design north star: **a 73-year-old who just learned to video call must succeed on first try.**

### Single Page, Two Entry Areas

- Big header: "Label Verification"
- Minimum 16px body text, large click targets, high contrast
- Every verdict shown with icon + color + word: ✓ green "Match", ✗ red "Mismatch",
  ⚠ yellow "Needs Review" (never color alone — accessibility)
- No technical jargon anywhere. Errors read like a helpful colleague:
  "We couldn't read this image. Try a clearer photo." not "Error 422: extraction failed"

### Area 1: "Try one application" (Test Bench)

1. Application data form (brand name, class/type, alcohol content, net
   contents; optional fields collapsed under "More fields"). Pre-fill with the Old Tom
   Distillery sample data via a small "Load sample" link with dropdown of 4 cases
   (clean match / ABV mismatch / warning defect / multi-image with warning on back) — makes demo/testing instant.
2. Multi-image upload (1–4 images) with preview thumbnails.
3. One big button: **"Verify Label"**. Disabled until form + image present.

### Area 2: "Drop application packages"

1. Drop zone (accepts .zip, folders, files)
2. File-browser button
3. CAP template download link
4. **"Load sample dataset"** button that fetches the bundled sample set so evaluators can run a
   realistic batch with zero preparation

### Results Area (below both entry areas)

1. While processing: progress indicator ("14 of 32 applications…") + live timer per application ("Checking… 1.8s") so speed is *felt*.
2. Results table: TTB ID/serial | overall verdict (colored chip) | per-field mini-icons |
   processing time. Click a row to expand full details.
   - Sorts MISMATCH and NEEDS_REVIEW to the top automatically.
   - When queue has exactly one item, auto-expand the row.
3. Expanded row: overall verdict banner at top (big, colored), then one VerdictCard per
   field showing application value vs. label value side by side, plus the one-sentence
   explanation. Include `foundOn` annotation (e.g., "Government warning — back label"). Timing badge: "Completed in 3.2 seconds".
4. If image quality issues were detected, a yellow note: "Image issues detected: glare on
   upper left. Results may be less reliable."
5. Editable extracted values: expanding a flagged row exposes the extracted label values as editable; editing
   recomputes verdicts client-side and marks the result "verified with agent correction".
6. **"Download results (CSV)"** button.

---

## 7. Evaluation & Sample Data

### Evaluator Sample Dataset (~200 applications)

Goal: Treasury evaluators must be able to exercise the app realistically with zero
setup. Provide a few hundred ready-made applications derived from REAL registry data,
with known ground truth.

**Sourcing strategy (data real, images rendered):**
The Kaggle "TTB COLAs Demo" dataset provides real registry FIELD data (brand names,
class/types, ABV/volume features) but not dependable image files. Therefore:
- Use Kaggle data for realistic application records (real brand names, class/type
  designations, plausible ABV/net contents).
- RENDER the label images ourselves with the existing test-fixture label renderer
  (extend it to optionally produce front + back panels — put the government warning on
  the back panel for ~60% of applications to exercise multi-image extraction).
- This guarantees perfect data↔image pairing and lets us inject defects at a KNOWN rate.

Kaggle access requires the user's Kaggle API credentials (`~/.kaggle/kaggle.json`).
Build the generator so it works in two modes:
- `--source kaggle` — download/parse the dataset (ask the user to provide credentials);
- `--source synthetic` — fall back to a built-in list of ~250 realistic fabricated
  records if Kaggle is unavailable. The pipeline must succeed either way.
If Kaggle licensing for redistribution is unclear, prefer shipping the generated set
from real *registry* values (public records / CC0) and note sourcing in the README.

**Defect injection (ground truth):** ~85% of generated applications are fully
consistent (expect all-MATCH). ~15% get exactly ONE injected defect each, drawn evenly
from the existing 8 test dimensions (brand mismatch, case-only difference, near-miss
typo, wrong ABV, wrong net contents, title-case warning header, modified warning body,
missing warning). Record every application's expected verdicts in
`sample-data/ground-truth.json` (same shape as the fixtures file the eval harness uses).

**Outputs (`scripts/generate-sample-data.ts` → `sample-data/`):**
1. `cola-sample-batch.zip` — ~200 CAP packages (batch zip layout). Keep total size
   modest (compressed PNGs, ~800px wide) so the zip stays well under ~100MB for GitHub.
2. `cola-sample-small.zip` — a 12-application starter batch for a quick evaluator run.
3. `ground-truth.json` + `SAMPLE-DATA.md` (how the set was built, sourcing, defect rates).
4. Manual Test Bench samples: extend "Load sample" to a small dropdown of 4 cases
   (clean match / ABV mismatch / warning defect / multi-image with warning on back),
   with their images bundled in `public/samples/`.

**Wire-up:** the app's "Load sample dataset" button loads `cola-sample-small.zip` from
`public/samples/` directly into the queue. The full 200-pack is linked from the README
and the drop zone ("download the full sample set").

**Eval harness:** extend `scripts/run-evals.ts` to optionally run against
`sample-data/ground-truth.json` (`npm run evals:sample`) and print accuracy by defect
type. Put the resulting table in the README — measured accuracy on a 200-application
ground-truth set is a differentiating artifact.

---

## 8. Test Labels

Located in `test-labels/` with `manifest.md` documenting each:

1. `clean-match.png` — All correct
2. `case-mismatch.png` — Brand case differs (should MATCH)
3. `wrong-abv.png` — Wrong ABV (MISMATCH)
4. `warning-titlecase.png` — Title case warning (MISMATCH)
5. `warning-modified.png` — Modified warning text (MISMATCH with diff)
6. `warning-missing.png` — No warning (MISMATCH)
7. `glare-angle.png` — Quality issues (exercises quality note)
8. `near-miss-brand.png` — Typo in brand (NEEDS_REVIEW)

Generate with AI image tools or build in HTML/CSS and screenshot for pixel-perfect text.

---

## 9. API Routes

### POST /api/verify

- Accepts `multipart/form-data`: 1–4 `image` files + `application` (JSON string of ApplicationData)
- Validates: images present, type jpeg/png/webp, ≤ 4.5 MB total (Vercel body limit); required
  application fields non-empty
- Client should compress/resize images before upload (see lib/image-compression.ts)
- Sends ALL images in ONE Anthropic API call with multi-image blocks
- Returns `VerificationResult` as JSON
- Errors return `{ error: string }` with appropriate status and a plain-English message
- Hard timeout of 15s on the Anthropic call; on timeout return a friendly "took too long" error

---

## 10. Performance & Design

### Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript, single deployable unit
- **Styling:** Tailwind CSS
- **AI:** Anthropic API, `@anthropic-ai/sdk`
  - Primary model: `claude-haiku-4-5` (fast, cheap, strong vision — optimizes for the
    5-second requirement)
  - Make the model ID a single constant in `lib/config.ts` so it can be swapped to
    `claude-sonnet-4-6` if extraction quality needs a boost
- **Deployment:** Vercel. API key via `ANTHROPIC_API_KEY` environment variable. Never expose
  the key client-side; all Anthropic calls happen in API routes.
- **Image handling:** Compress/resize images client-side before upload to stay under Vercel's
  4.5 MB body limit. Use browser-image-compression or similar. Target max dimension 2048px
  and JPEG quality 0.85 (preserves label readability while fitting the limit).
- **No database.** Everything is request/response. No persistence of uploaded images
  (in-memory processing only) — note this in the README as a deliberate privacy choice.

### Project Structure

```
label-verify/
├── SPEC.md                      # this file
├── README.md                    # setup, run, approach, assumptions, trade-offs
├── .env.local.example           # ANTHROPIC_API_KEY=
├── app/
│   ├── layout.tsx               # shared shell: header
│   ├── page.tsx                 # unified queue interface (Test Bench + Package Drop + Results)
│   └── api/
│       └── verify/
│           └── route.ts         # POST: multi-image extract + compare
├── components/
│   ├── ApplicationForm.tsx      # form data entry fields
│   ├── ImageUpload.tsx          # drag-drop + file picker, multi-image preview
│   ├── VerdictCard.tsx          # per-field result: icon + color + label + details + foundOn
│   ├── QueueProgress.tsx        # progress bar and live timers
│   ├── QueueResultsTable.tsx    # results table + CSV export + expandable rows + triage sort
│   └── ProcessingTimer.tsx      # live elapsed-time indicator during processing
├── lib/
│   ├── config.ts                # model ID, timeouts, thresholds
│   ├── types.ts                 # shared types: ApplicationData, ExtractedLabel, FieldVerdict, VerificationResult
│   ├── extraction.ts            # Claude vision call → structured JSON (multi-image, foundOn)
│   ├── comparison.ts            # all verdict logic (pure functions, no I/O)
│   ├── warning-text.ts          # statutory warning constant + exact-check logic
│   ├── image-compression.ts     # client-side image resize/compress utilities
│   ├── csv.ts                   # batch results → CSV string
│   ├── cap-loader.ts            # CAP package validation and parsing (JSZip, all 4 layouts)
│   ├── cap-schema.json          # JSON Schema for application.json
│   └── semaphore.ts             # concurrency limiter (5 simultaneous calls)
├── public/
│   ├── cap-template.json        # downloadable CAP template
│   └── samples/                 # Test Bench sample images + cola-sample-small.zip
├── sample-data/                 # generated evaluation dataset
│   ├── cola-sample-batch.zip    # ~200 applications
│   ├── cola-sample-small.zip    # 12 applications
│   ├── ground-truth.json        # expected verdicts
│   └── SAMPLE-DATA.md           # sourcing, defect rates
├── test-labels/                 # 8 test images for manual testing
│   └── manifest.md              # what each test image exercises
├── scripts/
│   ├── generate-labels.ts       # test fixture label renderer
│   ├── generate-sample-data.ts  # Kaggle/synthetic → sample-data/ with defect injection
│   └── run-evals.ts             # eval harness (fixtures + sample-data ground truth)
└── __tests__/
    └── comparison.test.ts       # unit tests for all comparison logic
```

Rule: **all comparison logic lives in pure functions in `lib/comparison.ts` and
`lib/warning-text.ts`** with unit tests. The LLM extracts; deterministic code judges.

### Data Model (lib/types.ts)

```typescript
export interface ApplicationData {
  // Administrative context (displayed, never verified)
  ttbId?: string;
  serialNumber?: string;
  productType?: string;
  source?: string;
  applicant?: {
    name: string;
    permitNumber?: string;
    address?: string;
  };
  // Label-verifiable fields (drive verdicts)
  brandName: string;
  fancifulName?: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  bottlerNameAddress?: string;
  countryOfOrigin?: string;
}

export type VerdictStatus = "MATCH" | "MISMATCH" | "NEEDS_REVIEW";

export interface FieldVerdict {
  field: string;              // human-readable field name
  status: VerdictStatus;
  applicationValue: string;
  labelValue: string | null;  // null = not found on label
  foundOn?: string;           // "front" | "back" | "neck" | "unknown"
  explanation: string;        // one plain-English sentence
}

export interface ExtractedLabel {
  brandName: string | null;
  fancifulName: string | null;
  classType: string | null;
  alcoholContent: string | null;   // raw text as printed
  netContents: string | null;
  bottlerNameAddress: string | null;
  countryOfOrigin: string | null;
  governmentWarning: {
    present: boolean;
    fullText: string | null;        // verbatim transcription
    headerAllCaps: boolean;         // was "GOVERNMENT WARNING:" in all caps?
    headerAppearsBold: boolean;     // best-effort visual judgment
    foundOn?: string;               // which panel
  };
  imageQuality: {
    readable: boolean;
    issues: string[];               // e.g. ["glare on upper left", "slight angle"]
    confidence: "high" | "medium" | "low";
  };
}

export interface VerificationResult {
  verdicts: FieldVerdict[];
  overall: VerdictStatus;           // worst status wins: MISMATCH > NEEDS_REVIEW > MATCH
  processingMs: number;
  imageQualityNote: string | null;
}
```

### Critical Implementation Notes

1. **Never expose API key client-side** — All Anthropic calls happen in API routes
2. **Compress images client-side before upload** — Vercel has 4.5 MB body limit; target max 2048px dimension, JPEG quality 0.85
3. **No persistence of uploaded images** — In-memory processing only (privacy by design)
4. **All comparison logic must be pure functions** — Enables thorough unit testing
5. **Model ID in single constant** — Easy to swap `claude-haiku-4-5` → `claude-sonnet-4-6`
6. **Timing displayed everywhere** — Speed is a critical user-facing metric
7. **Defensive parsing** — Never crash on malformed LLM output
8. **Image quality gates verdicts** — Low confidence caps everything at `NEEDS_REVIEW`
9. **Always-batch architecture** — No separate batch mode; single entry is queue of one
10. **Multi-image in one API call** — Preserves context, adds foundOn tracking

---

## 11. Out of Scope

- Authentication / user accounts
- Database or any persistence
- COLA integration
- Beverage-type-specific rule engines for wine/beer conditional fields (note as future work)
- Mobile-specific layouts (desktop-first; just don't break on tablet)

---

## 12. Milestones & Build Order

Work one milestone at a time; stop for review after each.

### ✅ COMPLETED

**M1 — Skeleton & single-label happy path**
Scaffold Next.js + TS + Tailwind. Types, config, extraction.ts, comparison.ts (basic),
/api/verify, single-label page with form/upload/results. Sample-data prefill. Timer.
*Definition of done: upload a label photo, get verdicts in the UI in <5s.*

**M2 — Warning checker & comparison hardening**
warning-text.ts with full rule set and word-diff explanations. ABV/proof parsing,
net-contents unit normalization, Levenshtein near-miss → NEEDS_REVIEW. Unit tests for all
of it (`npm test` green).

**G1 — Refactor to always-batch**
Queue architecture, client orchestrator (semaphore=5), unified results table, Test Bench feeding the queue. Existing M1/M2
logic reused. `npm test` stays green.

**G2 — CAP loader**
JSON Schema validation, all four layouts, client-side JSZip,
progressive validate-then-process, plain-English package errors, template download.

### ⏳ PENDING

**G3 — Multi-image extraction**
Multi-image API call, merged ExtractedLabel with foundOn, verdict-card surfacing, renderer extended to front/back panels.

**G4 — Sample data pipeline**
Generator script (kaggle + synthetic modes), defect injection, ground-truth output, zips, Load-sample wiring, evals:sample, README table.

**M4 — Polish, test labels, docs, deploy**
Generate the 8 test labels + manifest. Image-quality note surfacing. Error-message pass
(plain English everywhere). Empty/loading states. README updates per amendment Part F:
- Workflow framing (COLA record simulation)
- CAP format spec
- Design reversal note (no "apply one form to all")
- Multi-image rationale
- Sample dataset section with measured accuracy table
- Verifiable vs administrative field taxonomy
Deploy to Vercel, map custom domain, verify the live URL end to end with the test labels and sample data.

---

## README Requirements

The README must contain:

1. One-paragraph overview + screenshot
2. Setup & run: clone, `npm install`, `.env.local` with `ANTHROPIC_API_KEY`, `npm run dev`;
   live URL
3. **Approach** (the heavily-weighted part — write this carefully):
   - Architecture diagram (simple ASCII or mermaid is fine)
   - The dual matching philosophy: fuzzy + three-state verdicts for identity fields
     (the STONE'S THROW problem) vs. byte-exact for the statutory warning (the title-case
     rejection case) — and why the LLM extracts but deterministic code judges
   - Always-batch architecture and design reversal (no "apply one form to all images")
   - Multi-image extraction rationale (warning lives on back label; merged extraction; foundOn)
   - Speed: model choice driven by the 5-second requirement; measured typical latency;
     timing shown in UI
   - Workflow framing: in production both inputs come from COLA (structured record +
     artwork); the prototype simulates the record via Test Bench and CAP packages
4. **CAP Format Specification:**
   - Schema documentation
   - All four package layouts
   - Template download link
   - Production analog: COLA export
5. **Sample Dataset:**
   - Sourcing (Public COLA Registry / Kaggle)
   - Defect injection rates and ground truth
   - How evaluators use it in 30 seconds
   - Measured accuracy table from `npm run evals:sample`
6. **Assumptions & trade-offs:**
   - Prototype calls a cloud AI API; the agency network blocks many outbound ML endpoints.
     Production paths: Azure-hosted model (e.g., Claude on a FedRAMP-authorized Azure/Bedrock
     GovCloud offering) or self-hosted vision model inside the boundary.
   - No persistence/PII by design for the prototype
   - Bold-detection from photos is best-effort → yellow not red
   - Verifiable vs administrative field taxonomy from Form 5100.31
   - Wine/beer conditional fields acknowledged but out of scope; where that logic would slot in
7. Known limitations + what I'd build next
