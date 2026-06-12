# Stretch Goal: Improve Label Verification Accuracy

## Current State

**Overall Accuracy: 64.0%** (128/200 applications)

Measured against 200 synthetic COLA applications on 2026-06-11 using `claude-haiku-4-5`.

### Accuracy Breakdown by Defect Type

| Defect Type | Accuracy | Notes |
|-------------|----------|-------|
| warning-missing | 100.0% | ✅ Perfect detection |
| warning-modified | 100.0% | ✅ Perfect detection |
| warning-titlecase | 100.0% | ✅ Perfect detection |
| wrong-volume | 100.0% | ✅ Perfect detection |
| brand-case-diff | 70.0% | 🟡 Good but room for improvement |
| wrong-abv | 66.7% | 🟡 Good but room for improvement |
| brand-mismatch | 60.0% | 🟡 Acceptable |
| **none (clean)** | **61.1%** | ⚠️ **Primary issue** |
| brand-near-miss | 40.0% | ⚠️ Needs improvement |

### Key Finding

**The system perfectly detects intentional warning defects but struggles to extract complete warning text from clean synthetic labels.**

- When warnings are defective → 100% accuracy
- When warnings are correct → 61% accuracy (39% false negatives)

This inverse relationship suggests the issue is **extraction quality**, not **comparison logic**.

## Problem Analysis

### Root Cause Hypotheses

#### 1. **Synthetic Label Rendering Quality** (Most Likely)
The HTML-to-PNG rendering via Playwright may produce text that's difficult for the model to extract:
- Font rendering artifacts
- Anti-aliasing issues
- Small font size (realistic warning text is ~8pt)
- Background texture/gradient in rendered HTML

**Evidence**: Clean labels fail at 39% but defect detection is perfect. If the model can detect modified text, it should be able to extract correct text.

#### 2. **Prompt Engineering**
The extraction prompt may not emphasize complete, verbatim transcription strongly enough for warning text:
- Current prompt: "Transcribe verbatim" (lib/extraction.ts:80-85)
- May need stronger emphasis on character-level accuracy
- Could benefit from few-shot examples

**Evidence**: Warning defects are caught, suggesting comparison logic works. Issue is upstream in extraction.

#### 3. **Model Limitations with Dense Text**
Claude Haiku may struggle with dense, small-font warning text in synthetic images:
- Warning text is 2 sentences, ~200 characters
- Rendered at small font size to fit realistic label
- Model may skip words or hallucinate

**Evidence**: 39% of clean labels have warning extraction issues.

#### 4. **Multi-Image Confusion**
~60% of samples have warning on back label. Model may:
- Miss the warning entirely (skip second image)
- Extract partial text from one image
- Get confused about which image contains warning

**Evidence**: Need to analyze failures by panel location.

## Investigation Plan

### Phase 1: Diagnose the Root Cause (2-3 hours)

**Step 1: Analyze Failure Patterns**

Run this analysis on eval failures:

```bash
# Extract failed clean label IDs
grep "none.*FAIL" sample-eval-results.txt | cut -d' ' -f1 > failed-clean.txt

# For each failed ID, examine:
# 1. Which image has the warning (front vs back)
# 2. What warning text was extracted vs expected
# 3. Image quality metrics
```

Create analysis script:
```typescript
// scripts/analyze-failures.ts
import { readFileSync } from 'fs';

const failures = readFileSync('failed-clean.txt', 'utf-8').split('\n');
const groundTruth = JSON.parse(readFileSync('sample-data/ground-truth.json', 'utf-8'));

for (const id of failures) {
  const app = groundTruth.find(g => g.id === id);
  // Check which image (front/back) has warning
  // Compare extracted vs expected warning text
  // Calculate character-level diff
}
```

**Questions to answer:**
- Are failures concentrated on back-label warnings?
- Is warning text partially extracted or completely missing?
- Are specific words/phrases consistently missed?
- Does image quality correlate with failure?

**Step 2: Visual Inspection**

Open 5-10 failed clean labels and inspect images:
```bash
# View a failed label
cd sample-data/applications/26-0002
open front.png back.png
```

**Look for:**
- Is warning text readable by human eye?
- Does text have rendering artifacts?
- Is font size too small?
- Is background contrast sufficient?

**Step 3: Model Comparison**

Re-run a subset of failures with different models:

```typescript
// scripts/test-models.ts
const MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'];

for (const model of MODELS) {
  // Run extraction on 20 failed clean labels
  // Compare warning extraction accuracy
}
```

**Hypothesis test:**
- If Sonnet/Opus have significantly better accuracy → model limitation
- If all models struggle → rendering quality issue

### Phase 2: Implement Improvements

Based on Phase 1 findings, try these approaches:

#### Approach A: Improve Synthetic Label Rendering

**If rendering is the issue:**

1. **Increase font size** in warning text (scripts/generate-labels.ts)
   ```typescript
   // BEFORE: font-size: 8pt
   // AFTER: font-size: 10pt or 12pt
   ```

2. **Improve contrast**
   ```css
   /* Add to warning div */
   background: white;
   color: black;
   padding: 4px;
   ```

3. **Use better font** with clearer rendering
   ```css
   font-family: 'Arial', sans-serif; /* Instead of system fonts */
   ```

4. **Increase rendering resolution**
   ```typescript
   // In Playwright screenshot
   await page.setViewportSize({ width: 2000, height: 2666 }); // Higher res
   ```

**Test:** Regenerate 20 failed labels, re-run extraction, measure improvement.

#### Approach B: Enhance Extraction Prompt

**If prompt is the issue:**

1. **Add few-shot examples** to extraction prompt:
   ```typescript
   const EXAMPLE_WARNING = `
   EXAMPLE of correct Government Warning extraction:
   {
     "governmentWarning": {
       "present": true,
       "fullText": "GOVERNMENT WARNING: (1) According to the Surgeon General...",
       "headerAllCaps": true,
       "headerAppearsBold": true,
       "foundOn": "back"
     }
   }
   `;
   ```

2. **Strengthen verbatim instruction**:
   ```typescript
   // BEFORE: "Transcribe the government warning verbatim"
   // AFTER: "Extract the government warning CHARACTER-FOR-CHARACTER, including all punctuation. Do not paraphrase, summarize, or skip any words. If uncertain about a character, include your best guess rather than omitting it."
   ```

3. **Add verification step**:
   ```typescript
   "After extraction, verify: does your transcription have exactly 2 numbered sentences? If not, re-read the image more carefully."
   ```

**Test:** Re-run extraction on failed labels with enhanced prompt.

#### Approach C: Upgrade Model

**If model limitation is confirmed:**

1. **Switch to Sonnet 4.6** (stronger vision, still fast)
   ```typescript
   // lib/config.ts
   export const MODEL_ID = 'claude-sonnet-4-6'; // Was: claude-haiku-4-5
   ```

2. **Measure cost/accuracy tradeoff**:
   - Haiku: ~$0.01 per application (4 images)
   - Sonnet: ~$0.03 per application
   - Opus: ~$0.15 per application

**Test:** Re-run evals with Sonnet on all 200 samples.

#### Approach D: Multi-Pass Extraction

**If single-pass extraction is insufficient:**

1. **Dedicated warning extraction pass**:
   ```typescript
   // After main extraction, if warning text is incomplete:
   if (extracted.governmentWarning.fullText.length < 200) {
     // Send ONLY the image with warning, with targeted prompt
     const targetedWarning = await extractWarningOnly(backImage);
   }
   ```

2. **Image preprocessing**:
   ```typescript
   // Before sending to Claude, crop to warning region
   // Use simple CV to detect text block at bottom of label
   const warningCrop = await cropToWarning(labelImage);
   ```

**Test:** Measure improvement vs. added latency/cost.

### Phase 3: Measure Impact

Re-run full evaluation on 200 samples after each approach:

```bash
npm run evals:sample > eval-results-v2.txt
```

**Success Criteria:**
- **Target: 85%+ overall accuracy**
- Clean label accuracy: 80%+ (up from 61%)
- Maintain 100% defect detection
- Processing time: <5 seconds per application
- Cost: <$0.05 per application (if using Sonnet)

**Track improvements:**
```
| Approach | Overall Accuracy | Clean Accuracy | Cost per App | Time per App |
|----------|------------------|----------------|--------------|--------------|
| Baseline (Haiku, current) | 64.0% | 61.1% | $0.01 | 2.5s |
| A: Better rendering | ? | ? | $0.01 | 2.5s |
| B: Enhanced prompt | ? | ? | $0.01 | 2.5s |
| C: Sonnet model | ? | ? | $0.03 | 3.5s |
| D: Multi-pass | ? | ? | $0.02 | 4.5s |
```

## Quick Wins to Try First

**Fastest tests (30 minutes each):**

1. **Try Sonnet** on 20 failed labels
   ```bash
   # lib/config.ts: MODEL_ID = 'claude-sonnet-4-6'
   # Re-run subset
   ```

2. **Strengthen prompt** for warning extraction
   ```typescript
   // Add "CHARACTER-FOR-CHARACTER" emphasis
   // Test on 20 failed labels
   ```

3. **Increase warning font size** to 12pt
   ```bash
   # Edit scripts/generate-labels.ts
   npm run sample:generate -- --count=20
   # Test on regenerated subset
   ```

**If none improve accuracy → deeper investigation needed**

## Real-World Validation

**Critical caveat:** Synthetic labels != real labels

After improving synthetic accuracy, must validate on:
- Real TTB submission photos (if available)
- Photos of actual bottles (various lighting, angles)
- Scanned labels from paper submissions

**Real-world may have different challenges:**
- Glare, shadows, angles
- Wrinkled/curved labels
- Faded print, stains
- Background clutter

**Recommendation:** Run evals on 50-100 real labels before declaring production-ready.

## Future Enhancements

**Beyond 85% accuracy:**

1. **Active learning**: Flag low-confidence extractions for human review
2. **Ensemble**: Run extraction with multiple models, vote on results
3. **Fine-tuning**: If Anthropic supports it, fine-tune on TTB labels
4. **Hybrid approach**: OCR for warning text (deterministic) + Claude for context
5. **Image preprocessing**: Auto-rotate, crop, enhance contrast before extraction

## Files to Modify

| File | What to Change |
|------|----------------|
| [lib/config.ts](lib/config.ts) | MODEL_ID constant (quick test) |
| [lib/extraction.ts](lib/extraction.ts:65-120) | Extraction prompt text |
| [scripts/generate-labels.ts](scripts/generate-labels.ts) | Label rendering (font, size, contrast) |
| [scripts/analyze-failures.ts](scripts/analyze-failures.ts) | New script to analyze eval failures |
| [scripts/test-models.ts](scripts/test-models.ts) | New script to compare models |

## Success Metrics

**Definition of Done:**
- [ ] Root cause identified and documented
- [ ] At least 2 improvement approaches tested
- [ ] Overall accuracy ≥ 85% on synthetic labels
- [ ] Clean label accuracy ≥ 80%
- [ ] Defect detection remains ≥ 95%
- [ ] Processing time ≤ 5 seconds per application
- [ ] Cost per application documented
- [ ] Updated README with new accuracy table
- [ ] Validated on 10+ real labels (if available)

## Notes for Future AI

**When picking this up:**

1. **Don't start coding immediately** - Run Phase 1 diagnostics first
2. **The comparison logic works** - Don't touch lib/comparison.ts or lib/warning-text.ts
3. **Defect detection is perfect** - The model can see the text, extraction is the issue
4. **Synthetic ≠ Real** - Improvements on synthetic may not transfer to real photos
5. **Cost matters** - TTB processes 1000s of applications, $0.01 vs $0.15 matters
6. **Speed matters** - Target is <5s per application, prior vendor failed at 30-40s

**Start here:**
```bash
# 1. Re-run evals to confirm 64% baseline
npm run evals:sample

# 2. Try quick win: switch to Sonnet
# Edit lib/config.ts: MODEL_ID = 'claude-sonnet-4-6'
npm run evals:sample

# 3. If significant improvement → deploy Sonnet
# 4. If no improvement → investigate rendering quality
```

**Don't waste time on:**
- Over-engineering the solution before understanding the problem
- Tweaking comparison logic (it's not the issue)
- Building complex multi-model ensembles before trying simple fixes

**Do focus on:**
- Measuring first, then optimizing
- Quick experiments with fast feedback
- Cost/accuracy/speed tradeoffs
