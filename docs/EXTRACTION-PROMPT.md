# Chat History Extraction Prompt

Use this prompt when reviewing prior chat sessions to extract key decisions and design rationale.

---

## ONE-LINE TRIGGER (Paste This in Each Session):

```
Read c:\Users\wayne\coding\repo\label-verify\docs\EXTRACTION-PROMPT.md, apply it to this conversation, and write the output to c:\Users\wayne\coding\repo\label-verify\docs\decisions\session-[SESSION_NUMBER]-[SHORT_TOPIC_NAME].md (replace [SESSION_NUMBER] with 01, 02, etc. and [SHORT_TOPIC_NAME] with a brief descriptor like "mvp-design" or "batch-workflow")
```

**Usage:**
- Paste once per session
- Claude will read the extraction guidelines below, analyze the conversation, and write directly to file
- You just need to update the session number/topic name

---

## Full Extraction Guidelines (Auto-Read by LLM):

## Prompt to Use in Each Prior Session:

```
I need to extract key architectural decisions, design rationale, and implementation choices from this conversation for documentation purposes. Please analyze this chat session and provide:

## 1. Major Design Decisions
For each significant decision made:
- **What was decided:** (Feature, approach, architecture choice)
- **Why:** (Problem it solved, constraint it addressed, user need)
- **Alternatives considered:** (What was rejected and why)
- **Trade-offs:** (What we gained vs. what we sacrificed)

## 2. User Requirements Discovered
- Explicit requirements the user stated
- Implicit requirements discovered through discussion
- Constraints identified (technical, user capability, business)
- Success criteria defined

## 3. Technical Implementation Patterns
- Key technical approaches chosen (libraries, patterns, algorithms)
- Code organization decisions
- Performance optimizations
- Error handling strategies

## 4. User Experience Decisions
- UI/UX choices made and rationale
- Accessibility considerations (especially for 73-year-old users)
- Workflow design decisions
- Information architecture choices

## 5. Scope Decisions
- What was explicitly marked "out of scope" and why
- Features that were cut/simplified
- "Good enough" vs "perfect" trade-offs

## 6. Open Questions or Future Work
- Issues identified but not resolved
- Known limitations accepted
- Features deferred to later phases

## Format Guidelines:
- Be concise but specific
- Include context (why, not just what)
- Reference specific examples when relevant
- Note any contradictions or changes in direction
- Highlight decisions that were non-obvious or contentious

Focus on decisions that would help someone understand:
1. Why the system is designed this way
2. What alternatives were considered
3. What constraints shaped the design
4. What makes this appropriate for TTB agents
```

---

## How to Use:

### Step 1: Identify Prior Sessions
Look through your Claude Code history and identify the key sessions:
- Initial prototype/MVP discussion
- Batch workflow design
- Accuracy evaluation discussions
- UX refinement sessions

### Step 2: Run Extraction
Paste the prompt above into each prior session and save the output.

### Step 3: Aggregate Results
Save each session's extraction to a file like:
- `docs/decisions/session-01-mvp.md`
- `docs/decisions/session-02-batch-workflow.md`
- `docs/decisions/session-03-evaluation.md`
- `docs/decisions/session-04-ux-refinement.md`
- `docs/decisions/session-05-accessibility.md` (current session)

### Step 4: Bring Back for Synthesis
Once you have all extractions, bring them back to me and I'll help you:
1. Identify themes and patterns
2. Resolve contradictions
3. Organize into coherent documentation
4. Write final Architecture Decision Records (ADRs)
5. Create implementation guide

---

## What to Look For in Each Session:

### MVP/Initial Design Sessions
- Why Next.js + Claude API?
- Why no database?
- Why batch-first architecture?
- Why client-side image compression?

### Verification Logic Sessions
- Government warning exact-match vs fuzzy for brand names
- Confidence thresholds (85% auto-pass, <60% needs review)
- Field-level comparison strategies
- Why deterministic comparison, not LLM-based

### Batch Workflow Sessions
- Multi-image support rationale
- CAP package format decisions
- Queue orchestration (client-side vs server-side)
- Inspector panel design
- Filter and triage logic

### UX Sessions
- Font size decisions (14px minimum for 73-year-olds)
- Manual review workflow
- Image zoom/pan approach
- Navigation structure
- Error display improvements

### Accuracy Sessions
- Why 64% baseline was acceptable
- Synthetic vs real-world testing strategy
- Defect injection approach
- Evaluation harness design

---

## Expected Output Structure:

Each session extraction should produce ~1-2 pages covering:
- 3-5 major decisions
- 2-4 user requirements
- 2-3 technical patterns
- 1-2 UX decisions
- Scope items
- Future work notes

Total across all sessions: 10-20 pages of raw decision documentation.

---

## Tips:

1. **Be selective** - Not every conversation detail matters. Focus on *decisions* not *discussions*.

2. **Capture rationale** - The *why* is more valuable than the *what* (code shows what).

3. **Note surprises** - If something seems unusual or non-obvious, that's worth documenting.

4. **Track evolution** - If a decision changed, note both versions and why it changed.

5. **User voice** - Capture direct user feedback/requirements in quotes when significant.

---

## After Extraction:

When you bring all extractions back, I'll help you:

1. **Synthesize into ADRs** (Architecture Decision Records)
   - One ADR per major decision
   - Standard format: Context, Decision, Consequences

2. **Create Implementation Guide**
   - How the system works
   - Key patterns to follow
   - Common pitfalls to avoid

3. **Write Developer Onboarding Doc**
   - Quick-start guide
   - Mental model of the architecture
   - Where to find things

4. **Document Open Questions**
   - Known limitations
   - Future enhancement paths
   - Technical debt to address
