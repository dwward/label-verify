# SPEC: AI-Powered Alcohol Label Verification App (TTB Prototype)

> **How to use this file:** Place it in the root of an empty project folder as `SPEC.md`.
> Then start Claude Code and say: *"Read SPEC.md. Build this project following the Build Order
> at the bottom. Work through one milestone at a time and stop for my review after each."*

---

## 1. Project Overview

Build a web application prototype for TTB (Alcohol and Tobacco Tax and Trade Bureau) compliance
agents. The app compares an uploaded alcohol label image against application form data and
produces a per-field verification verdict, so agents can stop doing visual matching by hand.

**Core flow:** Agent enters application data → uploads label image → app extracts label text
using Claude vision → app compares extracted fields to application data using deterministic
logic → app displays a clear verdict per field.

This is a standalone proof-of-concept. No COLA integration, no auth, no PII storage.

---

## 2. Hard Requirements (in priority order)

1. **Speed: results in under 5 seconds** for a single label. A prior vendor pilot failed at
   30–40 seconds and agents abandoned it. Display elapsed processing time in the UI next to
   every result.
2. **Three-state verdicts, not binary.** Each field resolves to one of:
   - `MATCH` (green) — confident match after normalization
   - `MISMATCH` (red) — confident mismatch
   - `NEEDS_REVIEW` (yellow) — ambiguous; a human should look
   This reflects how real agents work: "STONE'S THROW" vs "Stone's Throw" is a match in
   substance, and the tool must not cry wolf on trivial differences.
3. **Government Warning statement: EXACT match required.** This is the opposite of fuzzy
   matching. See §6.3 for the statutory text and rules. Getting the dual matching philosophy
   right (fuzzy for brand, exact for warning) is the most important correctness requirement
   in this project.
4. **Batch mode.** Agents receive 200–300 applications at once during peak season. Support
   multi-file upload with a results table and CSV export.
5. **Extreme UI simplicity.** Target user benchmark: a 73-year-old with minimal tech
   experience. Half the agent workforce is over 50. One obvious action per screen, large
   buttons, large readable text, color + icon + text for every verdict (never color alone),
   zero jargon.
6. **Graceful handling of imperfect images** (angle, glare, blur). The vision model handles
   most of this; when extraction confidence is low, say so and return `NEEDS_REVIEW` rather
   than guessing.

---

## 3. Tech Stack

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

---

## 4. Project Structure

```
label-verify/
├── SPEC.md                      # this file
├── README.md                    # setup, run, approach, assumptions, trade-offs
├── .env.local.example           # ANTHROPIC_API_KEY=
├── app/
│   ├── layout.tsx               # shared shell: header, nav between Single / Batch
│   ├── page.tsx                 # Single Label Verification (the default screen)
│   ├── batch/
│   │   └── page.tsx             # Batch Verification (client-side orchestration)
│   └── api/
│       └── verify/
│           └── route.ts         # POST: single label — extract + compare
├── components/
│   ├── ApplicationForm.tsx      # form data entry fields
│   ├── ImageUpload.tsx          # drag-drop + file picker, image preview
│   ├── VerdictCard.tsx          # per-field result: icon + color + label + details
│   ├── ResultsPanel.tsx         # single-label full results + timing badge
│   ├── BatchTable.tsx           # batch results table + CSV export button
│   └── ProcessingTimer.tsx      # live elapsed-time indicator during processing
├── lib/
│   ├── config.ts                # model ID, timeouts, thresholds
│   ├── types.ts                 # shared types: ApplicationData, ExtractedLabel, FieldVerdict, VerificationResult
│   ├── extraction.ts            # Claude vision call → structured JSON
│   ├── comparison.ts            # all verdict logic (pure functions, no I/O)
│   ├── warning-text.ts          # statutory warning constant + exact-check logic
│   ├── image-compression.ts     # client-side image resize/compress utilities
│   └── csv.ts                   # batch results → CSV string
├── test-labels/                 # generated test images (committed to repo)
│   └── manifest.md              # what each test image is designed to exercise
└── __tests__/
    └── comparison.test.ts       # unit tests for all comparison logic
```

Rule: **all comparison logic lives in pure functions in `lib/comparison.ts` and
`lib/warning-text.ts`** with unit tests. The LLM extracts; deterministic code judges.

---

## 5. Data Model (lib/types.ts)

```typescript
export interface ApplicationData {
  brandName: string;
  classType: string;          // e.g. "Kentucky Straight Bourbon Whiskey"
  alcoholContent: string;     // e.g. "45% Alc./Vol." or "45"
  netContents: string;        // e.g. "750 mL"
  bottlerName?: string;       // optional for prototype
  countryOfOrigin?: string;   // optional, imports only
}

export type VerdictStatus = "MATCH" | "MISMATCH" | "NEEDS_REVIEW";

export interface FieldVerdict {
  field: string;              // human-readable field name
  status: VerdictStatus;
  applicationValue: string;
  labelValue: string | null;  // null = not found on label
  explanation: string;        // one plain-English sentence
}

export interface ExtractedLabel {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;   // raw text as printed
  netContents: string | null;
  governmentWarning: {
    present: boolean;
    fullText: string | null;        // verbatim transcription
    headerAllCaps: boolean;         // was "GOVERNMENT WARNING:" in all caps?
    headerAppearsBold: boolean;     // best-effort visual judgment
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

---

## 6. Core Logic

### 6.1 Extraction (lib/extraction.ts)

One Claude vision API call per image. Send the image plus a prompt that instructs the model to:

- Transcribe label fields verbatim (do not normalize, do not correct)
- Transcribe the government warning **character-for-character as printed**, preserving case
- Report whether the warning header is in all caps and whether it appears bold
- Assess image quality and list legibility issues
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

### 6.2 Field Comparison (lib/comparison.ts) — fuzzy, judgment-based

All pure functions. General normalization applied to both sides before comparing:
lowercase, trim, collapse internal whitespace, strip surrounding quotes, normalize
typographic apostrophes/quotes (`’` → `'`).

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

### 6.3 Government Warning (lib/warning-text.ts) — EXACT, zero tolerance

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

### 6.4 Overall verdict

`MISMATCH` if any field is `MISMATCH`; else `NEEDS_REVIEW` if any field is `NEEDS_REVIEW`;
else `MATCH`.

---

## 7. API Routes

### POST /api/verify
- Accepts `multipart/form-data`: `image` (file) + `application` (JSON string of ApplicationData)
- Validates: image present, type jpeg/png/webp, ≤ 4.5 MB (Vercel body limit); required
  application fields non-empty
- Client should compress/resize images before upload (see lib/image-compression.ts)
- Returns `VerificationResult` as JSON
- Errors return `{ error: string }` with appropriate status and a plain-English message
- Hard timeout of 15s on the Anthropic call; on timeout return a friendly "took too long" error

### Batch Mode (Client-Side Orchestration)
- **No /api/batch route.** Batch page orchestrates multiple calls to /api/verify from the client.
- Use `Promise.allSettled` with a concurrency limit of 5 (simple semaphore — do not fire 300
  calls at once).
- Compress each image client-side before sending.
- Track progress and update UI incrementally as each verification completes.
- This approach:
  - Avoids Vercel's function timeout issues with large batches
  - Stays under the 4.5 MB body limit per request
  - Provides real-time progress feedback to the user
  - Simpler error handling (failed images don't block the batch)

---

## 8. UI Requirements

Design north star: **a 73-year-old who just learned to video call must succeed on first try.**

### Shared
- Big header: "Label Verification" with two large tabs: **Single Label** | **Batch**
- Minimum 16px body text, large click targets, high contrast
- Every verdict shown with icon + color + word: ✓ green "Match", ✗ red "Mismatch",
  ⚠ yellow "Needs Review" (never color alone — accessibility)
- No technical jargon anywhere. Errors read like a helpful colleague:
  "We couldn't read this image. Try a clearer photo." not "Error 422: extraction failed"

### Single Label page (app/page.tsx)
1. Left column: application data form (brand name, class/type, alcohol content, net
   contents; optional fields collapsed under "More fields"). Pre-fill with the Old Tom
   Distillery sample data via a small "Load sample" link — makes demo/testing instant.
2. Right column: drag-and-drop image upload with preview thumbnail.
3. One big button: **"Verify Label"**. Disabled until form + image present.
4. While processing: live timer ("Checking… 1.8s") so speed is *felt*.
5. Results panel: overall verdict banner at top (big, colored), then one VerdictCard per
   field showing application value vs. label value side by side, plus the one-sentence
   explanation. Timing badge: "Completed in 3.2 seconds".
6. If image quality issues were detected, a yellow note: "Image issues detected: glare on
   upper left. Results may be less reliable."

### Batch page (app/batch/page.tsx)
1. Multi-file drop zone (accept up to 50 files in the prototype; note the 300-target in README)
2. Data entry mode toggle:
   - **Same data for all** (one form applies to every image), and
   - **CSV upload** (columns: filename, brandName, classType, alcoholContent, netContents) —
     include a downloadable CSV template link
3. Progress bar during processing ("14 of 32 checked…") with real-time updates as each
   verification completes
4. Client-side orchestration: compress each image, then call /api/verify with concurrency
   limit of 5. Use a semaphore pattern to queue requests.
5. Results table: filename | overall verdict (colored chip) | per-field mini-icons |
   processing time. Click a row to expand full details.
6. **"Download results (CSV)"** button.

---

## 9. Test Labels (test-labels/)

Generate with an AI image tool (the assignment explicitly endorses this). Create 8 images,
document each in `manifest.md`:

1. `clean-match.png` — Old Tom Distillery, all fields correct, correct warning
2. `case-mismatch.png` — brand "OLD TOM DISTILLERY" on label vs "Old Tom Distillery" in app data → should be MATCH
3. `wrong-abv.png` — label says 43%, application says 45% → MISMATCH
4. `warning-titlecase.png` — "Government Warning:" in title case → MISMATCH
5. `warning-modified.png` — one word changed in warning body → MISMATCH with diff
6. `warning-missing.png` — no warning at all → MISMATCH
7. `glare-angle.png` — readable but photographed at an angle with glare → exercises quality note
8. `near-miss-brand.png` — "OLD TOM DISTILLRY" (typo) → NEEDS_REVIEW

If AI image generation fights you on legible small warning text, build labels in HTML/CSS
and screenshot them — faster and pixel-perfect. Either approach is fine; note which was used.

---

## 10. README.md must contain

1. One-paragraph overview + screenshot
2. Setup & run: clone, `npm install`, `.env.local` with `ANTHROPIC_API_KEY`, `npm run dev`;
   live URL
3. **Approach** (the heavily-weighted part — write this carefully):
   - Architecture diagram (simple ASCII or mermaid is fine)
   - The dual matching philosophy: fuzzy + three-state verdicts for identity fields
     (the STONE'S THROW problem) vs. byte-exact for the statutory warning (the title-case
     rejection case) — and why the LLM extracts but deterministic code judges
   - Speed: model choice driven by the 5-second requirement; measured typical latency;
     timing shown in UI
   - Batch design and the peak-season 200–300 scenario; concurrency limiting
4. **Assumptions & trade-offs:**
   - Prototype calls a cloud AI API; the agency network blocks many outbound ML endpoints.
     Production paths: Azure-hosted model (e.g., Claude on a FedRAMP-authorized Azure/Bedrock
     GovCloud offering) or self-hosted vision model inside the boundary. (This sentence
     directly addresses the IT admin's firewall anecdote — keep it.)
   - No persistence/PII by design for the prototype
   - Bold-detection from photos is best-effort → yellow not red
   - Beverage-type variations (beer/wine ABV exemptions) acknowledged but out of scope;
     where that logic would slot in
5. Known limitations + what I'd build next

---

## 11. Out of Scope (do not build)

- Authentication / user accounts
- Database or any persistence
- COLA integration
- Beverage-type-specific rule engines (note as future work)
- Mobile-specific layouts (desktop-first; just don't break on tablet)

---

## 12. Build Order (work one milestone at a time; stop for review after each)

**M1 — Skeleton & single-label happy path**
Scaffold Next.js + TS + Tailwind. Types, config, extraction.ts, comparison.ts (basic),
/api/verify, single-label page with form/upload/results. Sample-data prefill. Timer.
*Definition of done: upload a label photo, get verdicts in the UI in <5s.*

**M2 — Warning checker & comparison hardening**
warning-text.ts with full rule set and word-diff explanations. ABV/proof parsing,
net-contents unit normalization, Levenshtein near-miss → NEEDS_REVIEW. Unit tests for all
of it (`npm test` green).

**M3 — Batch**
Batch page, multi-upload, same-data + CSV modes, concurrency-limited /api/batch,
progress UI, results table, CSV export.

**M4 — Polish, test labels, docs, deploy**
Generate the 8 test labels + manifest. Image-quality note surfacing. Error-message pass
(plain English everywhere). Empty/loading states. README per §10. Deploy to Vercel,
map custom domain, verify the live URL end to end with the test labels.
