# Approach, Tools, and Assumptions

A quick note on how to read this: I filled gaps by inferring from the discovery interviews and TTB's public COLA documentation, and I made independent scoping calls where the assignment invited them. Where a decision traces back to something a stakeholder actually said, I've pointed at it — because most of the real requirements here live in the interview notes, not the requirements section.

## Approach

The assignment reads like "compare a label to a form," but the interviews are where the actual specifying happens. Almost every decision below traces back to something a stakeholder said in passing rather than to the bulleted requirements. Sarah's failed vendor pilot is a hard 5-second performance bar. Her peak-season story is the batch requirement. Dave's "STONE'S THROW vs Stone's Throw" example sitting next to Jenny's title-case rejection is the whole matching strategy. So the approach was to treat the discovery notes as the real spec and build to what these people actually do all day.

A few decisions carry most of the weight:

**The model extracts, the code judges.** Claude's vision reads the label and transcribes the fields and the warning verbatim. Every match/mismatch decision after that happens in plain, unit-tested functions — no LLM in the verdict path. This matters for two reasons: verdicts are reproducible and auditable (same inputs, same answer, which you want in a compliance tool), and I can test the comparison rules without burning API calls. It also draws a clean line between the part that's allowed to be probabilistic (reading a photo) and the part that has to be defensible (the verdict).

**Two opposite matching philosophies, on purpose.** Brand name and class/type use fuzzy, three-state matching so that capitalization and spacing differences don't trigger false rejections — that's the STONE'S THROW problem Dave described. The government warning does the exact opposite: byte-for-byte verification against the statutory text in 27 CFR Part 16, because Jenny's whole job on that field is catching the label that quietly drops a word or sets the header in title case. Running both behaviors correctly in the same tool is the core of the thing.

**Three states, not pass/fail.** MATCH / MISMATCH / NEEDS_REVIEW mirrors how the agents actually work — when they can't read something confidently, they kick it to a human instead of guessing. Low extraction confidence and ambiguous near-misses both land in NEEDS_REVIEW. That's also the safe failure mode for a compliance system: it should never throw a confident green on something it couldn't actually verify.

**The unit of work is the application, not the image.** A submission is form data plus one to four images, and a single label is just a batch of one. That gave me one queue, one results table, one export, and no single-vs-batch mode switching to confuse anyone. It also forced multi-image extraction: a real COLA application carries front/back/neck images and the warning usually lives on the back, so a front-image-only tool would false-flag "warning missing" constantly. All of an application's images go to the model in one call to keep it under the 5-second bar.

**The agent reviews verdicts — they don't retype data.** In production, both inputs would come straight out of COLA and this tool would sit on top as a verdict layer. COLA integration was explicitly out of scope, so the prototype simulates the record two ways: manual entry (the Test Bench) and a package format I defined (CAP), which stands in for a COLA export. The point is that nobody adds data entry to their day — the agent's job shifts from doing the comparison to dispositioning the tool's output, and the CSV export is what leaves the building.

## Tools

Next.js and TypeScript on Vercel, so the frontend and the API ship as one unit behind a single public URL — shortest path to the "deployed prototype" deliverable. Claude (a Haiku-class vision model) does the extraction, with the model ID pulled out into config so it's a one-line swap to a stronger model if extraction quality ever needs it. Tailwind for the UI. JSZip handles packages in the browser, AJV validates them against a JSON Schema, and images get compressed client-side before upload.

Worth being explicit about one thing: a couple of the architecture choices are Vercel's constraints talking, not the problem domain. The 4.5 MB request limit and the function timeout are why zip handling and batch concurrency run in the browser instead of a server-side batch endpoint — one application per request, orchestrated client-side with a concurrency cap. I'd make a different call on different infrastructure, and the README's deployment notes cover the path for an agency environment.

The build itself was AI-assisted development in Claude Code against a written spec, done milestone by milestone, with unit tests and a fixture-based eval harness gating each step before moving on.

## Assumptions

I've grouped these by how much they're standing on. The ones tied to an interview line or a TTB fact are the solid ones; the scoping calls at the bottom are mine, and I think they're the right calls for a time-boxed prototype.

**From the interviews:**
- Sub-5-second target per application — the vendor pilot died at 30-40 seconds and the agents walked away from it.
- Batch has to survive a 200-300 application dump (peak season, the big importers).
- The warning is matched exactly, header included — all caps, bold. People get creative with it and that's a rejection.
- Trivial text differences can't cause rejections — capitalization and spacing get normalized before comparison.
- The UI is built for a low-tech user (the 73-year-old benchmark): every verdict is icon + color + word, never color alone, and there's no jargon anywhere.

**From TTB / COLA:**
- COLA is the system of record and integrating with it is out of scope, so the form simulates a COLA record rather than pretending to connect to one.
- An application carries multiple images and the warning is often on the back — hence multi-image extraction.
- The form's fields split into label-verifiable (these drive verdicts) and administrative (carried as context, never "verified" against artwork).
- The comparison baseline is the statutory warning text from 27 CFR Part 16.

**My scoping calls (the assignment explicitly said it values how you fill gaps):**
- Distilled spirits only. Beer and wine have their own rules (ABV-statement exemptions, vintage/appellation) — noted as future work, with a place in the schema already cut for them.
- No image persistence, by design — privacy, not a missing feature.
- ABV is matched exactly, no tolerance. It's a regulatory number, not a fuzzy field.
- Bold detection from a photo is best-effort, so a suspected non-bold header flags yellow (review), not red (reject).
- The prototype caps batch size while documenting the 300-application production target.
- Rotation and mild skew are handled natively by the vision model; an extreme rotation that defeats it falls through to NEEDS_REVIEW rather than getting preprocessed or, worse, guessed.
- Deployment is public without auth and holds no PII — appropriate for a proof-of-concept, and called out as something that changes for production.

One assumption deserves its own line because it's an invention, not an inference: the **CAP (COLA Application Package)** format is something I defined to pair application data with label images. It's versioned, it has a documented JSON Schema, and it's a deliberate stand-in for a real COLA export — not a claim about how COLA actually exports data. It exists because the prototype needed a structured way to move "an application" around without a system of record behind it.
