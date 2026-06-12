# Batch Triage Workflow Implementation Checkpoint

**Date**: 2026-06-11  
**Status**: Phase 1 Complete (Backend Foundation)

## ✅ Completed

### Phase 1: Backend Foundation - Confidence Scoring

**Files Modified:**
1. ✅ `lib/types.ts` - Added:
   - `FieldConfidence` interface
   - `ApplicationConfidence` interface
   - `WorkflowState` type
   - `BatchStatistics` interface
   - Extended `FieldVerdict` with optional `confidence` field
   - Extended `VerificationResult` with optional `applicationConfidence` field
   - Extended `QueueItem` with `workflowState`, `reviewedAt`, `reviewNotes`

2. ✅ `lib/config.ts` - Added:
   - `CONFIDENCE_THRESHOLD = 0.85`
   - `LOW_CONFIDENCE_THRESHOLD = 0.60`

3. ✅ `lib/confidence.ts` - Created new file with:
   - `calculateFieldConfidence()` - Calculates 0-1 confidence based on image quality, field extraction, comparison strength
   - `calculateWarningConfidence()` - Binary check for government warning (pass = 1.0, fail = 0.0)
   - `calculateApplicationConfidence()` - Uses minimum (weakest link) of all field confidences

4. ✅ `app/api/verify/route.ts` - Modified:
   - Imports confidence calculation functions
   - Calculates confidence for each field verdict
   - Returns `applicationConfidence` in response
   - Backward compatible (confidence fields are optional)

**What's Working:**
- API now returns confidence scores with every verification
- Confidence based on image quality (high/medium/low), field extraction success, and verdict strength
- Application-level confidence = minimum of all field confidences (weakest link principle)

---

## 🚧 Next: Phase 2-7 (UI Implementation)

### Phase 2: Triage Logic

**File to Create: `lib/triage.ts`**
```typescript
import { CONFIDENCE_THRESHOLD } from "./config";
import type { VerificationResult, WorkflowState } from "./types";

export function triageApplication(result: VerificationResult): WorkflowState {
  if (!result || !result.verdicts || result.verdicts.length === 0) {
    return "error";
  }

  const { overall, applicationConfidence } = result;

  // Auto-pass conditions:
  // 1. Overall verdict is MATCH
  // 2. Application confidence >= threshold (0.85)
  // 3. No fields flagged for review
  if (
    overall === "MATCH" &&
    applicationConfidence &&
    applicationConfidence.overall >= CONFIDENCE_THRESHOLD &&
    !applicationConfidence.needsReview
  ) {
    return "auto_passed";
  }

  // Everything else needs review
  return "needs_review";
}

export function calculateBatchStatistics(queue: QueueItem[]): BatchStatistics {
  const completed = queue.filter(
    (item) => item.status === "completed" && item.result
  );

  const byWorkflowState: Partial<Record<WorkflowState, number>> = {};
  completed.forEach((item) => {
    const state = item.workflowState || "needs_review";
    byWorkflowState[state] = (byWorkflowState[state] || 0) + 1;
  });

  const byVerdict = {
    match: completed.filter((item) => item.result?.overall === "MATCH").length,
    mismatch: completed.filter((item) => item.result?.overall === "MISMATCH")
      .length,
    needsReview: completed.filter(
      (item) => item.result?.overall === "NEEDS_REVIEW"
    ).length,
  };

  const confidences = completed
    .map((item) => item.result?.applicationConfidence?.overall || 0)
    .filter((c) => c > 0);
  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

  const times = completed.map((item) => item.result?.processingMs || 0);
  const processingTimeMs = {
    min: Math.min(...times),
    max: Math.max(...times),
    avg: times.reduce((sum, t) => sum + t, 0) / times.length,
  };

  const autoPassCount = byWorkflowState.auto_passed || 0;
  const autoPassRate = completed.length > 0 ? autoPassCount / completed.length : 0;

  const reviewQueueSize = byWorkflowState.needs_review || 0;

  return {
    total: queue.length,
    byWorkflowState,
    byVerdict,
    averageConfidence,
    processingTimeMs,
    autoPassRate,
    reviewQueueSize,
  };
}
```

### Phase 3: Upload Batch Page

**File to Create: `app/upload/page.tsx`**
- Copy structure from `mockups/upload-batch.html`
- Use existing CAP loader (`lib/cap-loader.ts`)
- Drag-and-drop zone component
- Validation preview table
- "Start Verification" → navigate to `/dashboard` with queue items

**Key Components Needed:**
- `components/BatchUploadZone.tsx` - Drag-and-drop (reuse CAP loader)
- `components/ValidationPreviewTable.tsx` - Show parsed apps before processing

### Phase 4: Batch Dashboard with Inspector

**File to Create: `app/dashboard/page.tsx`**
- Copy structure from `mockups/batch-dashboard-with-inspector.html`
- Master-detail layout: table (40%) + inspector panel (60%)
- Click row to open inspector
- Approve/Reject → auto-advance to next needs_review item

**Key Components Needed:**
1. `components/BatchStatsBar.tsx` - Inline statistics (Processing: X/Y, Passed, Needs Review, Failed, Avg Confidence)
2. `components/FilterBar.tsx` - Filter buttons (All, Needs Review, Failed, Passed) + sort dropdown + search
3. `components/ResultsTable.tsx` - Table with columns: ID, Confidence bar, Issue summary
4. `components/InspectorPanel.tsx` - Slide-out panel with:
   - Header (app ID, prev/next/close buttons)
   - Split layout: ImageViewer (30%) + FieldComparisonTable (70%)
   - Action bar (Approve/Reject buttons)

### Phase 5: Update Navigation

**Files to Modify:**
1. `app/layout.tsx` - Add left sidebar navigation:
   - Logo: "LV" + "Label Verify"
   - Nav items: Upload Batch, Batch Dashboard
   - Version info footer

2. `app/page.tsx` - Root page:
   - Option A: Redirect to `/upload`
   - Option B: Show quick-start with test bench + link to batch upload

---

## 📋 Implementation Order (Recommended)

1. ✅ Phase 1: Backend confidence (DONE)
2. ⏳ Create `lib/triage.ts`
3. ⏳ Create left sidebar nav in `app/layout.tsx`
4. ⏳ Create `app/upload/page.tsx` (simpler, no inspector complexity)
5. ⏳ Create dashboard components one-by-one
6. ⏳ Create `app/dashboard/page.tsx` (complex, do last)
7. ⏳ Update `app/page.tsx` routing
8. ⏳ Test end-to-end workflow

---

## 🎨 Design Reference

All UI mockups approved in: `mockups/`
- `upload-batch.html` - Upload interface with validation
- `batch-dashboard-with-inspector.html` - Master-detail unified view

**Key Design Decisions:**
- Just 2 pages: Upload → Dashboard (with integrated inspector)
- No separate review queue page (redundant with filters)
- No separate inspector page (integrated slide-out panel)
- Left sidebar navigation (48px width)
- Master-detail split: table 40%, inspector 60%
- Click any row to open inspector (no separate button)
- Approve/Reject auto-advances to next needs_review item

---

## 🔧 Code Reuse Opportunities

**Already Exists (Don't Recreate):**
- `lib/cap-loader.ts` - CAP package parsing (4 layouts)
- `lib/semaphore.ts` - Concurrency control (5 parallel)
- `lib/image-compression.ts` - Client-side image compression
- `components/VerdictCard.tsx` - Field verdict display (enhance with confidence)
- `components/ImageUpload.tsx` - Drag-and-drop base (reuse patterns)

**Existing Queue Logic in `app/page.tsx`:**
- Lines 49-131: `processQueueItem()` - Image compression + API call
- Lines 134-182: Auto-processing with semaphore
- Lines 225-265: CAP package loading integration

Can extract and reuse in dashboard context.

---

## 🧪 Testing Checklist (After Full Implementation)

1. [ ] Upload single application → verify → see confidence scores
2. [ ] Upload batch (use `sample-data/cola-sample-small.zip`)
3. [ ] Filter "Needs Review" → see only low-confidence items
4. [ ] Click row → inspector opens with highlighted row
5. [ ] Approve → row updates, advances to next needs_review
6. [ ] Reject → row updates, advances to next needs_review
7. [ ] Close inspector → table expands to full width
8. [ ] Browser refresh → queue state preserved (localStorage)
9. [ ] Check statistics: auto-pass rate, avg confidence
10. [ ] Multi-image (1-4 images) → all panels shown in inspector

---

## 📝 Notes

- All changes are backward-compatible (confidence fields optional)
- Existing test bench in `app/page.tsx` still works
- No database/persistence - queue in React state + localStorage
- Confidence calculation is deterministic (no ML)
- Semantic versioning: This is v1.0 with batch workflow (was M3)
