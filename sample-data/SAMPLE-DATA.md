# Sample Data for TTB Label Verification App

## Overview

This directory contains ~200 synthetic COLA application packages for evaluator testing.

**Source:** Synthetic (realistic fabricated records)
**Generated:** 2026-06-11
**Total Applications:** 200
**Clean (all-MATCH):** 162 (81.0%)
**With Defects:** 38 (19.0%)

## Defect Distribution

- **brand-case-diff:** 10 applications
- **brand-mismatch:** 5 applications
- **warning-titlecase:** 3 applications
- **warning-modified:** 5 applications
- **brand-near-miss:** 5 applications
- **wrong-abv:** 3 applications
- **warning-missing:** 3 applications
- **wrong-volume:** 4 applications

## Files

- **cola-sample-batch.zip** — Full set of 200 applications for batch testing
- **cola-sample-small.zip** — Quick-start subset of 12 applications
- **ground-truth.json** — Expected verdicts for every application (for eval harness)
- **applications/** — Unpacked application packages (CAP format)

## Usage

### Evaluator Quick Start

1. Open the app at http://localhost:3000
2. Click "Load sample dataset" in the batch drop zone
3. The app loads `cola-sample-small.zip` (12 applications) and begins processing
4. Results table auto-sorts MISMATCH/NEEDS_REVIEW to the top

### Full Batch Test

1. Download `cola-sample-batch.zip`
2. Drag and drop into the app's batch drop zone
3. Watch 200 applications process with concurrency limit of 5
4. Export results to CSV for analysis

### Eval Harness

```bash
npm run evals:sample
```

Runs the verification engine against `ground-truth.json` and prints accuracy by defect type.

## Ground Truth Format

```json
{
  "id": "26-0001",
  "ttbId": "26000000000000",
  "defectType": "brand-near-miss",
  "expectedVerdicts": {
    "Brand Name": "NEEDS_REVIEW",
    "Class/Type": "MATCH",
    "Alcohol Content": "MATCH",
    "Net Contents": "MATCH",
    "Government Warning": "MATCH"
  }
}
```

## Multi-Image Design

~60% of applications have the government warning on the **back label** (realistic per TTB practice).
The app sends both front.png and back.png in ONE Anthropic API call, and the model merges findings.

## Notes

- All data is PUBLIC RECORD from the TTB COLA Registry (or realistic synthetic equivalents)
- Defects injected at KNOWN rate so evaluators can measure accuracy
- Generated with controlled randomness for reproducibility
