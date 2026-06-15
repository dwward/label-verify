# Session 03: Specification Harmonization

**Date:** 2026-06-14  
**Context:** After adding M3-AMENDMENT.md, documentation became fragmented across multiple conflicting specs. User requested harmonization and consolidation.

---

## 1. Major Design Decisions

### Decision: Unified Specification Architecture (Always-Batch)
**What was decided:** Merged SPEC-label-verification-app.md and M3-AMENDMENT.md into a single unified SPEC.md, removing all references to separate batch modes.

**Why:**
- M3-AMENDMENT explicitly superseded original SPEC.md §8
- Multiple conflicting specs created confusion about implementation targets
- "Same data for all images" concept removed because "it does not model reality"
- Real-world workflow: Each COLA application has its own distinct data

**Alternatives considered:**
- Keep both specs with version markers → Rejected: perpetuates confusion
- Mark sections as "deprecated" → Rejected: still maintains conflicting information
- Create entirely new spec from scratch → Rejected: would lose valuable context

**Trade-offs:**
- **Gained:** Single source of truth, clear implementation targets, eliminates contradictions
- **Sacrificed:** Historical context about why original batch design was changed (mitigated by preserving this session doc)

### Decision: Two Entry Modalities Feeding Unified Queue
**What was decided:** 
1. **Test Bench** - Manual form entry (4 fields + 1-4 images per application)
2. **CAP Package Drop Zone** - Drag-and-drop .zip files, folders, or loose files

Both feed the same results queue with auto-processing.

**Why:**
- Models real TTB agent workflow: Mix of single-application spot checks and bulk batch imports
- Single queue simplifies UX (one results table, one CSV export, one workflow state machine)
- Eliminates need for separate UI pages/contexts

**Alternatives considered:**
- Separate pages for single vs batch → Rejected: Creates mode-switching confusion
- "Apply one form to all images" mode → Rejected: Doesn't model reality of distinct applications
- CSV upload for batch data → Rejected: CAP package format is more structured and realistic

**Trade-offs:**
- **Gained:** Seamless workflow, realistic simulation of production use, simplified mental model
- **Sacrificed:** Some convenience for hypothetical "scan 50 identical labels" use case (deemed unrealistic)

### Decision: Client-Side Orchestration with Semaphore (Concurrency: 5)
**What was decided:** No /api/batch route. Batch page calls /api/verify repeatedly with client-side concurrency limiting.

**Why:**
- Avoids Vercel function timeout issues (15s hard limit per function)
- Stays under 4.5 MB body limit per request
- Real-time progress updates as each verification completes
- Failed images don't block entire batch

**Alternatives considered:**
- Server-side batch endpoint with streaming → Rejected: Complex, still hits timeout on large batches
- Queue service (Redis/SQS) → Rejected: Out of scope for prototype, adds infrastructure dependency
- WebSocket updates → Rejected: Adds complexity, polling/long-running functions still limited by Vercel

**Trade-offs:**
- **Gained:** Reliability, granular progress updates, resilience to individual failures
- **Sacrificed:** Theoretical efficiency of single-request batch processing (not achievable on Vercel anyway)

### Decision: Multi-Image Extraction with `foundOn` Tracking
**What was decided:** Support 1-4 images per application, sent in ONE Anthropic API call, with model returning panel location for each field.

**Why:**
- Government warning frequently appears on BACK label in real-world applications
- Single-image verification would false-flag "warning missing" on realistic data
- Single API call maintains <5s performance target vs. multiple sequential calls
- Panel location context helps human reviewers understand extraction results

**Alternatives considered:**
- Image concatenation (stitch images side-by-side) → Rejected: Reduces quality, confuses spatial understanding
- Separate API calls per image with merge logic → Rejected: Slower (additive latency), complex merge rules
- Front-image-only with "warning may be on back" disclaimer → Rejected: Produces known false positives

**Trade-offs:**
- **Gained:** Realistic simulation, eliminates false "warning missing" flags, maintains speed target
- **Sacrificed:** Slightly larger API request payload (but still well under limits)

---

## 2. User Requirements Discovered

### Explicit Requirements
1. **Single source of truth:** User said "Harmonize and merge the specification files, remove extraneous files"
2. **Eliminate contradictions:** User pointed out disconnect between CLAUDE.md (describing batch page with "same data for all") and M3-AMENDMENT (which removed that concept)
3. **Reflect implementation state:** User correction: "Current what I see is primarily a Test Bench with no batch interface at all. Is this expected?"

### Implicit Requirements
1. **Documentation must match code:** User expects specs to accurately reflect implemented features (G1+G2 complete, G3+G4 pending)
2. **Clear milestone tracking:** Need to know what's done vs. pending to plan next work
3. **Preserve domain research:** TTB context from M3-AMENDMENT Part A should not be lost

### Constraints Identified
1. **Vercel deployment limits:** 4.5 MB body size, 15s function timeout → drives client-side orchestration
2. **No separate batch mode:** M3-AMENDMENT Part B explicitly removes this concept
3. **No persistence layer:** Privacy-by-design constraint → no database for uploaded images

### Success Criteria
1. **Single unified specification** that merges original SPEC.md + M3-AMENDMENT.md
2. **CLAUDE.md updated** to remove contradictions and reference unified SPEC.md
3. **File count reduced** from 4 markdown files to 3 (delete SPEC-label-verification-app.md and M3-AMENDMENT.md)
4. **No code changes** - purely documentation harmonization

---

## 3. Technical Implementation Patterns

### Pattern: CAP (COLA Application Package) Format v1.0
**Approach:** Structured JSON interchange format with four package layouts.

**Rationale:**
- Models realistic TTB COLA export data structure
- Separates verifiable fields (`label.*`) from administrative metadata
- Supports multiple packaging conventions (package-zip, batch-zip, manifest-mode, loose-drop)

**Key Features:**
- JSON Schema validation
- Images referenced by filename with panel metadata
- Verifiable vs. administrative field taxonomy (only `label.*` fields drive verdicts)

**Implementation:**
- `lib/cap-loader.ts` - JSZip-based package parser
- `lib/cap-schema.json` - JSON Schema definition
- Client-side processing (never upload entire zip to server)

### Pattern: Field-Level `foundOn` Tracking
**Approach:** ExtractedLabel schema includes `foundOn?: PanelLocation` for each field.

**Type Definition:**
```typescript
type PanelLocation = "front" | "back" | "neck" | "unknown"
```

**Why:**
- Provides transparency about which panel contained each field
- Helps human reviewers understand extraction results
- Critical for government warning (often on back label)

**Display:**
- Small gray badge in VerdictCard component
- Format: "{panel} label" (e.g., "back label")
- Hidden if "unknown"

### Pattern: Deterministic Comparison with Pure Functions
**Approach:** All comparison logic lives in pure functions with comprehensive unit tests.

**Rationale:**
- LLM extracts, deterministic code judges
- Reproducible verdicts (same inputs → same outputs)
- Testable without API calls
- Clear audit trail for regulatory compliance

**Key Functions:**
- `compareFieldFuzzy()` - Levenshtein similarity for brand/class
- `compareAlcoholContent()` - Numeric parsing with proof ÷ 2 conversion
- `compareNetContents()` - Unit normalization (750 mL = 0.75 L)
- `verifyGovernmentWarning()` - Zero-tolerance character-level check

---

## 4. User Experience Decisions

### Decision: Always-Batch Queue (No Mode Switching)
**UX Rationale:**
- Single mental model: Everything goes to the queue
- No "am I in single mode or batch mode?" confusion
- Single results table with consistent interaction patterns
- One entry = batch of one (no special case)

**Benefits:**
- Seamless transition from testing single labels to processing batches
- No navigation between different contexts
- One set of controls (filter, sort, export)

### Decision: Triage Sort (Errors → Mismatches → Needs Review → Matches)
**UX Rationale:**
- Prioritizes items requiring human attention
- Errors surface immediately (processing failures)
- Regulatory violations (mismatches) next
- Low-confidence items (needs review) before clean matches

**Implementation:**
- Automatic sort on completion
- No user configuration needed
- Visual grouping with workflow state badges

### Decision: Panel Location Badges (Small Gray Tags)
**UX Rationale:**
- Non-intrusive context (small gray badge, not prominent)
- Only shown when location is known (not "unknown")
- Helps reviewers understand "where did you find this?"
- Particularly important for government warning (back label common)

**Design:**
- `text-xs` (extra small font)
- `bg-gray-200` (light gray, low visual weight)
- Positioned in VerdictCard header beside field name

---

## 5. Scope Decisions

### Out of Scope: Historical Multi-Version Specs
**What was cut:** Keeping old SPEC-label-verification-app.md and M3-AMENDMENT.md as versioned history.

**Why:**
- Git history preserves original files if needed
- Multiple specs create ongoing maintenance burden
- Contradictions more harmful than loss of visible history
- This session doc preserves context about the merge

### Out of Scope: Batch-Specific Features
**What was removed:**
- Separate /app/batch/page.tsx with distinct UI
- "Same data for all images" application mode
- CSV upload for batch data entry
- /api/batch endpoint

**Why:**
- Doesn't model real-world TTB workflow (each application has unique data)
- Adds UI complexity (mode switching, separate page)
- CAP package format is more realistic and structured

### Out of Scope: Server-Side Batch Orchestration
**What was cut:** Single /api/batch endpoint that processes multiple applications server-side.

**Why:**
- Vercel function timeout (15s) makes this unreliable for batches >3-5 items
- Client-side orchestration provides better progress visibility
- Failed items don't block entire batch
- Stays under 4.5 MB body limit (one application per request)

---

## 6. Open Questions and Future Work

### Implementation Status Verification
**Current Status (as of 2026-06-14):**
- ✅ G1 Complete: Always-batch queue architecture
- ✅ G2 Complete: CAP loader with 4 package layouts
- ❌ G3 Pending: Multi-image extraction (code has "G3 will extend" comment at app/page.tsx:60)
- ❌ G4 Pending: Sample data pipeline partially complete

**Question:** G3 implementation specifics
- Does extraction.ts handle multiple images correctly?
- Is `foundOn` field populated in ExtractedLabel?
- Do VerdictCards display panel location badges?

**Next Steps:**
- Verify /api/verify route accepts `image`, `image1`, `image2`, `image3` parameters
- Update extraction.ts to process multiple images in single API call
- Test multi-image sample dataset (12 apps with front+back panels)

### Sample Dataset Integration
**Partial Implementation:**
- Sample data generator exists (`scripts/generate-sample-data.ts`)
- Evaluation harness exists (`scripts/run-evals.ts`)
- Ground truth tracking exists (`sample-data/ground-truth.json`)

**Missing:**
- Dashboard UI for evaluation metrics (G4c)
- Historical accuracy tracking over time
- Visual charts for accuracy by defect type

**Future Enhancement:**
- Integrate evaluation metrics into main app
- Add "Run Evaluations" button to dashboard
- Display accuracy trends as prompts/models change

### Documentation Completeness
**Achieved in This Session:**
- Unified SPEC.md merging both sources
- Updated CLAUDE.md removing contradictions
- Deleted extraneous files (down from 4 to 3 markdown files)
- Clear milestone tracking (✅ vs. ⏳)

**Remaining Documentation Work:**
- Test SPEC.md for completeness (did merge capture all key sections?)
- Verify CLAUDE.md accurately guides Claude Code through implementation
- Ensure README.md stays in sync with SPEC.md updates

---

## Key Takeaways

1. **Specification fragmentation is dangerous:** Multiple conflicting specs create confusion about implementation targets and lead to wasted work.

2. **"Same data for all" was anti-pattern:** Removed because it didn't model real-world TTB workflow where each COLA application has unique data.

3. **Always-batch architecture simplifies UX:** Single queue, single results table, single workflow → no mode-switching confusion.

4. **Client-side orchestration beats server-side batch:** Vercel timeout constraints make client-side semaphore pattern more reliable for large batches.

5. **Multi-image support is critical:** Government warning on back label is common in real applications → single-image verification would produce false "warning missing" flags.

6. **Documentation must track implementation state:** Specs that describe features as complete when they're pending (or vice versa) create misalignment between expectations and reality.

---

## Artifacts Produced

1. **Unified SPEC.md** (32,439 bytes) - Merged specification integrating both sources
2. **Updated CLAUDE.md** (11,343 bytes) - Removed contradictions, reflects always-batch architecture
3. **This session doc** - Preserves rationale for harmonization decisions
4. **Deleted files:** SPEC-label-verification-app.md, M3-AMENDMENT.md (content merged into unified SPEC.md)

---

## References

- SPEC.md line count: 32,439 bytes (unified specification)
- CLAUDE.md line count: 11,343 bytes (updated guidance)
- README.md: No changes (already correct per M3-AMENDMENT)
- app/page.tsx:60 comment: "// G1: Single image only (G3 will extend to multi-image)"
- Milestone status: M1✅ M2✅ G1✅ G2✅ | G3⏳ G4⏳ M4⏳
