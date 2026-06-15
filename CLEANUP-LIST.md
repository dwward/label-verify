# Files to Remove - Cleanup List

**Date:** 2026-06-14  
**Reason:** Temporary/unused files from development iterations

---

## Safe to Delete

### 1. Unused Page Routes

**`app/batch/page.tsx`**
- **Why unused:** Redirect-only page to root
- **Replaced by:** Single-page always-batch architecture (dashboard/upload pages)
- **Safe to delete:** Yes - no functionality, just redirects

---

### 2. Unused React Components (components/)

**`components/ApplicationForm.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline form in upload/page.tsx
- **Check before delete:** `grep -r "ApplicationForm" app/`

**`components/ImageUpload.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline image upload in upload/page.tsx and dashboard/page.tsx
- **Check before delete:** `grep -r "ImageUpload" app/`

**`components/ProcessingTimer.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline timer logic in pages
- **Check before delete:** `grep -r "ProcessingTimer" app/`

**`components/QueueProgress.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline progress display in dashboard
- **Check before delete:** `grep -r "QueueProgress" app/`

**`components/QueueResultsTable.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline results table in dashboard/page.tsx
- **Check before delete:** `grep -r "QueueResultsTable" app/`

**`components/ResultsPanel.tsx`**
- **Why unused:** Not imported anywhere in app/ directory
- **Replaced by:** Inline results display in pages
- **Check before delete:** `grep -r "ResultsPanel" app/`

---

### 3. Temporary Documentation Files

**`IMPLEMENTATION-CHECKPOINT.md`**
- **Why unused:** Temporary milestone marker
- **Replaced by:** docs/decisions/ session logs + ARCHITECTURE-DECISIONS.md
- **Safe to delete:** Yes - superseded by comprehensive documentation

**`IMPLEMENTATION-COMPLETE.md`**
- **Why unused:** Temporary completion marker
- **Replaced by:** docs/decisions/ session logs + ARCHITECTURE-DECISIONS.md
- **Safe to delete:** Yes - superseded by comprehensive documentation

---

## Verify Before Deleting

Run these commands to confirm no usage:

```bash
# Check components
grep -r "ApplicationForm" app/ components/
grep -r "ImageUpload" app/ components/
grep -r "ProcessingTimer" app/ components/
grep -r "QueueProgress" app/ components/
grep -r "QueueResultsTable" app/ components/
grep -r "ResultsPanel" app/ components/

# If all return empty (no matches), safe to delete
```

---

## Keep (Important Files)

These look like they might be unused but are NOT:

### Components (KEEP)
- ✅ `components/AppNavigation.tsx` - Used by all pages
- ✅ `components/VerdictCard.tsx` - Used in dashboard inspector

### Pages (KEEP)
- ✅ `app/page.tsx` - Root redirect to /upload
- ✅ `app/upload/page.tsx` - Main upload/queue interface
- ✅ `app/dashboard/page.tsx` - Batch dashboard with triage
- ✅ `app/appmaker/page.tsx` - Internal tool (CAP package creator)
- ✅ `app/layout.tsx` - Root layout

### Lib (KEEP ALL)
- ✅ `lib/confidence.ts` - Used by triage.ts
- ✅ `lib/semaphore.ts` - Used by dashboard for concurrency limiting
- ✅ All other lib/ files actively used

### Test/Sample Data (KEEP)
- ✅ `test-labels/` - 8 test fixtures
- ✅ `sample-data/` - 200 synthetic applications for evaluation
- ✅ `scripts/` - Data generation and eval harness

### Documentation (KEEP)
- ✅ `docs/APPROACH.md` - Newly created
- ✅ `docs/ARCHITECTURE-DECISIONS.md` - Newly created
- ✅ `docs/IMPLEMENTATION-GUIDE.md` - Newly created
- ✅ `docs/decisions/` - Session logs
- ✅ `docs/EXTRACTION-PROMPT.md` - Template for future extractions
- ✅ `CLAUDE.md` - Project guidance
- ✅ `SPEC.md` - Original specification
- ✅ `README.md` - User documentation
- ✅ `STRETCH-GOAL-ACCURACY.md` - Accuracy improvement notes

---

## Deletion Commands

After verifying above, run:

```bash
# Delete unused page
rm app/batch/page.tsx

# Delete unused components (verify first!)
rm components/ApplicationForm.tsx
rm components/ImageUpload.tsx
rm components/ProcessingTimer.tsx
rm components/QueueProgress.tsx
rm components/QueueResultsTable.tsx
rm components/ResultsPanel.tsx

# Delete temporary docs
rm IMPLEMENTATION-CHECKPOINT.md
rm IMPLEMENTATION-COMPLETE.md
```

---

## Optional: Clean Coverage Artifacts

If you don't need to keep test coverage HTML:

```bash
# Coverage reports can be regenerated with `npm test -- --coverage`
rm -rf coverage/
```

**Note:** This is generated, not source. Add to `.gitignore` if not already there.

---

## Summary

**Total files to delete:** 8-9 files
- 1 unused page route
- 6 unused components
- 2 temporary documentation files
- (Optional) coverage/ directory

**Estimated size saved:** ~5-10 KB of source code + ~200 KB of coverage HTML

**Risk level:** LOW - All verified unused via grep
**Recommendation:** Delete after one final verification pass
