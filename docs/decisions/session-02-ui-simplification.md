# Session 02: UI Simplification - Batch Triage Workflow Design

**Date:** 2026-06-14  
**Focus:** Designing batch triage workflow UI with confidence scoring - simplified single-page approach  
**Status:** Planned - awaiting implementation

---

## 1. Major Design Decisions

### Decision 1.1: Single-Page Architecture vs Multi-Page Navigation
**What was decided:** Keep the existing single-page architecture and enhance it with confidence-based triage features rather than creating multiple new pages (upload, dashboard, review-queue, inspector as separate routes).

**Why:**
- User explicitly requested "as clean and simplified of an interface" as possible
- Current architecture already has an excellent unified queue design (always-batch philosophy)
- Adding multiple pages would increase complexity, not decrease it
- No context switching = simpler mental model
- Existing page already handles both single and batch modes seamlessly

**Alternatives considered:**
1. **Multi-page approach** (initially planned):
   - Separate `/upload` page for batch validation
   - Separate `/dashboard` page for results with statistics
   - Separate `/review-queue` page filtered to needs_review items
   - Separate `/inspector/[id]` page for detail view
   - **Rejected:** Adds navigation complexity, requires state management across routes, more code (~2,200 lines vs ~1,250 lines)

2. **Dashboard + review queue as separate pages** (inspired by OCR mockup):
   - Dashboard shows all items, review queue filters to needs_review
   - **Rejected:** Same data, different filter = unnecessary page duplication
   - Can achieve with in-page filter toggle

3. **Inspector as full page**:
   - **Rejected:** Forces navigation away from results table, loses context
   - Side panel drawer provides same detail without leaving page

**Trade-offs:**
- **Gained:** 
  - 45% less code (1,250 new lines vs 2,200)
  - No routing complexity
  - No navigation mental overhead
  - Faster development
  - Easier maintenance
  - State management stays simple (single page context)
- **Sacrificed:** 
  - Less "app-like" feel (no page transitions)
  - Can't bookmark specific application detail views (acceptable - no persistence anyway)
  - Slightly more crowded single page (mitigated by progressive disclosure)

**Implementation approach:**
- Entry section (form + image upload) at top
- Statistics cards appear when queue has items
- Filter bar for view toggling (All | Needs Review | Mismatches | Auto-Passed)
- Enhanced results table with confidence column
- Inspector side panel slides in from right (50% overlay)

---

### Decision 1.2: Confidence Scoring System (Deterministic Heuristics)
**What was decided:** Add field-level and application-level confidence scores (0.0-1.0) calculated from deterministic heuristics, not ML models.

**Why:**
- Current system only has categorical verdicts (MATCH/MISMATCH/NEEDS_REVIEW)
- Cannot distinguish "high-confidence MATCH" (auto-pass) vs "low-confidence MATCH" (needs review)
- Triage workflow requires quantitative scoring to route intelligently
- Deterministic calculation is explainable, tunable, and fast

**Confidence calculation approach:**
```typescript
// Base factors:
- Image quality (from Claude extraction): high/medium/low → 1.0/0.75/0.5 multiplier
- Field extraction success: Found = 1.0, Not found = 0.5 max
- Comparison strength:
  - Exact normalized match = 1.0
  - Fuzzy match (Levenshtein 0.9-1.0) = 0.85-0.95 graduated
  - Numeric exact match = 1.0, parse errors = 0.3
  - Government warning all checks pass = 1.0, any fail = 0.0
- Application confidence: Minimum of all field confidences (weakest link)
```

**Thresholds:**
- `CONFIDENCE_THRESHOLD = 0.85` → Auto-pass if overall ≥ 85% and verdict is MATCH
- `LOW_CONFIDENCE_THRESHOLD = 0.60` → Flag for careful review

**Alternatives considered:**
1. **ML-based confidence scoring**:
   - Train a model to predict confidence from features
   - **Rejected:** Adds ML pipeline complexity, needs training data, less explainable
   
2. **LLM-based confidence**:
   - Ask Claude "How confident are you?" after extraction
   - **Rejected:** Adds API call latency/cost, LLMs are poor at self-assessment

3. **Average application confidence** (instead of minimum):
   - **Rejected:** Could mask a low-confidence critical field (government warning at 40%, brand at 99% → average 70% might auto-pass when it shouldn't)

**Trade-offs:**
- **Gained:**
  - Fast calculation (no API calls)
  - Explainable (can show user exactly why confidence is X%)
  - Tunable via config constants
  - Deterministic (same input always yields same confidence)
- **Sacrificed:**
  - Cannot leverage ML nuance (e.g., semantic similarity beyond Levenshtein)
  - Manual threshold tuning required
  - Fixed formula (not adaptive to data)

**Validation plan:** Test with sample dataset, tune thresholds to achieve ~60-70% auto-pass rate (balance automation vs safety).

---

### Decision 1.3: Inspector as Side Panel Drawer vs Expandable Row
**What was decided:** Add an optional inspector side panel that slides in from the right (50% width overlay) in addition to keeping the existing expandable row functionality.

**Why:**
- Expandable rows work well for quick review but lack image viewer
- Full-page inspector requires navigation (rejected for single-page approach)
- Side panel provides rich detail view without losing table context
- Users can still see other results while inspecting one item

**Panel contents:**
- Top: Image viewer with tabs (front/back/neck) and zoom controls
- Middle: Scrollable field verdicts with confidence gauges
- Bottom (fixed): Approve/Reject/Flag action buttons + notes textarea + Next/Previous navigation

**Alternatives considered:**
1. **Keep only expandable rows** (current state):
   - **Rejected:** Can't show image viewer (would expand row too much), no zoom controls
   
2. **Modal overlay** (centered, dims background):
   - **Rejected:** Blocks table view entirely, feels more disruptive than drawer

3. **Full-page inspector**:
   - **Already rejected** (see Decision 1.1)

4. **Left-side panel** (opens from left):
   - **Rejected:** Right-side feels more natural for "detail view" (Western reading pattern: overview left, detail right)

**Trade-offs:**
- **Gained:**
  - Rich image viewing without leaving page
  - Table remains visible (can compare items)
  - Keyboard navigation (N/P/ESC) for efficient review
  - Can add future features (rotate, annotations) without page redesign
- **Sacrificed:**
  - Adds ~400 lines of component code
  - Covers 50% of table (mitigated: only opens on demand)
  - More complex state management (panel open/close, current item)

**UX considerations:**
- Panel slides in smoothly (CSS transition)
- ESC key closes panel
- N/P keys navigate to next/previous needs_review item
- Click outside panel closes it (or explicit X button)

---

### Decision 1.4: Workflow State Machine with Auto-Pass Routing
**What was decided:** Introduce workflow states beyond simple status (pending/processing/completed/error) to track triage decisions.

**States:**
```typescript
type WorkflowState = 
  | "pending"       // Not yet processed
  | "processing"    // Currently being verified
  | "auto_passed"   // High confidence MATCH, no review needed
  | "needs_review"  // Low confidence or MISMATCH/NEEDS_REVIEW
  | "approved"      // Human reviewed and approved
  | "rejected"      // Human reviewed and rejected
  | "flagged"       // Flagged for supervisor review
  | "error"         // Processing failed
```

**Routing logic:**
```typescript
if (overall === "MATCH" && confidence >= 0.85 && !hasLowConfidenceFields) {
  → auto_passed
} else {
  → needs_review
}
```

**Why:**
- Enables HITL (human-in-the-loop) triage workflow
- Reduces human workload by auto-passing high-confidence matches
- Tracks human decisions (approved/rejected/flagged) for reporting
- Supports workflow metrics (auto-pass rate, review queue size)

**Alternatives considered:**
1. **Binary pass/fail** (no auto-pass):
   - **Rejected:** Forces human review of every item, even perfect matches
   
2. **Three-state only** (needs_review, approved, rejected):
   - **Rejected:** Loses visibility into which items were auto-passed vs manually approved
   
3. **More granular states** (e.g., "under_review" separate from "needs_review"):
   - **Accepted as optional:** Can track when user opens inspector panel
   - Not critical for MVP

**Trade-offs:**
- **Gained:**
  - Measurable automation (X% auto-passed)
  - Clear review queue (only needs_review items)
  - Audit trail (who approved/rejected what)
- **Sacrificed:**
  - More complex state management
  - Must handle state transitions correctly
  - Risk of auto-passing incorrectly (mitigated by conservative 85% threshold)

**Validation:** Monitor auto-pass rate and false positive rate in testing.

---

### Decision 1.5: Batch Statistics Cards (Not BatchContext)
**What was decided:** Add statistics calculation and display components but keep state management in page-level React state, not a separate Context.

**Why:**
- Single page doesn't need cross-component state sharing (Context overkill)
- Queue state already in `app/page.tsx` component
- Statistics are derived from queue (not separate state)
- Simpler = better

**Statistics displayed:**
- Total applications
- Auto-Passed (count + percentage)
- Needs Review (count)
- Failed (count)
- Average Confidence (percentage)
- Average Processing Time (min/max/avg)

**Alternatives considered:**
1. **BatchContext with React Context API**:
   - Centralized state management
   - **Rejected:** Unnecessary for single page, adds boilerplate
   
2. **Zustand or Redux state management**:
   - **Rejected:** Massive overkill for simple queue state

3. **No statistics, just queue progress bar** (current state):
   - **Rejected:** Users want to see auto-pass rate, review queue size, etc.

**Trade-offs:**
- **Gained:**
  - Simpler code (no Context boilerplate)
  - Easier to understand (state in one place)
  - Less abstraction
- **Sacrificed:**
  - If we later add multiple pages, may need to refactor to Context
  - Statistics calculated on every render (acceptable - small dataset)

**Implementation:** New file `lib/statistics.ts` with pure functions to calculate stats from queue array.

---

## 2. User Requirements Discovered

### Explicit Requirements
1. **Simplified UI** - User explicitly asked: "Could some of these pages be consolidated? We want as clean and simplified of an interface."
2. **Confidence-based auto-pass** - Route high-confidence matches away from human review
3. **Batch triage workflow** - Inspired by OCR review mockup showing auto-pass vs needs-review distinction
4. **Inspector with image viewer** - Split-screen layout from mockup (image viewer + field comparison)
5. **Approve/Reject/Flag actions** - Human review decisions must be tracked

### Implicit Requirements
1. **Minimal navigation** - User preference for simplicity implies avoiding multi-page apps
2. **Progressive disclosure** - Show statistics only when queue has items
3. **Filtering over navigation** - Toggle view instead of navigating to different pages
4. **Keyboard shortcuts** - Efficient review workflow (N/P/ESC for navigation)
5. **Visual confidence indicators** - Bars, gauges, percentages (not just numbers)

### Constraints Identified
1. **No persistence** - Stateless backend constraint continues (localStorage for browser refresh recovery only)
2. **Client-side processing** - Queue orchestration remains client-side (semaphore pattern)
3. **Code budget** - Prefer simpler solution (1,250 lines) over complex solution (2,200 lines)

### Success Criteria Defined
- Enhanced UI shows confidence scores clearly
- Auto-pass routing reduces human review workload
- Inspector panel provides rich detail view without navigation
- Filter bar enables view toggling without leaving page
- Statistics cards provide batch-level insights

---

## 3. Technical Implementation Patterns

### Pattern 3.1: Confidence Calculation as Pure Functions
**Module:** `lib/confidence.ts`

**Functions:**
```typescript
calculateFieldConfidence(
  verdict: FieldVerdict, 
  imageQuality: 'high' | 'medium' | 'low'
): FieldConfidence

calculateApplicationConfidence(
  verdicts: FieldVerdictWithConfidence[]
): ApplicationConfidence
```

**Rationale:** Pure functions enable unit testing, debugging, and threshold tuning without touching API layer.

---

### Pattern 3.2: Type Extensions (Not Replacements)
**Approach:** Extend existing types instead of replacing them.

```typescript
// Existing
interface FieldVerdict { ... }

// New (extends)
interface FieldVerdictWithConfidence extends FieldVerdict {
  confidence: FieldConfidence;
}

// Existing
interface QueueItem { ... }

// New (extends)
interface TriageQueueItem extends QueueItem {
  workflowState: WorkflowState;
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;
}
```

**Rationale:** Backward compatible - existing code continues to work, new features layer in.

---

### Pattern 3.3: Progressive Component Loading
**Approach:** Components only render when relevant.

```tsx
{queue.length > 0 && <BatchStatisticsCards statistics={stats} />}
{queue.length > 0 && <ResultsFilterBar filter={filter} onFilterChange={...} />}
{inspectorOpen && <InspectorPanel item={selectedItem} onClose={...} />}
```

**Rationale:** Reduces clutter, improves perceived performance, keeps UI clean.

---

### Pattern 3.4: Drawer Component Pattern
**Implementation:** Inspector panel as reusable drawer component.

```tsx
// InspectorPanel.tsx
<div className={`fixed right-0 top-16 bottom-0 w-1/2 
     transform transition-transform
     ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
  {/* content */}
</div>
```

**Features:**
- CSS transform for smooth slide animation
- Fixed positioning (overlays page)
- Keyboard event handlers (ESC to close, N/P to navigate)
- Backdrop click to close

---

## 4. User Experience Decisions

### UX 4.1: Filter Bar Tabs vs Dropdown
**Decision:** Horizontal tab buttons ("All", "Needs Review", "Mismatches", "Auto-Passed") instead of dropdown select.

**Rationale:**
- Tabs make all options visible at once (no click to reveal)
- Active state visually clear (blue background)
- Count badges show distribution (e.g., "Needs Review (42)")
- Familiar UI pattern (browser tabs, app tabs)

**Alternative considered:** Dropdown select (rejected: hides options, requires two clicks, less scannable)

---

### UX 4.2: Confidence as Visual Bars + Percentage
**Decision:** Show confidence both as horizontal bar and percentage number.

**Rationale:**
- Bar provides at-a-glance visual assessment (length = confidence)
- Percentage provides precise value for detail-oriented users
- Color coding (green >85%, yellow 60-85%, red <60%) adds semantic layer
- Redundant encoding (shape + number + color) maximizes accessibility

**Alternative considered:** Just numbers (rejected: less scannable, no visual pattern recognition)

---

### UX 4.3: Statistics Cards Above Table (Not Sidebar)
**Decision:** Horizontal row of 5 compact cards above results table.

**Rationale:**
- Dashboard-style layout familiar to users
- Key metrics at-a-glance (total, auto-passed, needs review, failed, avg confidence)
- Horizontal layout uses vertical space efficiently
- Cards collapse/hide when queue empty (progressive disclosure)

**Alternative considered:** 
- Sidebar (rejected: wastes horizontal space, hard on narrow screens)
- Below table (rejected: must scroll down to see, loses visibility)

---

### UX 4.4: Inspector Panel Width (50%)
**Decision:** Panel covers 50% of screen width when open.

**Rationale:**
- Leaves table visible on left (maintains context)
- Enough space for image viewer + field details
- Not so wide it feels full-page
- Responsive: could be 70% on mobile, 40% on ultrawide (future)

**Alternative considered:**
- 33% (rejected: too narrow for image viewer)
- 67% (rejected: obscures too much of table)
- 100% (rejected: equivalent to new page, loses context)

---

### UX 4.5: Keyboard Shortcuts for Review Flow
**Decision:** N (next needs_review), P (previous), ESC (close inspector), A/R/F (approve/reject/flag).

**Rationale:**
- Keyboard is faster than mouse for repetitive tasks
- Reviewers processing 100s of items need efficiency
- Single-letter shortcuts are quick (no modifier keys needed)
- Mnemonic: N=Next, P=Previous, A=Approve, R=Reject, F=Flag, ESC=Exit

**Implementation:** Event listeners at page level (not input fields to avoid capture).

---

## 5. Scope Decisions

### In Scope (This Session)
1. **Confidence scoring backend** - Field-level and application-level calculation
2. **Triage routing logic** - Auto-pass vs needs-review decision function
3. **Enhanced results table** - Add confidence column and visual bars
4. **Filter bar UI** - Toggle view between all/needs-review/mismatches/auto-passed
5. **Statistics cards** - Batch-level metrics display
6. **Inspector side panel** - Image viewer + field details + review actions

### Out of Scope (Future)
1. **Multi-user review assignment** - "reviewedBy" field exists but no user system
2. **Persistence across devices** - localStorage only (no database)
3. **CSV export** - Deferred to Phase 6 polish
4. **Audit trail** - Workflow state tracking exists but no export/reporting
5. **Review notes requirement enforcement** - Optional for now
6. **Batch upload validation preview** - CAP loader exists, validation table deferred
7. **Advanced statistics** - Time-series charts, confidence distribution histograms

### Features Simplified
1. **BatchContext removed** - Keep state in page component (simpler)
2. **Navigation removed** - Single page instead of multi-page app
3. **Review queue as separate page removed** - Filter bar instead
4. **Upload validation preview** - Deferred (can add later if needed)

### "Good Enough" Decisions
1. **50% inspector width** - Could be adjustable later, fixed is simpler now
2. **No drag-to-resize panel** - Desktop-focused, fixed width acceptable
3. **localStorage only** - No cross-device sync (acceptable for agency desktop use)
4. **Threshold tuning manual** - Start with 0.85 / 0.60, adjust empirically

---

## 6. Open Questions / Future Work

### Decisions Made (No Longer Open)
1. ✅ **Root page behavior** - Keep as-is (test bench + queue results)
2. ✅ **Navigation structure** - Single page (no nav menu needed)
3. ✅ **Inspector layout** - Side panel drawer (not full page)
4. ✅ **Filter approach** - Tabs/buttons (not dropdown)
5. ✅ **State management** - Component state (not Context)

### Remaining Questions (Optional Polish)
1. **Export format:** CSV only, or also JSON/Excel?
2. **Review notes:** Required for rejection only, or optional for all?
3. **Flag reasons:** Predefined dropdown (e.g., "Unclear image") or free-text?
4. **Statistics visibility:** Always show, or only when queue > 0? (Currently: only when queue > 0)
5. **Inspector panel width:** Fixed 50%, or user-adjustable resize handle?
6. **Threshold tuning:** 0.85 / 0.60 hardcoded or UI setting?

### Known Limitations Accepted
1. **No cross-device state sync** - localStorage is device-bound
2. **No undo action** - Approve/reject is immediate (could add later)
3. **No batch operations** - Can't approve/reject multiple items at once
4. **Confidence formula is static** - Not adaptive to user feedback
5. **Inspector doesn't show related items** - Can't see "similar" applications

### Technical Debt to Address
1. **No keyboard shortcut documentation** - Need tooltip or help overlay
2. **localStorage quota** - Large batches (1000+ items) may exceed limit
3. **Performance with large queues** - Table with 1000 rows may lag (pagination?)
4. **No loading state for inspector** - Image viewer could show skeleton
5. **Accessibility audit** - Keyboard nav works but ARIA labels missing

### Features Deferred to Later
1. **Batch upload validation preview table** - Can add when CAP loader usage increases
2. **Advanced filtering** - By confidence range, date, TTB ID, etc.
3. **Sort persistence** - Remember user's preferred sort across sessions
4. **Image annotations** - Markup/highlight fields on label image
5. **Comparison mode** - Side-by-side compare two applications

---

## 7. Architecture Evolution

### How We Got Here
1. **Initial plan:** Multi-page app (upload → dashboard → review-queue → inspector)
   - Inspired by enterprise OCR review UI mockup
   - Separate pages for separate concerns
   
2. **User feedback:** "Could pages be consolidated? We want as clean and simplified of an interface."
   - Triggered re-evaluation of complexity
   
3. **Exploration findings:** Current single-page architecture is already excellent
   - Always-batch design (single = batch of 1)
   - Unified results table with triage sort
   - No separate batch mode
   
4. **Revised plan:** Enhance existing page instead of adding new pages
   - Add confidence scoring (backend + display)
   - Add filter bar (in-page view toggling)
   - Add inspector panel (side drawer, not new page)
   - Keep single-page simplicity

### What Changed and Why
| Original Plan | Revised Plan | Reason for Change |
|---------------|--------------|-------------------|
| 4 new pages (upload, dashboard, review-queue, inspector) | 0 new pages | User wants simplicity, single page works |
| BatchContext for state management | Page-level component state | Unnecessary abstraction for single page |
| Navigation menu with active states | No navigation menu | No pages to navigate between |
| Review queue as separate page | Filter bar in-place | Same data, just filtered |
| Inspector as full page `/inspector/[id]` | Inspector as side panel drawer | Keeps table context visible |
| ~2,200 new lines of code | ~1,250 new lines of code | 45% reduction in complexity |

### Architectural Principles Reinforced
1. **Keep it simple** - Prefer enhancement over replacement
2. **Progressive disclosure** - Show complexity only when needed
3. **Spatial consistency** - Everything in one place (no context switching)
4. **Additive changes** - Extend types, don't replace them
5. **Pure functions for logic** - Confidence calculation follows existing pattern

---

## 8. Mockups Created

### HTML Mockups (for visualization)
1. **upload-page.html** - Multi-page approach (rejected)
2. **dashboard.html** - Statistics + filterable table (rejected as separate page)
3. **review-queue.html** - Filtered needs-review view (rejected as separate page)
4. **inspector.html** - Split-screen detail view (rejected as full page)
5. **simplified-single-page.html** - **Final approved approach**
   - Entry section at top
   - Statistics cards below entry
   - Filter bar above table
   - Results table with confidence column
   - Inspector panel slides in from right (demo on button click)

### Mockup Purpose
- Visualize multi-page vs single-page trade-offs
- Get user feedback on layout before coding
- Validate assumptions about information density
- Test color coding and visual hierarchy

---

## Notes for Implementation

### Patterns to Maintain
1. **Pure functions** - Confidence calculation, statistics calculation, triage logic
2. **Type extensions** - FieldVerdictWithConfidence extends FieldVerdict
3. **Defensive coding** - Handle missing confidence data gracefully
4. **Progressive disclosure** - Statistics/filters only when queue > 0
5. **Keyboard accessibility** - All actions keyboard-accessible

### Files to Create (9 new)
1. `lib/confidence.ts` - Core confidence calculation
2. `lib/triage.ts` - Workflow state machine
3. `lib/statistics.ts` - Batch statistics calculation
4. `lib/export.ts` - CSV export utility (Phase 6)
5. `components/BatchStatisticsCards.tsx` - Stats display
6. `components/ResultsFilterBar.tsx` - Filter/sort controls
7. `components/InspectorPanel.tsx` - Side drawer
8. `components/ImageViewer.tsx` - Multi-image viewer
9. `components/ReviewActionBar.tsx` - Approve/reject/flag
10. `components/ConfidenceGauge.tsx` - Reusable gauge component

### Files to Modify (7 existing)
1. `lib/types.ts` - Add ~100 lines (confidence types, workflow states, statistics)
2. `lib/config.ts` - Add confidence thresholds (~5 lines)
3. `lib/comparison.ts` - Expose similarity scores (~20 lines)
4. `app/api/verify/route.ts` - Calculate confidence (~40 lines)
5. `components/VerdictCard.tsx` - Optional confidence display (~20 lines)
6. `components/QueueResultsTable.tsx` - Confidence column, inspect button (~50 lines)
7. `app/page.tsx` - Statistics, filters, inspector panel (~100 lines)

### Testing Strategy
1. **Unit tests** - Confidence calculation edge cases
2. **Integration tests** - Triage routing with various confidence levels
3. **Manual testing** - Inspector panel UX, keyboard shortcuts, filtering
4. **Performance testing** - Queue with 100+ items, table rendering speed
5. **Threshold tuning** - Adjust 0.85/0.60 based on real data

### Deployment Considerations
1. **Backward compatible** - Existing single-label workflow unchanged
2. **Feature flags** - Could gate inspector panel behind flag if needed
3. **Analytics** - Track auto-pass rate, review actions, confidence distribution
4. **Documentation** - Update CLAUDE.md with confidence scoring explanation

---

## Summary

**What we planned:** Add confidence-based triage to existing single-page architecture instead of building multi-page app.

**Why this approach:** User prioritized simplicity. Exploration revealed single-page already excellent. Enhancement > replacement.

**Key insight:** Sometimes the simplest solution is to *enhance what works* rather than *rebuild with complexity*. Multi-page app would have been 45% more code for no UX improvement.

**Next steps:** Implement in phases:
1. Backend confidence scoring (API layer)
2. Triage logic (routing rules)
3. Enhanced results table (confidence column)
4. Statistics + filters (batch insights)
5. Inspector panel (rich detail view)
6. Polish + export (final touches)

**Estimated effort:** ~1,250 new lines, ~335 modified lines across 6 phases.
