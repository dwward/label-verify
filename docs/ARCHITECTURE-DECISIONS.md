# Architecture Decision Records (ADRs)

**Project:** TTB Label Verification Prototype  
**Last Updated:** 2026-06-14  
**Purpose:** Document key architectural decisions, their context, and consequences

---

## Table of Contents

1. [ADR-001: Next.js + Client-Side Architecture](#adr-001)
2. [ADR-002: Pure Function Comparison Logic](#adr-002)
3. [ADR-003: Client-Side ZIP Processing](#adr-003)
4. [ADR-004: Four CAP Package Layouts](#adr-004)
5. [ADR-005: Single-Page Always-Batch Architecture](#adr-005)
6. [ADR-006: Deterministic Confidence Scoring](#adr-006)
7. [ADR-007: Font Size Accessibility (14px Minimum)](#adr-007)
8. [ADR-008: No Database / No Persistence](#adr-008)
9. [ADR-009: Client-Side Image Compression](#adr-009)
10. [ADR-010: Fuzzy Matching for Identity, Exact for Warning](#adr-010)

---

<a name="adr-001"></a>
## ADR-001: Next.js + Client-Side Architecture

**Status:** Accepted  
**Date:** 2026-06-14 (Session 01)  
**Decision Makers:** Development team + User

### Context

Need to build a web application for TTB agents (73-year-old target demographic) to verify alcohol labels against COLA applications using Claude vision API. Prior vendor pilot failed at 30-40 second processing times.

**Constraints:**
- Must process in <5 seconds (critical requirement)
- Target users are elderly with minimal tech experience
- Agency networks may block direct ML API access
- Vercel deployment (4.5 MB body limit, serverless timeout)
- Privacy requirement (no data persistence)

### Decision

Use **Next.js 15+** with:
- App Router for React Server Components
- Client-side processing for images and ZIP files
- Tailwind CSS for accessible styling
- Direct Anthropic API calls from server-side API routes
- No database or backend persistence

### Rationale

**Why Next.js:**
- Fast initial load (critical for perceived performance)
- Server-side API routes hide API keys securely
- Built-in image optimization
- Vercel deployment with zero config
- TypeScript support out-of-box

**Why client-side processing:**
- Bypasses Vercel 4.5 MB body limit (ZIP files parsed in browser)
- Faster feedback (no upload lag)
- Privacy by design (files never leave user's machine until verification)
- Better UX (progressive disclosure, instant validation)

**Alternatives Considered:**

1. **Traditional SPA (React + Express backend)**
   - Rejected: Requires separate hosting for backend, more deployment complexity
   
2. **Server-side ZIP processing**
   - Rejected: Vercel body limit forbids uploading large ZIPs, would need chunked upload (complex)
   
3. **Python FastAPI + Streamlit**
   - Rejected: Slower development, less accessible UI, Python hosting more expensive

### Consequences

**Positive:**
- ✅ Development velocity (Next.js ecosystem mature)
- ✅ Performance (client-side processing eliminates upload bottleneck)
- ✅ Security (API keys server-side only)
- ✅ Privacy (no data leaves client until verification)
- ✅ Deployment simplicity (Vercel one-click)

**Negative:**
- ❌ Requires JavaScript (no graceful degradation for non-JS clients)
- ❌ Browser compatibility constraints (must support FileReader, FormData)
- ❌ Limited offline capability (needs API access)

**Risks Mitigated:**
- Agency network blocking → Document Azure/Bedrock alternative in README
- Vercel body limit → Solved via client-side processing

---

<a name="adr-002"></a>
## ADR-002: Pure Function Comparison Logic

**Status:** Accepted  
**Date:** 2026-06-14 (Session 01, 02)  
**Principle:** "LLM extracts (probabilistic), code judges (deterministic)"

### Context

Need to compare extracted label data against application form data. Critical decision: should comparison be LLM-based or rule-based?

**Requirements:**
- Must be fast (< 5 second total processing time)
- Must be testable (unit tests for edge cases)
- Must be explainable (agents need to understand why MATCH vs MISMATCH)
- Must handle fuzzy matching ("Old Tom" vs "Old Tom's")

### Decision

All comparison logic implemented as **pure functions** in `lib/comparison.ts`:
- No I/O operations
- No API calls
- Deterministic (same input → same output)
- Individually unit-testable

**Pattern:**
```typescript
function compareBrandOrClass(
  fieldName: string,
  appValue: string,
  labelValue: string | null
): FieldVerdict {
  // Normalize both values
  const normApp = normalize(appValue);
  const normLabel = normalize(labelValue);
  
  // Exact match after normalization
  if (normApp === normLabel) return { status: "MATCH", ... };
  
  // Fuzzy match (Levenshtein)
  if (similarity >= 0.9) return { status: "NEEDS_REVIEW", ... };
  
  // Mismatch
  return { status: "MISMATCH", ... };
}
```

### Rationale

**Why pure functions:**
- **Speed:** No API latency (< 1ms per comparison)
- **Cost:** Zero additional API cost
- **Testability:** Can unit test all edge cases exhaustively
- **Debugging:** Deterministic, reproducible behavior
- **Explainability:** Code is the documentation

**Why not LLM-based comparison:**
- Adds 1-2 seconds per field (5 fields = 5-10s → exceeds < 5s requirement)
- Adds $0.01-0.02 per comparison (vs $0.00)
- Non-deterministic (same inputs might yield different outputs)
- Hard to test (can't write traditional unit tests)
- Opaque reasoning (hard to explain why it decided MATCH vs MISMATCH)

**Division of Labor:**
- **LLM (Claude vision):** Extract text from image (leverages OCR + understanding)
- **Code (comparison.ts):** Judge if extracted text matches application (leverages rules + logic)

### Consequences

**Positive:**
- ✅ Meets < 5 second requirement (comparison is instant)
- ✅ Zero additional API cost
- ✅ Comprehensive unit test coverage (63 tests)
- ✅ Easy to add new comparison rules
- ✅ Deterministic behavior (confidence in results)

**Negative:**
- ❌ Cannot leverage LLM reasoning for edge cases ("whiskey" vs "whisky" requires explicit rule)
- ❌ Fixed rules (not adaptive to new patterns)
- ❌ Manual threshold tuning (Levenshtein similarity = 0.9 is hardcoded)

**Trade-offs Accepted:**
- Accept manual rule authoring in exchange for speed + testability
- Accept fixed logic in exchange for determinism + explainability

**Evolution Path:**
- Can add LLM-based "secondary review" for low-confidence comparisons (only when needed)
- Can train ML model on comparison examples (future enhancement)

---

<a name="adr-003"></a>
## ADR-003: Client-Side ZIP Processing

**Status:** Accepted  
**Date:** 2026-06-14 (Session 02 - G2)  
**Library:** JSZip 3.10.1

### Context

Need to support CAP (COLA Application Package) uploads containing `application.json` + 1-4 images. Packages may be:
- Single ZIP file (one application)
- Batch ZIP file (200-300 applications in subfolders)
- Loose files (drag-drop without ZIP)

**Constraints:**
- Vercel has 4.5 MB body limit (cannot upload ZIP to server)
- Serverless functions have 10s timeout (batch processing would exceed)
- Privacy requirement (no server-side storage)

### Decision

Process all ZIP files **client-side in the browser** using JSZip:
- Parse ZIP structure in JavaScript
- Extract `application.json` files
- Extract image files as File objects
- Validate with JSON Schema (AJV)
- Display errors immediately (no server round-trip)

### Rationale

**Why client-side:**
- Bypasses Vercel body limit (ZIP never uploaded to server)
- Instant validation feedback (no network latency)
- Privacy by design (files never leave browser until verification)
- No serverless timeout concerns (browser has unlimited time)

**Why JSZip:**
- Mature library (10+ years, 10K+ stars)
- Handles async extraction gracefully
- Works in all modern browsers
- Small bundle size (~30 KB gzipped)

**Alternatives Considered:**

1. **Server-side ZIP processing**
   - Rejected: Cannot upload >4.5 MB to Vercel
   - Would require chunked upload (complex, poor UX)

2. **Streaming unzip**
   - Rejected: Unnecessary complexity for prototype
   - Browser memory can handle typical batch sizes (<500 MB)

3. **Native File System API**
   - Rejected: Limited browser support, more complex API
   - JSZip more widely compatible

### Consequences

**Positive:**
- ✅ No body size limits (ZIPs of any size work)
- ✅ Instant validation errors (no upload delay)
- ✅ Privacy preserved (no server-side file storage)
- ✅ Works offline (validation happens locally)

**Negative:**
- ❌ Requires JavaScript (no server-side fallback)
- ❌ Memory limits (very large ZIPs >1 GB might OOM)
- ❌ Browser compatibility (requires modern browser)

**Performance:**
- 100-application batch ZIP (~200 MB): ~500ms to parse
- Acceptable for prototype (well under 5s budget)

**Security:**
- Client-side validation prevents malformed ZIP uploads
- JSON Schema prevents injection attacks
- No server-side file persistence (attack surface reduced)

---

<a name="adr-004"></a>
## ADR-004: Four CAP Package Layouts

**Status:** Accepted  
**Date:** 2026-06-14 (Session 02 - G2)  
**Modified:** User changed `subfolderCount > 1` to `>= 1`

### Context

Real-world COLA exports have multiple formats. Need to support various TTB export structures without forcing users to reformat packages.

**User requirement:** "Peak season means 200-300 applications at once" → batch support critical.

### Decision

Support exactly **four package layouts** with auto-detection:

#### 1. Package-ZIP (Single Application)
```
archive.zip
├── application.json
├── front.png
└── back.png
```

#### 2. Batch-ZIP (Multiple Applications)
```
archive.zip
├── app-001/
│   ├── application.json
│   ├── front.png
│   └── back.png
├── app-002/
│   ├── application.json
│   └── front.png
...
```

#### 3. Manifest-Mode (Array of Applications)
```
archive.zip
├── applications.json  (array)
├── app-001-front.png
├── app-001-back.png
├── app-002-front.png
...
```

#### 4. Loose-Drop (No ZIP)
```
(Drag-drop multiple files)
application.json
front.png
back.png
```

**Auto-detection logic:**
```typescript
if (files.includes("application.json")) → Package-ZIP
else if (files.includes("applications.json")) → Manifest-Mode
else if (subfolderCount >= 1) → Batch-ZIP
else → Error (unrecognized format)
```

### Rationale

**Why four layouts:**
- Mirrors real-world TTB export variations
- Batch-ZIP supports peak-season workflow (200-300 apps)
- Package-ZIP handles single-application use case
- Manifest-Mode efficient for programmatic generation
- Loose-drop preserves backwards compatibility with G1

**Why auto-detection:**
- User shouldn't have to declare format (error-prone)
- Deterministic rules (no ambiguity)
- Fast (O(n) scan of filenames)

**User modification:**
- Changed `subfolderCount > 1` to `>= 1` (line 78 of `cap-loader.ts`)
- Rationale: Single-subfolder batch ZIPs are valid (edge case)

### Consequences

**Positive:**
- ✅ Handles all known TTB export formats
- ✅ User doesn't need to know format (auto-detected)
- ✅ Flexible for different workflows

**Negative:**
- ❌ Slightly more detection logic (~100 LOC)
- ❌ Must document expected formats (user confusion risk)

**Limitations Accepted:**
- No arbitrary folder nesting (must be 1 level deep for batch)
- No mixed layouts in one ZIP (must be consistent)

---

<a name="adr-005"></a>
## ADR-005: Single-Page Always-Batch Architecture

**Status:** Accepted  
**Date:** 2026-06-14 (Session 02 - UI Simplification)  
**User Directive:** "As clean and simplified of an interface"

### Context

Initial plan was multi-page app:
- `/upload` page for batch validation
- `/dashboard` page for results + statistics
- `/review-queue` page for needs_review items
- `/inspector/[id]` page for detail view

**Total estimated:** ~2,200 lines of code

### Decision

**Keep single-page architecture** with progressive disclosure:
- Entry section (form + image upload) at top
- Statistics cards appear when queue has items
- Filter bar for view toggling (All | Needs Review | Passed | Rejected | Error)
- Enhanced results table with confidence column
- Inspector side panel slides in from right (50% overlay)

**Total actual:** ~1,250 lines of code (45% reduction)

### Rationale

**Why single-page:**
- User explicitly requested simplified interface
- Existing "always-batch" queue design already excellent
- No context switching = simpler mental model
- No routing complexity or state management across pages
- Faster development (less boilerplate)

**Why inspector as side panel:**
- Provides rich detail view without leaving page
- Users can still see other results while inspecting one item
- Keyboard navigation (N/P/ESC) for efficient review
- Progressive disclosure (only shows when needed)

**Alternatives Rejected:**

1. **Multi-page navigation**
   - Rejected: Adds complexity without UX benefit
   - Context switching confusing for 73-year-old users

2. **Inspector as full page**
   - Rejected: Loses table context, forces navigation

3. **Modal overlay**
   - Rejected: Blocks table entirely, feels disruptive

### Consequences

**Positive:**
- ✅ 45% less code (easier to maintain)
- ✅ No routing complexity
- ✅ Simpler mental model (everything visible)
- ✅ Faster development
- ✅ Better for elderly users (less navigation)

**Negative:**
- ❌ Less "app-like" feel (no page transitions)
- ❌ Can't bookmark specific application views (acceptable - no persistence anyway)
- ❌ Slightly more crowded single page (mitigated by progressive disclosure)

**Implementation Notes:**
- Statistics hidden until first verification completes
- Inspector only visible when item selected
- Filter bar collapses on mobile

---

<a name="adr-006"></a>
## ADR-006: Deterministic Confidence Scoring

**Status:** Accepted  
**Date:** 2026-06-14 (Session 02 - UI Simplification)  
**Thresholds:** ≥85% auto-pass, <60% needs review

### Context

Current system only has categorical verdicts (MATCH/MISMATCH/NEEDS_REVIEW). Cannot distinguish "high-confidence MATCH" (auto-pass) vs "low-confidence MATCH" (needs human review).

**Requirement:** Triage workflow to reduce human workload while maintaining safety.

### Decision

Add **field-level and application-level confidence scores** (0.0-1.0) calculated from deterministic heuristics:

**Confidence Factors:**
```typescript
// 1. Image quality (from Claude)
high = 1.0, medium = 0.75, low = 0.5

// 2. Field extraction success
found = 1.0, missing = 0.5 max

// 3. Comparison strength
exact_match = 1.0
fuzzy_match (Levenshtein 0.9-1.0) = 0.85-0.95 graduated
numeric_exact = 1.0, parse_error = 0.3
warning_all_pass = 1.0, any_fail = 0.0

// 4. Application confidence
minimum of all field confidences (weakest link)
```

**Routing Logic:**
```typescript
if (overall === "MATCH" && confidence >= 0.85 && !hasLowConfidenceFields) {
  → auto_passed
} else {
  → needs_review
}
```

### Rationale

**Why deterministic:**
- Fast calculation (no API calls, <1ms)
- Explainable (can show user exactly why confidence is X%)
- Tunable via config constants
- Deterministic (same input always yields same confidence)

**Why not ML-based:**
- Would require training data (don't have yet)
- Adds ML pipeline complexity
- Less explainable (black box)
- Harder to tune

**Why not LLM-based:**
- Adds API call latency/cost
- LLMs are poor at self-assessment
- Non-deterministic

**Why minimum (not average):**
- Average could mask low-confidence critical field
- Example: warning at 40%, brand at 99% → average 70% might auto-pass when it shouldn't
- Minimum ensures all fields meet threshold

### Consequences

**Positive:**
- ✅ Reduces human workload (auto-pass high-confidence matches)
- ✅ Fast and cheap (no additional API calls)
- ✅ Explainable to users
- ✅ Tunable thresholds

**Negative:**
- ❌ Manual threshold tuning required
- ❌ Fixed formula (not adaptive to data)
- ❌ Cannot leverage ML nuance

**Validation Plan:**
- Test with 200-application sample dataset
- Tune thresholds to achieve ~60-70% auto-pass rate
- Monitor false-positive rate (auto-passed but should have been reviewed)

**Expected Impact:**
- 60-70% of applications auto-pass (high confidence MATCH)
- 30-40% route to human review
- Agent review time reduced by ~60%

---

<a name="adr-007"></a>
## ADR-007: Font Size Accessibility (14px Minimum)

**Status:** Accepted  
**Date:** 2026-06-14 (Session 06)  
**Target:** 73-year-old TTB agents

### Context

Target user demographic is 73-year-old compliance agents with minimal tech experience. Initial implementation used 12px (`text-xs`) extensively throughout interface.

**Problem:** 
- Age-related vision decline (presbyopia) universal after 40, accelerates after 65
- 73-year-olds need 1.5-2x larger fonts than younger users
- Prior UI had 12px text nearly illegible for seniors

**Research:**
- WCAG recommends 14px minimum for interactive elements
- Medicare.gov uses 16px base, 14px minimum
- IRS.gov uses 16px base
- UK.gov uses 19px base (very accessible)

### Decision

**Increase all font sizes by one Tailwind level:**
- `text-xs` (12px) → `text-sm` (14px) - New minimum
- `text-sm` (14px) → `text-base` (16px) - New default
- `text-base` (16px) → `text-lg` (18px) - Primary actions
- `text-lg` (18px) → `text-xl` (20px) - Headings

**Specific changes:**
- Navigation links: 14px → 16px
- Table headers: 12px → 14px (CRITICAL improvement)
- Buttons: 12px → 14px minimum
- Inspector text: 12px → 14px throughout
- Approve/Reject buttons: 14px → 16px

**Sidebar width increased:**
- 192px (`w-48`) → 240px (`w-60`) to accommodate longer text without wrapping

### Rationale

**Why 14px minimum:**
- Matches Medicare.gov standard (similar demographic)
- WCAG-compliant for elderly users
- Significantly improves readability without excessive density loss

**Why not global CSS increase:**
- Changing HTML base font-size affects ALL Tailwind sizes (too aggressive)
- Selective increases provide better control

**Why accept density trade-off:**
- Readability more important than information density for target users
- ~10-15% more vertical space usage acceptable
- Mitigated by keeping row padding tight

### Consequences

**Positive:**
- ✅ Significantly better readability for 73-year-old users
- ✅ Meets WCAG accessibility guidelines
- ✅ Reduced eye strain
- ✅ Higher agent adoption likelihood

**Negative:**
- ❌ ~10-15% more vertical space usage
- ❌ Slightly less information density
- ❌ Required sidebar width increase

**Verification:**
- Zero instances of `text-xs` (12px) remain in app
- Minimum text size now 14px across entire interface
- Tested with 100-application batch (still usable)

**Related Fixes:**
- Navigation icon shrinking prevented with `flex-shrink-0`
- Inspector panel spacing increased (`ml-4` = 16px)

---

<a name="adr-008"></a>
## ADR-008: No Database / No Persistence

**Status:** Accepted  
**Date:** 2026-06-14 (Session 01, enforced throughout)  
**Principle:** Privacy by design

### Context

Alcohol label images and application data are potentially sensitive business information. Agents review 200-300 applications during peak season.

**Question:** Should we persist uploaded images, application data, or verification results?

### Decision

**Zero server-side persistence:**
- No database (no PostgreSQL, SQLite, Redis)
- No file storage (no S3, disk writes)
- No server-side sessions
- No cookies (except Next.js routing)

**All state is ephemeral:**
- Images: Client-side memory only (File objects)
- Queue: React state + sessionStorage (metadata only)
- Results: React state only
- Export: User downloads JSON/CSV on demand

**Three-tier persistence strategy (client-side only):**
1. **Window globals:** `__pendingQueueImages` for cross-page navigation (same session)
2. **sessionStorage:** Application metadata (survives page navigation, not refresh)
3. **localStorage:** Completed results (survives refresh, but images lost)

### Rationale

**Why no persistence:**
- **Privacy:** Label images may contain proprietary designs, formulas, trade secrets
- **Compliance:** No GDPR/privacy policy needed (no PII stored)
- **Simplicity:** No database setup, migrations, backups
- **Cost:** No storage costs
- **Security:** No data breach risk (no data to breach)

**Why export instead:**
- Agents can download JSON/CSV mid-stream (shift handoff)
- Export is explicit user action (consent)
- Local files under user control

**Alternatives Considered:**

1. **Database with encryption**
   - Rejected: Adds complexity, still requires privacy policy
   - Risk: Encryption key management

2. **Temporary storage (TTL = 1 hour)**
   - Rejected: Still requires S3/database, adds cost
   - Privacy risk: Data exists server-side even temporarily

3. **Session-only storage (Redis)**
   - Rejected: Vercel serverless has no persistent Redis
   - Would require separate Redis hosting

### Consequences

**Positive:**
- ✅ Zero privacy concerns (no PII stored)
- ✅ No GDPR compliance burden
- ✅ Simpler architecture (no DB layer)
- ✅ Lower cost (no storage fees)
- ✅ Faster development (no migrations)
- ✅ No data breach risk

**Negative:**
- ❌ Browser refresh loses images (must re-upload)
- ❌ No history/audit trail
- ❌ No cross-session resume
- ❌ No analytics on usage patterns

**Mitigation:**
- Export dispositions JSON for shift handoff
- Warn user before page refresh (browser confirms)
- "Images Not Available" placeholder after refresh

**User Acceptance:**
- User explicitly accepted this trade-off
- Export feature compensates for lack of persistence

---

<a name="adr-009"></a>
## ADR-009: Client-Side Image Compression

**Status:** Accepted  
**Date:** 2026-06-14 (Session 01)  
**Library:** browser-image-compression

### Context

Users capture bottle label photos with smartphones (often 5-12 MB each). Vercel has 4.5 MB body limit on API routes. Need to compress before upload.

**Requirement:** Submit to Claude API quickly without hitting Vercel limit.

### Decision

Use **browser-image-compression** library to compress images client-side before upload:

**Settings:**
```typescript
maxSizeMB: 4,              // Target size
maxWidthOrHeight: 2048,    // Max dimension
useWebWorker: true,        // Async compression
fileType: 'image/jpeg',    // Force JPEG
initialQuality: 0.85       // Balance quality/size
```

**Behavior:**
- Compress async with visual feedback ("Compressing...")
- Falls back to original file if compression fails
- Happens before FormData construction

### Rationale

**Why client-side:**
- Bypasses Vercel body limit (compress before upload)
- Faster perceived performance (parallel compression)
- No server CPU usage (offload to client)

**Why these settings:**
- 2048px sufficient for Claude API (model doesn't need higher resolution)
- Quality 0.85 balances file size vs visual fidelity
- JPEG smaller than PNG for photos
- 4 MB target ensures multi-image uploads fit under limit

**Why async:**
- Non-blocking UI (compress in background)
- User sees progress feedback
- Better UX than blocking

**Alternatives Considered:**

1. **Server-side compression**
   - Rejected: Must upload full image first (hits body limit)

2. **Lower quality (0.7)**
   - Rejected: Degrades OCR accuracy (text less legible)

3. **Smaller dimension (1536px)**
   - Considered acceptable if 2048px insufficient
   - Not needed yet

### Consequences

**Positive:**
- ✅ Works within Vercel limits (multi-image uploads succeed)
- ✅ Faster uploads (smaller files)
- ✅ Better UX (async, non-blocking)
- ✅ No server CPU usage

**Negative:**
- ❌ Adds ~50 KB client-side dependency
- ❌ Slight processing delay (1-2s for large images)
- ❌ Quality loss (acceptable for OCR)

**Performance:**
- 12 MB photo → 2-3 MB JPEG (< 2 seconds)
- 4 images at 3 MB each = 12 MB total (under 4.5 MB per-request limit)

**Fallback:**
- If compression fails, use original file
- Will fail at Vercel limit if original > 4.5 MB
- User sees clear error message

---

<a name="adr-010"></a>
## ADR-010: Fuzzy Matching for Identity, Exact for Warning

**Status:** Accepted  
**Date:** 2026-06-14 (Session 01, 02)  
**Principle:** "Don't cry wolf on trivial differences"

### Context

Two types of fields with different tolerances:
1. **Identity fields:** Brand name, class/type (subject to typography/OCR variations)
2. **Regulatory text:** Government warning (subject to strict compliance)

**The "STONE'S THROW" problem:** OCR might read "Stone's Throw" vs "STONE'S THROW" vs "Stones Throw" → Should all be MATCH, not false alarms.

**The title-case rejection:** Agents catch this in the field → "Government Warning" (title case) is regulatory MISMATCH.

### Decision

**Dual matching philosophy:**

#### Identity Fields (Brand Name, Class/Type):
```typescript
// Normalize: lowercase, trim, collapse whitespace, strip quotes
const norm = (s) => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/['"]/g, '');

if (norm(app) === norm(label)) → MATCH
else if (levenshteinSimilarity >= 0.9) → NEEDS_REVIEW (possible typo/OCR)
else → MISMATCH
```

**Normalization removes:**
- Case differences ("old tom" vs "Old Tom")
- Extra whitespace ("Old  Tom" vs "Old Tom")
- Quote variations ("Stone's" vs "Stone's")
- Typography ("—" vs "-")

#### Government Warning (Exact Match):
```typescript
// Zero tolerance - report ALL failures:
1. Warning missing → MISMATCH
2. Header not all caps ("Government Warning" vs "GOVERNMENT WARNING") → MISMATCH
3. Header not bold → NEEDS_REVIEW (best-effort detection)
4. Body text differs → MISMATCH with word-level diff
```

**Only allowed normalizations:**
- Collapse whitespace/line breaks
- Unify hyphenation artifacts ("alco-holic" → "alcoholic")

**NOT allowed:**
- Case changes
- Word substitutions
- Punctuation changes

### Rationale

**Why fuzzy for identity:**
- OCR variations common ("O" vs "0", "l" vs "1")
- Typography differences ("—" vs "-")
- Case differences not material to brand identity
- Prevents false alarms that waste agent time

**Why exact for warning:**
- Regulatory requirement (27 CFR 16.21)
- Real rejection case: title-case header rejected by TTB
- ANY deviation might indicate non-compliance
- Agents trained to catch these errors

**Why Levenshtein threshold = 0.9:**
- Allows 1-2 character differences
- Catches common OCR errors ("DISTILLRY" vs "DISTILLERY")
- Routes to NEEDS_REVIEW (not auto-pass, not auto-fail)
- Conservative (avoids false positives)

### Consequences

**Positive:**
- ✅ Reduces false alarms (brand name variations don't fail)
- ✅ Catches regulatory violations (warning must be exact)
- ✅ Matches agent workflow (how they manually review)
- ✅ Explainable to users (simple rules)

**Negative:**
- ❌ Manual threshold tuning (0.9 might be too strict/loose)
- ❌ Cannot handle semantic equivalence ("whiskey" vs "whisky")
- ❌ Government warning detection fragile (bold detection from photo)

**Edge Cases Handled:**
- "Old Tom" vs "Old Tom's" → NEEDS_REVIEW (Levenshtein = 0.93)
- "BOURBON" vs "Bourbon" → MATCH (normalized)
- "Government Warning:" → MISMATCH (not all caps)
- "GOVERNMENT WARNING:" → Check body text (might still fail)

**Future Enhancements:**
- Add synonym dictionary ("whiskey" = "whisky")
- Improve bold detection (currently best-effort)
- Add confidence score to warning match (not binary pass/fail)

---

## Summary of Cross-Cutting Themes

### Theme 1: Speed is Critical
- Target: < 5 seconds total processing time
- Prior vendor pilot failed at 30-40 seconds
- Every decision optimized for speed:
  - Client-side processing (no upload lag)
  - Pure function comparison (no API calls)
  - Client-side compression (smaller uploads)
  - Haiku model (faster than Sonnet)

### Theme 2: Accessibility for Elderly Users
- Target: 73-year-old agents with minimal tech experience
- Every UX decision considers:
  - Large fonts (14px minimum, 16px default)
  - Simple navigation (single-page, no complex routing)
  - Plain-English errors (no jargon)
  - High contrast (green/red/yellow verdicts)
  - Icon + color + text (never color alone)

### Theme 3: Privacy by Design
- No database, no persistence
- Files never leave client until verification
- Export instead of save
- No cookies, no tracking
- Zero GDPR compliance burden

### Theme 4: Deterministic Over Probabilistic
- Pure function comparison (not LLM)
- Deterministic confidence scoring (not ML)
- Explicit rules (not learned patterns)
- Testable, explainable, tunable

### Theme 5: Simplicity Over Features
- Single-page architecture (not multi-page)
- Four package layouts (not arbitrary nesting)
- Client-side processing (not server complexity)
- 45% less code than multi-page design
- User directive: "As clean and simplified as possible"

---

## Evolution Path

### Completed Phases:
- ✅ Phase 1: Core Verification Engine (M1, M2, G1)
- ✅ Phase 2: Package Loading & Multi-Image (G2, G3)
- ✅ Phase 3: UI Polish & Deployment (M4)
- ✅ Phase 4: Advanced Batch Workflow & UX (UX1-5)
- ✅ Phase 5: Evaluation & Accuracy (G4a, G4b)
- ✅ Accessibility Improvements (Session 06)
- ✅ Developer Tooling (Application Maker)

### Deferred:
- G4c: Accuracy Dashboard UI (optional - metrics available via CLI)

### Future Enhancements:
- Real-world accuracy testing (Application Maker enables this)
- TTB COLA Registry integration (automated label fetching)
- Synonym dictionary for comparison logic
- ML-based confidence scoring (after collecting data)
- User-configurable font size preference

---

**Document Status:** Living document - update as new decisions are made  
**Review Cycle:** After each major feature or architectural change  
**Owner:** Development team
