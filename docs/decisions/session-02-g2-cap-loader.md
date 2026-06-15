# Session 02: G2 CAP Loader Implementation

**Date:** 2026-06-14  
**Phase:** M3-G2 (CAP Loader with JSZip & JSON Schema Validation)  
**Context:** Building on completed G1 (queue-based architecture), implementing package loading for COLA Application Packages

---

## 1. Major Design Decisions

### Decision 1: Client-Side ZIP Processing with JSZip
**What was decided:** All ZIP file handling happens in the browser using JSZip library. No server-side ZIP processing.

**Why:**
- Vercel's 4.5 MB body limit forbids uploading whole ZIPs to server
- Client-side processing avoids serverless function timeouts on large batches
- Privacy by design - no package files stored server-side
- Browser sandbox provides security isolation

**Alternatives considered:**
- Server-side ZIP handling: Rejected due to Vercel body limits and serverless timeout concerns
- Stream-based chunked upload: Rejected as overly complex for prototype scope

**Trade-offs:**
- ✅ Gained: No body-size limits, instant validation feedback, better privacy
- ❌ Lost: Cannot process packages in environments without JavaScript

### Decision 2: Four Package Layout Types
**What was decided:** Support exactly four CAP package layouts with auto-detection:
1. **Package-zip**: Single `application.json` + images in one archive
2. **Batch-zip**: Multiple subfolders, each containing `application.json` + images  
3. **Manifest-mode**: Root `applications.json` (array) + shared images
4. **Loose-drop**: `application.json` + images dropped as separate files (no ZIP)

**Why:**
- Mirrors real-world COLA export variations (discovered from TTB documentation research)
- Batch-zip supports peak-season workflow (200-300 applications at once)
- Loose-drop preserves G1 single-file drag-drop UX for backwards compatibility
- Manifest-mode efficient for programmatically generated packages

**Alternatives considered:**
- Single layout only: Rejected as insufficient for real-world TTB workflows
- Arbitrary folder nesting: Rejected as ambiguous (how many levels deep to search?)

**Trade-offs:**
- ✅ Gained: Flexibility for various TTB export formats, user choice
- ❌ Lost: Slightly more complex detection logic (~100 LOC)

**Implementation note:** User modified line 78 of `cap-loader.ts` from `subfolderCount > 1` to `subfolderCount >= 1` to handle single-subfolder batch ZIPs (valid edge case).

### Decision 3: JSON Schema Validation with AJV
**What was decided:** Define comprehensive JSON Schema (`cap-schema.json`) and validate all packages with AJV library before processing.

**Why:**
- Plain-English error messages guide users to fix malformed packages
- Catches structural issues before expensive Claude API calls
- Security: prevents injection attacks via malformed JSON
- Schema serves as machine-readable documentation of CAP format

**Alternatives considered:**
- Manual field checks (existing in G1): Rejected as insufficient (doesn't validate enums, types, patterns)
- TypeScript types only: Rejected - types are compile-time, not runtime validation

**Trade-offs:**
- ✅ Gained: Detailed error messages, security, self-documenting format
- ❌ Lost: ~50 KB bundle size (AJV library), slightly slower parsing (~5ms per package)

### Decision 4: Progressive Validation at Drop-Time
**What was decided:** Parse and validate packages immediately when dropped, before user clicks "verify" button. Display errors in real-time via alerts.

**Why:**
- Fast feedback loop - user sees problems instantly
- Prevents invalid packages from clogging the queue
- Matches user mental model (drop → immediate feedback)
- Aligns with "73-year-old usability" requirement (clear, immediate errors)

**Alternatives considered:**
- Defer validation to queue processing: Rejected - user wouldn't know about errors until later
- Silent failure with queue error badges: Rejected - not obvious enough for non-technical users

**Trade-offs:**
- ✅ Gained: Immediate user feedback, clearer error handling
- ❌ Lost: None significant (parsing is fast, <100ms for typical packages)

### Decision 5: Duplicate Detection by TTB ID / Serial Number
**What was decided:** Scan batch packages for duplicate `ttbId` and `serialNumber` fields. Warn user but do not block loading.

**Why:**
- Duplicates might indicate user error (same package dropped twice)
- TTB ID is unique identifier in COLA system
- Warning-only allows intentional duplicates (e.g., testing same app with different images)

**Alternatives considered:**
- Auto-dedupe: Rejected - ambiguous which package to keep
- Hard-block duplicates: Rejected - might be intentional for testing/comparison

**Trade-offs:**
- ✅ Gained: Helps catch accidental duplicates
- ❌ Lost: Doesn't prevent duplicates from reaching queue (user must manually remove)

---

## 2. User Requirements Discovered

### Explicit Requirements
1. **Support CAP package drops** - User explicitly requested drag-and-drop for `.zip` files containing application data + images
2. **Preserve G1 behavior** - Single `application.json` drop must still work (backwards compatibility)
3. **Template download** - Provide example `application.json` for users to customize
4. **Plain-English errors** - Validation failures must be actionable, not technical

### Implicit Requirements
1. **Batch size ~200 applications** - Inferred from "peak season" context (200-300 apps at once)
2. **Multiple subfolders = batch** - User's manual edit (`>= 1` vs `> 1`) revealed single-subfolder batches are valid
3. **No server-side persistence** - Privacy requirement carries over from G1 (no database, no uploads)

### Constraints
- **4.5 MB Vercel body limit** - Hard constraint forcing client-side ZIP handling
- **Serverless timeout** - 10-second limit prevents large batch processing on server
- **Browser compatibility** - Must work in standard browsers (Chrome, Firefox, Edge)

### Success Criteria
- ✅ All 4 package layouts load correctly
- ✅ Validation errors are plain-English and actionable
- ✅ No regressions in G1 functionality (all 63 unit tests + 8 fixtures pass)
- ✅ Average processing time stays under 5 seconds per application

---

## 3. Technical Implementation Patterns

### Pattern 1: Layout Auto-Detection via File Structure Inspection
```typescript
// Inspection logic in loadZipPackage()
const hasRootApplicationJSON = files.includes("application.json");
const hasRootApplicationsJSON = files.includes("applications.json");
const subfolderCount = new Set(files.filter(f => f.includes("/")).map(f => f.split("/")[0])).size;

if (hasRootApplicationJSON) return loadPackageZip(); // Single app
else if (hasRootApplicationsJSON) return loadManifestZip(); // Array manifest
else if (subfolderCount >= 1) return loadBatchZip(); // Subfolders
```

**Why this approach:**
- Deterministic (no ambiguity)
- Fast (O(n) scan of filenames)
- Explicit error when structure is unrecognized

### Pattern 2: AJV Error Transformation to Plain-English
```typescript
// Transform AJV's technical errors to user-friendly messages
switch (err.keyword) {
  case 'required': message = `${err.params.missingProperty} is required`;
  case 'enum': message = `Must be one of: ${err.params.allowedValues.join(', ')}`;
  // ... etc
}
```

**Why this approach:**
- AJV errors are developer-focused (e.g., "must have required property 'brandName'")
- Plain-English version: "brandName is required — cannot verify without brand name"
- Matches 73-year-old usability requirement

### Pattern 3: File Objects from ZIP Blobs
```typescript
// Convert JSZip blob to File object for upload
const blob = await imgFile.async("blob");
const file = new File([blob], imgRef.file, { type: `image/${getExtension(imgRef.file)}` });
```

**Why this approach:**
- File objects are compatible with existing FormData upload code (no changes to `/api/verify`)
- Preserves original filename
- Correct MIME type for image compression

### Pattern 4: Error Accumulation (Non-Fatal Failures)
```typescript
// Continue processing even if one package fails
for (const folder of subfolders) {
  try {
    const cap = parseApplicationJSON(jsonText);
    // ... extract images ...
    result.applications.push({ cap, images, source });
  } catch (error: any) {
    result.errors.push({ source, message: error.message }); // Log and continue
  }
}
```

**Why this approach:**
- One bad package shouldn't block the entire batch
- Partial success is better than total failure
- User sees which packages succeeded and which failed

---

## 4. User Experience Decisions

### Decision 1: Unified Drop Zone (No Separate "Batch" Area)
**What was decided:** ApplicationForm's existing drag-drop area handles both single JSON and CAP packages. No separate drop zone for batches.

**Why:**
- Simpler mental model - "drop your application data here" (format-agnostic)
- Reduces UI clutter
- Auto-detection removes need for user to pre-classify format

**Alternatives considered:**
- Separate "Batch" drop zone: Rejected as confusing (user must decide format before dropping)
- Tab-based switching: Rejected as unnecessary complexity

### Decision 2: Alert-Based Error Display
**What was decided:** Show validation errors via browser `alert()` dialogs, not inline UI.

**Why:**
- Blocking modal ensures user sees the error immediately
- Simple to implement (no new UI components)
- Matches prototype scope (not production-grade yet)

**Limitations accepted:**
- Alerts are not beautiful or branded
- Multiple errors shown sequentially (not all at once)
- Deferred to future: inline error badges per package

### Decision 3: Download Template Link Placement
**What was decided:** "Download template" link placed next to "Load sample" in ApplicationForm header.

**Why:**
- Contextual - appears where user enters application data
- Visible but not prominent (template is for advanced users)
- Parallel to "Load sample" (both are data-entry aids)

---

## 5. Scope Decisions

### Explicitly Out of Scope for G2
1. **Multi-image extraction** - Sending all 1-4 images in one Claude API call (deferred to G3)
2. **`foundOn` field** - Tracking which label panel (front/back/neck) each field was found on (G3)
3. **Sample dataset generation** - 200-application test set with ground truth (G4)
4. **"Load sample dataset" button** - Needs sample zip to exist first (G4)
5. **CSV export enhancements** - Basic export works; detailed improvements deferred

### Features Cut/Simplified
1. **Auto-dedupe logic** - Originally planned, reduced to warning-only (simpler)
2. **Inline error badges** - Originally planned per-package UI, reduced to alerts (prototype scope)
3. **Package preview** - Originally planned to show package contents before loading, cut (unnecessary)

### "Good Enough" Trade-Offs
1. **Alert dialogs instead of toast notifications** - Acceptable for prototype, less elegant
2. **No package size limits** - JSZip handles reasonably large files; no artificial cap imposed
3. **Basic error messages** - Plain-English but not perfectly polished (e.g., no "Did you mean...?" suggestions)

---

## 6. Open Questions and Future Work

### Known Limitations Accepted
1. **Browser-only** - CAP loader requires JavaScript; no server-side fallback
2. **No progress bar during ZIP extraction** - Fast enough (<500ms) that it's not critical
3. **Duplicate warning but no auto-resolution** - User must manually remove duplicates from queue

### Features Deferred to Later Phases
1. **G3: Multi-image extraction**
   - Send 1-4 images in single Anthropic API call
   - Add `foundOn` field to ExtractedLabel (front/back/neck tracking)
   - Update VerdictCard UI to show panel location badges

2. **G4: Sample data pipeline**
   - Generate ~200 realistic CAP packages from Kaggle dataset
   - Inject 15% defects at known rate for ground truth
   - Wire up "Load sample dataset" button
   - Extend eval harness to test against sample-data ground truth

3. **Future UX improvements**
   - Replace alerts with toast notifications (less intrusive)
   - Inline error badges per package in queue
   - Package preview/inspector before loading
   - Auto-dedupe with user confirmation dialog

### Technical Debt to Address
1. **Error message polish** - Could add suggestions/hints for common mistakes
2. **Bundle size** - AJV adds ~50 KB; consider lighter validator if critical
3. **Type safety** - `manifest[i] as CAPApplication` cast could be stricter

---

## Key Takeaways

1. **Client-side processing unlocks flexibility** - No body limits, instant feedback, better privacy
2. **Four layouts handle real-world variance** - Single approach wouldn't fit TTB workflows
3. **JSON Schema is force multiplier** - Self-documenting, security, and UX win
4. **Progressive validation = better UX** - Immediate feedback trumps deferred errors
5. **Error accumulation > fail-fast** - One bad package shouldn't block entire batch
6. **Prototype scope matters** - Alerts acceptable now; can polish later without rework

---

## Artifacts Created

### New Files
- `lib/cap-schema.json` - JSON Schema definition (107 lines)
- `lib/cap-loader.ts` - ZIP parsing, layout detection, validation (450 lines)
- `public/cap-template.json` - Downloadable template (22 lines)

### Modified Files
- `package.json` - Added jszip@^3.10.1, ajv@^8.12.0
- `lib/types.ts` - Added PackageLayout, LoadResult, ValidationError types
- `lib/cap-utils.ts` - Added validateCAP() with schema validation
- `components/ApplicationForm.tsx` - Enhanced drop handler for CAP packages
- `app/page.tsx` - Added handlePackagesLoaded() integration

### Verification Results
- ✅ All 63 unit tests passing (no regressions)
- ✅ All 8 fixture tests passing (~2.3s average)
- ✅ JSON Schema validates format correctly
- ✅ All 4 package layouts tested and working

---

## References
- M3-AMENDMENT.md §C (CAP format specification)
- M3-AMENDMENT.md §G2 (implementation steps)
- JSON Schema Draft 07 spec
- JSZip documentation (3.10.1)
- AJV documentation (8.12.0)
