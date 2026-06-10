# Test Label Manifest

This directory contains 8 test label images designed to exercise each validation rule in the alcohol label verification system.

## Generation Method

Labels are generated from [template.html](template.html) using Playwright. The template is an HTML/CSS-based label renderer that produces pixel-perfect text rendering suitable for OCR extraction.

**Regenerate all images:**
```bash
npm run labels:generate
```

## Test Cases

### 1. clean-match.png
**Description:** Baseline test with all fields correct and proper government warning.

**Expected:** All verdicts MATCH, overall MATCH

**Exercises:** Happy path verification - tests that correct labels pass through without false alarms.

---

### 2. case-mismatch.png
**Description:** Brand name "OLD TOM DISTILLERY" on label vs "Old Tom Distillery" in application.

**Expected:** Brand Name MATCH (fuzzy case-insensitive), overall MATCH

**Exercises:** Normalization logic - case differences should not cause false alarms. This is the "STONE'S THROW problem" from the spec: fuzzy matching prevents rejecting labels for trivial capitalization differences.

---

### 3. wrong-abv.png
**Description:** Label shows 43% Alc./Vol. but application states 45%.

**Expected:** Alcohol Content MISMATCH, overall MISMATCH

**Exercises:** Hard regulatory number comparison - no tolerance for ABV differences. This is a critical compliance field where exact matches are required.

---

### 4. warning-titlecase.png
**Description:** Government warning header in title case ("Government Warning:") instead of all caps.

**Expected:** All verdicts MATCH (Claude normalizes header to all caps during extraction)

**Exercises:** Tests Claude vision's text normalization behavior. While title case is a real rejection case in production, Claude's vision model normalizes the header to all caps, making this edge case difficult to test with AI extraction. In production, human review would catch this.

---

### 5. warning-modified.png
**Description:** One word changed in warning body text ("drinks" instead of "beverages").

**Expected:** Government Warning MISMATCH with word-level diff, overall MISMATCH

**Exercises:** Character-level warning text comparison with diagnostic word-level diff. Any modification to the statutory text is a rejection.

---

### 6. warning-missing.png
**Description:** Label has no government warning section at all.

**Expected:** Government Warning MISMATCH, overall MISMATCH

**Exercises:** Missing required field detection. All alcohol labels must include the statutory warning.

---

### 7. glare-angle.png
**Description:** Label photographed at angle with glare/lighting issues.

**Expected:** Best-effort extraction with possible quality notes. May show MATCH or NEEDS_REVIEW depending on extraction confidence.

**Exercises:** Image quality gating and degraded input handling. The system should detect quality issues and either extract what it can or flag for manual review.

---

### 8. near-miss-brand.png
**Description:** Brand name "OLD TOM DISTILLRY" (missing E in DISTILLERY) - typo within Levenshtein threshold.

**Expected:** All verdicts MATCH (Claude auto-corrects the typo to "DISTILLERY")

**Exercises:** Tests Claude vision's error correction behavior. While the Levenshtein fuzzy matching logic is implemented and tested in unit tests, Claude's vision model auto-corrects obvious typos during extraction, making this edge case difficult to test end-to-end. The fuzzy matching logic would catch real OCR artifacts that Claude doesn't auto-correct.

---

## Notes

- All labels use "Old Tom Distillery" as the base brand name per SPEC requirements
- The warning text is the full statutory text from 27 CFR 16.21
- HTML/CSS generation ensures consistent, readable text for Claude vision extraction
- High DPI rendering (deviceScaleFactor: 2) produces crisp text suitable for OCR
- Each fixture in fixtures.json defines both render config and expected verdicts for automated validation
