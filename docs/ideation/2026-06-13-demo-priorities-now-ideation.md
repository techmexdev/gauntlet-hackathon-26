---
date: 2026-06-13
topic: demo-priorities-now
focus: best thing to work on for hackathon demo; how to nail R1–R21 / AE1–AE7 requirements
mode: repo-grounded
---

# Ideation: What to Work on Now for Demo (Updated)

## Grounding Context

**Project:** Signal Density Filter — Chrome MV3 extension + local Node.js harness that filters X.com timelines via governed pipeline (Material Handler → Guardrails → Checkpoints → Alarms). Hackathon success criterion: judges say *"my feed got quiet while I watched"* — not *"they showed me a dashboard."*

**State shift (second pass today):** Plans 010 (Grading Story Row), 011 (held drawer dock), and 012 (session metrics + quiet ticker) are all **completed**. `Start demo in replay` ships in `sidebar.html`. Held dock opens drawer mode (`filter-ui.js`). The codebase is feature-complete for demo requirements. **The only remaining work is verification, rehearsal, and requirements traceability** — proving each R1–R21 requirement has a visible beat judges can see.

**Requirements source of truth:** `docs/brainstorms/2026-06-13-signal-density-filter-requirements.md` defines R1–R21; `docs/demo-checklist.md` maps acceptance examples AE1–AE7 (plus AE1b, AE3b, AE3c). Anchor bundles: `demo-bait-0`, `demo-signal-0`, `demo-borderline-0`.

**Past learnings:** `docs/solutions/` does not exist — greenfield knowledge base.

**External context:** 2025–2026 hackathon playbooks converge on feature freeze 4–6 hours before demo, golden-path rehearsal 5×, backup screencast, rubric reverse-engineering (write exact proof under each criterion before pitching), and leading with a visceral before/after in the first 30 seconds. Judges decide in ~30s whether the problem is real; presentation often outweighs architecture depth in finals.

## Topic Axes

1. **Requirements traceability** — R1–R21 mapped to visible demo proof and checklist boxes
2. **Visible outcome** — feed quieting, metrics, ticker, AE1 proof (R1–R3)
3. **Demo reliability** — replay fallback, connection boot, backup video (R4, R19–R20, AE2, AE7)
4. **Pillar narration** — four harness beats legible on stage (R5–R9, AE3–AE4)
5. **HITL & trust climax** — held resolve, explainability, worker divergence (R10–R18, AE5–AE6)

## Ranked Ideas

### 1. Golden-Path Rehearsal + Full Checklist Walk (AE1–AE7)

**Description:** Run two back-to-back rehearsals per `docs/demo-rehearsal-kit.md`, walking every box in `docs/demo-checklist.md`. Log failures as a punch list; only fix code that blocks a checkbox. Treat as a single 2–3 hour block: `npm start` → replay `demo-v1` → full script → repeat. Do not start new features until every AE box is checked or explicitly waived with a rehearsed workaround.

**Axis:** Demo reliability

**Basis:** `direct:` Plans 010–012 are `status: completed`; demo checklist items remain unchecked manual verification; AE7 requires two replay rehearsals. `external:` AngelHack and Since AI recommend locking code and spending final hours on rehearsal, not features.

**Rationale:** Highest demo win-rate per hour now that features are shipped. Surfaces real failures (timing, anchor clicks, AE1b READY badge, held dock path) that ideation cannot predict. This is the mechanism that *nails* requirements — each AE box is an acceptance test for R1–R21.

**Downsides:** Feels unproductive if team expects more coding; requires disciplined stop after punch list is scoped.

**Confidence:** 97%

**Complexity:** Low (zero code if checklist passes)

**Status:** Unexplored

---

### 2. Requirements Traceability Matrix (R → AE → Anchor → Script Minute)

**Description:** Create a one-page operator sheet (can live in `docs/demo-rehearsal-kit.md` appendix or a sticky note) mapping each requirement cluster to proof:

| Req | AE | Visible proof | Anchor / action |
|-----|-----|---------------|-----------------|
| R1–R3 | AE1, AE1b | Ticker + ≥70% filter rate | Replay 30+ posts |
| R4, R20 | AE2 | Alt+Shift+R, layout unchanged | Live→replay switch |
| R7, R12 | AE3 | CP-1 guardrail code | `demo-bait-0` |
| R8, R21 | AE4 | Mid-checkpoint replay + worker swap | Terminal pre-staged |
| R15 | AE5 | Cascade chip Δ score | `demo-borderline-0` |
| R16–R18 | AE6 | Held resolve decrements count | Dock → drawer → card |
| R5 | AE7 | All four pillars under 5 min | Full script |

Rehearse narrating the requirement *while* showing the proof — not features in isolation.

**Axis:** Requirements traceability

**Basis:** `direct:` Requirements doc lists R1–R21 and F3 script segments but no single traceability view; demo checklist AE labels reference R numbers inconsistently; operator must defend "we hit every requirement" in Q&A. `reasoned:` Judges score against rubric dimensions; explicit R→proof mapping prevents "we built it but didn't show it" failure mode.

**Rationale:** Directly answers "how to nail the requirements." Turns shipped features into demonstrated compliance. Pairs with rehearsal — operator knows *why* each click matters for scoring.

**Downsides:** ~30 min doc work; must stay one page or it becomes unreadable on stage.

**Confidence:** 94%

**Complexity:** Low

**Status:** Unexplored

---

### 3. Rubric-to-Proof Judge Prep Sheet

**Description:** Reverse-engineer likely judging dimensions (Impact, Innovation, Technical execution, Demo presentation) and write one sentence of *exact on-screen proof* under each — before the pitch. Example mapping for this project:

- **Impact:** "70% of posts filtered; feed got quiet while scrolling" (ticker + overlay)
- **Innovation:** Named guardrail codes + six checkpoint gates, not opaque fade
- **Technical:** `demo-v1` replay + mid-checkpoint worker swap + Grading Story Row trace
- **Demo:** First 30s scroll with ticker climbing; backup replay pivot under 30s

Rehearse opening with Impact proof, not Material Handler internals.

**Axis:** Visible outcome

**Basis:** `external:` AngelHack Tip 1 (read rubric before scoping); DeepStation 2026 (copy rubric, write proof under each criterion); lablab.ai AI hackathon rubric weights Presentation and Business Value alongside Technical. `direct:` Success criterion is experiential ("feed got quiet"), not architectural.

**Rationale:** External research says judges form opinions in 30 seconds. Leading with rubric-weighted proof maximizes score even when R5 requires all pillars later. Prevents over-narrating CP-0 normalization when Impact dimension carries more weight.

**Downsides:** Rubric may differ from assumed dimensions; sheet is prep, not a slide to read verbatim.

**Confidence:** 91%

**Complexity:** Low

**Status:** Unexplored

---

### 4. AE7 Timing Audit + Emergency Beat Compression

**Description:** Time the full `docs/demo-script.md` on replay twice. If over 5 minutes, produce a written compression plan that preserves R5 (all four pillars) while cutting optional beats: shorten terminal worker-swap narration (keep one `npm run replay` command pre-typed), trim alarm sidebar dwell time, pre-expand held section before minute 3:45. Document the compressed script as the *primary* script if timing fails twice.

**Axis:** Pillar narration

**Basis:** `direct:` R5 requires full 5-minute script with all pillar beats; demo script includes optional terminal worker swap (minutes 2:00–2:30) that risks AE7 overrun; rehearsal kit is 10 minutes — different from 5-minute judge script. `external:` Mario Ottmann scope guillotine at T-4h — cut anything not visible in 2–3 minute core path.

**Rationale:** Nailing R5 is non-negotiable; timing is the most common hackathon failure mode after features ship. Compression plan is insurance without violating requirements — pillars stay, padding goes.

**Downsides:** Compressed script may feel rushed; worker swap may get minimal narration.

**Confidence:** 89%

**Complexity:** Low

**Status:** Unexplored

---

### 5. Backup Demo Screencast After First Clean AE1 Pass

**Description:** Once `demo-v1` replay hits AE1 READY (≥70% filter rate, 30+ decisions) and one full rehearsal completes under 5 minutes, record a clean screencast following `docs/demo-script.md`. Store as team fallback; rehearse the 30-second pivot line from live to replay without debugging on stage.

**Axis:** Demo reliability

**Basis:** `external:` Segment8 hybrid demo design and DeepStation 2026 require pre-recorded backup with <2 min pivot. `direct:` Demo script minute 4:30 scripts Alt+Shift+R fallback but no recorded backup is referenced in repo.

**Rationale:** Compounds all verification work into insurance. Near-zero code; prevents total demo loss on WiFi/X DOM/harness crash. Judges forgive pivot; they don't forgive 3 minutes of debugging.

**Downsides:** Recording can hide live authenticity if used as opener; must stay fallback per script.

**Confidence:** 90%

**Complexity:** Low

**Status:** Unexplored

---

### 6. First-30s Sensory Hook Isolation

**Description:** Script and rehearse the opening as a standalone beat: scroll 10–15s with extension active, point to **Feed quiet** ticker climbing and overlays appearing — *before* opening the side panel or naming checkpoint gates. Memorize one line: *"Watch the feed quiet — that's 70% noise filtered with named reason codes behind every decision."* Only after ticker hits READY (or ~20 decisions) transition to pillar walkthrough.

**Axis:** Visible outcome

**Basis:** `external:` Hackathon guides unanimous on 30-second judge decision window; Since AI before/after contrast beats feature tours. `direct:` AE1b quiet ticker ships (`quiet-ticker.js`); success criterion is experiential silence, not dashboard inspection.

**Rationale:** Nails R1–R3 perception even if later pillar beats compress. External research says this is what judges remember and repeat. Aligns rubric Impact dimension with opening, not minute 2:00 architecture.

**Downsides:** May undersell harness sophistication if judges want technical depth in Q&A — keep Grading Story Row for follow-up.

**Confidence:** 88%

**Complexity:** Low (script/rehearsal only)

**Status:** Unexplored

---

### 7. Q&A Defense Cheat Sheet (Governed Pipeline vs Rules-Only)

**Description:** Prepare three rehearsed answers for predictable judge questions: (1) "Why not just blocklists?" → guardrails are declared rules *plus* agent on borderline; (2) "Why checkpoints?" → schema/contract enforcement, replay from CP-3; (3) "What if the agent is wrong?" → HOLD + operator resolve on `demo-borderline-0`. Each answer ends with "let me show you" → anchor bundle click.

**Axis:** HITL & trust climax

**Basis:** `direct:` Requirements KTD: "Agent scores, harness decides"; AE6 HITL resolve is emotional climax; `demo-borderline-0` is pre-staged. `external:` lablab.ai penalizes chatbot wrappers — answer must show governance, not LLM magic.

**Rationale:** Requirements include R10–R18 (decisions, workers, HITL) that may not be obvious from scroll-only demo. Q&A is where R15–R18 get credit if stage time is tight.

**Downsides:** Over-rehearsed answers sound canned; keep answers under 20 seconds each.

**Confidence:** 85%

**Complexity:** Low

**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Finish plan 011 held drawer | Already completed — dock opens held drawer per `filter-ui.js` |
| 2 | Finish plan 012 session metrics | Already completed — ticker + sidebar metrics shipped |
| 3 | One-click replay boot button | Already shipped — `start-demo-btn` in `sidebar.html` |
| 4 | Checkpoint bundle trace accordion | Shipped via Grading Story Row Gates tab (plan 010) |
| 5 | Cascade receipt + full agent reasons | Shipped in grading story row; verify via AE3b, don't rebuild |
| 6 | High Signal tab as demo hook | Scope overrun — not in 5-min script; risks AE7 timing |
| 7 | New agent grading observability | Not demo-script minutes; harness threshold passed |
| 8 | Automated checklist CI script | Medium effort; manual walk sufficient for solo hackathon |
| 9 | Compress to 3 pillars only | Violates R5 — all four pillars must receive narrated beat |
| 10 | Live X as primary AE1 validation | Use replay for deterministic ≥70% proof; live is hook only |
| 11 | Cinematic ticker animations | Vanity polish vs rehearsal ROI at deadline |
| 12 | Feature freeze with zero verification | Shipped features mean nothing until checklist passes |

## Recommended "Work on Now" Stack

| Order | Work | Why now | Nails which requirements |
|-------|------|---------|--------------------------|
| **1** | Rehearsal + checklist block | Validates everything shipped | AE1–AE7 → R1–R21 |
| **2** | Requirements traceability matrix | Operator knows proof per R | R5, R7–R9, R16–R18 defense |
| **3** | Rubric-to-proof prep sheet | Judge-weighted opening | R1–R3 perception, Impact |
| **4** | AE7 timing audit | R5 without overrun | R5, AE7 |
| **5** | Backup screencast | Insurance after clean pass | R4, R19–R20 fallback |
| **6** | 30s hook + Q&A cheat sheet | Memorable open + Q&A credit | R1–R3, R15–R18 |

**Bottom line:** You are past the "build demo features" phase — plans 010–012 are done. The best work now is **rehearse, verify every checklist box, and map each requirement to a visible proof**. That is how you nail R1–R21: not more code, but demonstrated compliance on stage.
