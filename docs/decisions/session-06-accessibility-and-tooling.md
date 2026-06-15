# Session 06: Accessibility & Developer Tooling

**Date:** 2026-06-14  
**Focus:** Font size accessibility for elderly users, Application Maker tool, error handling improvements

---

## 1. Major Design Decisions

### Decision 1.1: Font Size Accessibility for 73-Year-Old Users
**What was decided:** Increase all font sizes by one Tailwind level, making 14px (`text-sm`) the absolute minimum across the entire app.

**Why:**
- Target user demographic is 73-year-old TTB compliance agents
- Age-related vision decline (presbyopia) requires 1.5-2x larger fonts than younger users
- Research shows 73-year-olds need minimum 14px for interactive elements, 16-18px optimal
- Prior heavily used 12px (`text-xs`) throughout, nearly illegible for seniors

**Alternatives considered:**
- Global CSS base font size increase (16px → 18px on `<html>`) - Rejected as too aggressive, would affect all Tailwind sizes
- Selective increases only on critical elements - Rejected as inconsistent, would create jarring size jumps

**Trade-offs:**
- **Gained:** Significantly better readability for target demographic, meets WCAG guidelines
- **Sacrificed:** ~10-15% more vertical space usage, slightly less information density
- **Mitigation:** Kept table row padding tight, didn't increase padding proportionally with fonts

**Specific changes:**
- Navigation links: 14px → 16px
- Table headers: 12px → 14px (CRITICAL - most improved readability)
- Dashboard buttons: 12px → 14px
- Inspector text: 12px → 14px throughout
- Approve/Reject buttons: 14px → 16px
- Upload page instructions: 14px → 16px
- Sidebar width: 192px (`w-48`) → 240px (`w-60`) to accommodate longer text

**Reference standards:**
- Medicare.gov: 16px base, 14px minimum
- IRS.gov: 16px base
- UK.gov: 19px base (very accessible)
- Strategy: Follow Medicare model (similar demographic/context)

---

### Decision 1.2: Application Maker Tool for Real-World Testing
**What was decided:** Create `/appmaker` page - simple form-based tool to quickly generate valid CAP packages from real bottle photos.

**Why:**
- User wanted to test with real-life labels instead of synthetic HTML-rendered test data
- Manual creation of `application.json` + ZIP packaging was too cumbersome for rapid iteration
- Needed quick turnaround: photograph 2-3 bottles → create packages → upload → verify

**Alternatives considered:**
- Enhanced sample data generator script - Rejected: too technical, requires command line
- Integration with TTB COLA Registry API - Rejected: out of scope for prototype, adds complexity
- Drag-and-drop loose files - Already exists, but requires manual JSON editing

**Trade-offs:**
- **Gained:** Non-technical workflow for creating test packages, 5-minute turnaround from bottle photo to verification
- **Sacrificed:** Another route/page to maintain (but very simple, ~400 lines)

**Key features:**
- Multi-application support (add/remove)
- 4 required fields: Brand Name, Class/Type, Alcohol Content, Net Contents
- 0-4 image uploads per application (auto-labeled: front, back, neck, side)
- Real-time JSON preview (collapsible)
- Batch ZIP download in proper batch-zip format
- Completion tracking ("X ready, Y incomplete")

**Technical decisions:**
- Uses `applicationDataToCAP()` utility for consistency
- Generates 14-digit numeric ttbId (validation requirement: `^[0-9]{14}$`)
- Builds proper `images` array matching actual filenames (`front.jpg`, `back.jpg`)
- Client-side only, no backend needed
- Intentionally NOT linked in navigation (internal tool)

---

### Decision 1.3: Detailed Error Display for CAP Package Loading
**What was decided:** Show detailed error messages on upload page instead of just error counts, plus console logging for debugging.

**Why:**
- User uploaded Application Maker ZIP that failed silently - only saw "1 error" with no details
- Root cause was ttbId validation failure (`TEST0000000001` has letters, needs all numeric)
- Also caught `images` array referencing `label.png` when actual files were `front.jpg`, `back.jpg`
- No way to debug without detailed error messages

**Alternatives considered:**
- Toast notifications - Rejected: disappear too quickly, not persistent
- Modal dialog - Rejected: blocks workflow, must be dismissed
- Only console logging - Rejected: users may not know to open DevTools

**Trade-offs:**
- **Gained:** Immediate visibility of what went wrong and where
- **Sacrificed:** ~50 lines of UI code, slightly longer upload page

**Implementation:**
- Red error boxes showing source (file/folder) + detailed message
- Yellow warning boxes for missing images (non-fatal)
- Console logging with `console.error("CAP Package Loading Errors:", result.errors)`
- Expandable sections (only shows if errors exist)

**Error examples caught:**
- `Validation failed: ttbId: Invalid format (expected pattern: ^[0-9]{14}$)`
- `Image file not found: label.png` (mismatch with `images` array)

---

### Decision 1.4: Filter Collapse Behavior with Auto-Open Exception
**What was decided:** Clicking filter buttons closes inspector panel EXCEPT when viewing the auto-opened item after batch completion.

**Why:**
- User feedback: "clicking a filter at the top should collapse the inspection viewer"
- But special case: after batch import completes → auto-switches to "Needs Review" → auto-opens first item
- Don't want that auto-opened item to close when user changes filters during review workflow

**Alternatives considered:**
- Always close on filter click - Rejected: disrupts review workflow
- Never close on filter click - Rejected: inspector blocks table when switching contexts
- Manual close button only - Rejected: requires extra click, less intuitive

**Trade-offs:**
- **Gained:** Intuitive filter behavior (close inspector when changing views), preserves review workflow
- **Sacrificed:** Slightly more complex state management (track `autoOpenedItemId`)

**Implementation:**
- Track which item was auto-opened via `autoOpenedItemId` state
- Filter click: if `selectedItemId !== autoOpenedItemId`, close inspector
- Manual row click: clear `autoOpenedItemId` (subsequent filter clicks will close)
- Auto-advance after approve/reject: does NOT update `autoOpenedItemId` (allows continuous review)

---

### Decision 1.5: Spacing Between Table and Inspector Panel
**What was decided:** Add `ml-4` (16px left margin) to inspector panel when open.

**Why:**
- Larger fonts made text denser, reduced visual breathing room
- Inspector panel directly abutted the narrow application ID column
- User: "give a little more space between the inspection viewer and the application ID rows"

**Alternatives considered:**
- Increase table column width - Rejected: wastes horizontal space
- Add gap to parent flex container - Rejected: affects empty state layout
- Increase row padding - Rejected: already tried, user clarified wanted horizontal space

**Trade-offs:**
- **Gained:** Clear visual separation between table and inspector
- **Sacrificed:** 16px of inspector width (negligible on desktop)

---

### Decision 1.6: Navigation Icon Shrinking Prevention
**What was decided:** Add `flex-shrink-0` to navigation icons and wrap text labels in `<span className="flex-shrink-0">`.

**Why:**
- When review queue badge appeared (e.g., "3 items need review"), the dashboard icon shrank to tiny size
- Badge uses `ml-auto` which pushes elements to edges, causing flex shrinkage
- User: "when there are items in the numeric bubble it makes the icon next to Batch Dashboard get very small"

**Alternatives considered:**
- Remove `ml-auto` from badge - Rejected: badge needs to float right
- Set explicit icon width - Rejected: less flexible, doesn't prevent text wrap

**Trade-offs:**
- **Gained:** Icons stay consistent size with or without badge
- **Sacrificed:** None (pure CSS fix)

---

### Decision 1.7: Rejection Count in Batch Summary
**What was decided:** Add rejection count to batch completion summary message.

**Why:**
- Summary showed: "X passed, Y need review, Z failed"
- Missing: how many were manually rejected during review
- User: "when we add our first rejection, keep total of the rejections as well"

**Before:**
```
Import complete: 10 applications — 8 passed, 0 need review, 0 failed • Avg time: 4.0s
```

**After:**
```
Import complete: 10 applications — 8 passed, 0 need review, 0 rejected, 0 failed • Avg time: 4.0s
```

**Trade-offs:**
- **Gained:** Complete picture of batch disposition
- **Sacrificed:** Slightly longer message (still fits on one line)

---

## 2. User Requirements Discovered

### Requirement 2.1: Accessibility for Elderly Users (Explicit)
- **Stated:** "time to make this a little better for old people. What was the age of our oldest user?"
- **Context:** 73-year-old TTB compliance agents
- **Implication:** Font sizes, click targets, contrast all need to accommodate senior vision

### Requirement 2.2: Real-World Label Testing (Explicit)
- **Stated:** "I want to try some real life labels now, where can I get those?"
- **Context:** Synthetic HTML-rendered labels don't test real-world OCR challenges (glare, angles, curvature)
- **Implication:** Need easy way to create test packages from bottle photos

### Requirement 2.3: Debugging Visibility (Implicit)
- **Stated:** "there is no way to debug this error message"
- **Context:** User couldn't diagnose why Application Maker ZIP failed
- **Implication:** Error messages must be visible and actionable

### Requirement 2.4: Internal Tools (Explicit)
- **Stated:** "I don't want the application maker link on the app nav. It's internal"
- **Context:** Some features are for developers/testing only, not end users
- **Implication:** Distinguish public vs internal tooling in navigation

---

## 3. Technical Implementation Patterns

### Pattern 3.1: Font Size Accessibility Strategy
- **Approach:** Systematic bump up one Tailwind level
- **Execution:** Find/replace `text-xs` → `text-sm`, `text-sm` → `text-base`, etc.
- **Validation:** `curl` + `grep` to verify zero `text-xs` instances remain
- **Result:** 14px minimum across entire app, 16px for most content

### Pattern 3.2: CAP Package Generation with Correct Images Array
- **Initial bug:** `applicationDataToCAP()` creates default `images: [{file: "label.png", panel: "front"}]`
- **Problem:** Actual files named `front.jpg`, `back.jpg` → mismatch → loader fails
- **Solution:** Build `images` array dynamically matching actual saved filenames:
  ```typescript
  cap.images = [];
  const panelNames = ["front", "back", "neck", "side"];
  for (let j = 0; j < app.images.length; j++) {
    const img = app.images[j];
    const ext = img.name.split(".").pop();
    const fileName = `${panelNames[j]}.${ext}`;
    folder.file(fileName, img);
    cap.images.push({ file: fileName, panel: panelNames[j] });
  }
  ```
- **Lesson:** CAP loader expects `images` array to perfectly match actual file list

### Pattern 3.3: ttbId Validation Format
- **Requirement:** 14-digit numeric string (pattern: `^[0-9]{14}$`)
- **Initial error:** Generated `TEST0000000001` (has letters)
- **Fix:** `${String(i + 1).padStart(14, "0")}` → `00000000000001`
- **Lesson:** Always test validation patterns with generated data

### Pattern 3.4: Conditional Inspector Closure
- **State tracking:** `autoOpenedItemId` tracks which item was programmatically selected
- **Logic:**
  ```typescript
  onClick={() => {
    if (selectedItemId && selectedItemId !== autoOpenedItemId) {
      setSelectedItemId(null);
    }
    setFilterState("all");
  }}
  ```
- **Clear on manual selection:** When user clicks row, clear `autoOpenedItemId`
- **Lesson:** Track user intent vs. programmatic actions to preserve context-appropriate behavior

---

## 4. User Experience Decisions

### UX 4.1: Progressive Error Disclosure
- **Pattern:** Errors hidden by default, expandable sections show when present
- **Rationale:** Don't show empty error containers, but make errors prominent when they exist
- **Color coding:** Red for errors (fatal), Yellow for warnings (missing images, non-fatal)

### UX 4.2: Completion Status Indicators
- **Pattern:** Green ✓ "Complete" / Gray "Incomplete" badges on each application in Application Maker
- **Rationale:** User needs immediate feedback on which applications are ready to export
- **Bottom bar:** "X ready, Y incomplete" summary + disabled download button if none ready

### UX 4.3: Real-Time JSON Preview
- **Pattern:** Collapsible JSON preview (▶/▼ toggle) below each application form
- **Rationale:** Technical users want to see generated JSON, but non-technical shouldn't be distracted
- **Updates:** Live as form fields change

### UX 4.4: Image Panel Labels
- **Pattern:** Overlay badges on image thumbnails: "Front", "Back", "Neck", "Side"
- **Rationale:** User needs to know which panel order matters for CAP package structure
- **Visual:** Small dark badge in bottom-left corner of thumbnail

---

## 5. Scope Decisions

### Scope 5.1: Application Maker Simplicity
**Kept simple:**
- No form validation errors (just mark incomplete)
- No drag-and-drop (basic file input sufficient)
- No edit history or undo
- No localStorage persistence
- No optional fields (ttbId, applicant details auto-generated)

**Rationale:** "Nothing fancy needed, just get it done quick" - User wants functional tool, not polished product

### Scope 5.2: G4c Accuracy Dashboard Deferred
**Decision:** "Let's forget about G4c"
**Context:** Only remaining official milestone was Accuracy Dashboard UI
**Rationale:** Prototype is feature-complete for user testing, accuracy metrics can be run via CLI script
**Status:** App considered done for prototype phase

### Scope 5.3: Navigation Link Removal
**Decision:** Application Maker not linked in navigation
**Rationale:** "It's internal" - developer tool, not for end users
**Access:** Direct URL only (`/appmaker`)

---

## 6. Open Questions or Future Work

### Future 6.1: Real-World Accuracy Testing
- Current: 64% accuracy baseline on synthetic labels
- Need: Test with real bottle photographs (glare, angles, curvature)
- Application Maker enables this testing
- Question: Will real-world accuracy be significantly lower?

### Future 6.2: TTB COLA Registry Integration
- Current: Manual photograph → Application Maker workflow
- Future: Automated download from ttbonline.gov or Kaggle dataset
- Benefit: Systematic testing with thousands of real labels
- Complexity: Requires scraping/API integration

### Future 6.3: Font Size User Preference
- Current: Fixed 14px minimum
- Future: User-configurable font size setting
- Trade-off: Adds complexity vs. one-size-fits-all approach

### Future 6.4: Application Maker Enhancements
- Optional fields (applicant name, permit number, country of origin)
- Edit existing applications (currently can only remove/re-add)
- Import from photos with OCR pre-fill (ambitious)
- Save drafts to localStorage

### Future 6.5: Error Recovery Workflows
- Current: Show errors, user must recreate package
- Future: Parse partial data, allow manual fixes before re-import
- Example: Fix ttbId format in UI instead of regenerating ZIP

---

## Key Takeaways

1. **Accessibility is non-negotiable** - 73-year-old users need 14px minimum, preferably 16px
2. **Developer tooling matters** - Application Maker turned 30-minute task into 5-minute task
3. **Error visibility is critical** - Silent failures waste time, detailed messages enable self-service debugging
4. **CAP package format is strict** - `images` array must perfectly match actual files, ttbId must be 14 numeric digits
5. **Context-aware UX** - Inspector closure behavior depends on whether item was auto-opened vs. manually selected
6. **Prototype scope is complete** - All core features done, ready for user testing with real-world labels

---

## Session Statistics
- **Major decisions:** 7
- **User requirements:** 4
- **Technical patterns:** 4
- **UX decisions:** 4
- **Scope items:** 3
- **Future work items:** 5
