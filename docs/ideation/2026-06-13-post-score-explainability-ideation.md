---
date: 2026-06-13
topic: post-score-explainability
focus: more observability into why a post was given a specific score
mode: repo-grounded
---

# Ideation: Post Score Explainability

## Grounding Context

**Project:** Signal Density Filter — Node.js harness + Chrome MV3 extension filtering X.com posts via governed scoring (Material Handler → Guardrails → Checkpoints CP-0..CP-5 → Alarms). Tiered cascade: heuristic scores all posts; LLM on gray band (30–60), `escalate: true`, or heuristic/LLM disagreement ≥15pts.

**Score explainability gaps today:**
- UI shows action + score + ~2 reason codes — a number without decomposition
- `commitDecision()` truncates agent `reasons` to 2 for SHOW/HIDE; full reasons only on HOLD
- Heuristic worker accumulates signed deltas (baseline 50 → rules) but only emits final integer + prose labels
- `cascadeResult` (heuristic pre-score, `llmInvoked`, disagreement, latency) computed but never emitted
- Confidence and gray-band status hidden — two posts at score 55 look identical at 0.3 vs 0.9 confidence
- `SHOW_THRESHOLD = 40` invisible — score 39 HIDE vs 41 SHOW indistinguishable except 2 points
- Architecture: agent scores; harness decides — UI conflates agent rationale with policy outcome

**External context:** Calabrese ACL 2024 — structured span explanations beat generic policy text; MoMoE 3-level trace disclosure; ECOA requires factors actually scored; faithfulness research warns post-hoc LLM prose can be persuasive but causally wrong.

## Topic Axes

1. Numeric score attribution — what moved the score to this number
2. Scorer provenance — which worker/path produced the final score
3. Uncertainty signals — confidence, escalate, gray-band membership
4. Harness threshold mapping — how score + context became SHOW/HIDE/HOLD/BLOCK
5. Comparative/counterfactual hooks — what would change the score or outcome

## Ranked Ideas

### 1. Heuristic Score Ledger (Signed Factor Waterfall)

**Description:** Surface the heuristic worker's additive math as a compact ledger: baseline 50 → each fired rule with signed delta (+15 information density, −25 emoji density, +12 citation) → clamped final. Render as a mini waterfall so operators can reconstruct the number without server logs. For LLM-final posts, show heuristic ledger grayed out plus an explicit "LLM adjustment" line without fake feature mapping.

**Axis:** Numeric score attribution

**Basis:** `direct:` `harness/agents/heuristic-classifier.js` starts at 50 and applies ± deltas per rule; UI only surfaces final `signal_score` · `external:` ECOA adverse-action pattern — factors disclosed must be ones actually evaluated

**Rationale:** "Why 47?" is unanswerable today because the integer hides a constructed sum. The ledger makes the score auditable and faithfulness-tested — each line maps to a deterministic check, not post-hoc narrative.

**Downsides:** LLM path cannot decompose the final integer into features without inventing attribution; ledger must clearly label heuristic-only vs LLM-final sections. Requires extending publish payload or bundle trace.

**Confidence:** 91%

**Complexity:** Medium

**Status:** Unexplored

---

### 2. Stop Truncating Agent Reasons at Commit

**Description:** Remove `reasons.slice(0, 2)` in `commitDecision()` for SHOW/HIDE and emit full `agent_reasons[]` at commit via `publishDecision()`. Sidebar uses progressive disclosure: collapsed row shows top 2 codes; expand reveals complete agent rationale. Makes truncation a UI choice, not a silent data loss at commit.

**Axis:** Numeric score attribution

**Basis:** `direct:` `decision.js` slices reasons for SHOW/HIDE while HOLD keeps full `agentReasons`; CP-2 stores complete `agentOutput` in SQLite · `direct:` prior ideation and plan 004 establish shared publish helper to prevent SSE/REST drift

**Rationale:** The smallest change that restores "why this score" — full reasons already exist at CP-2 but are dropped before the operator sees them. Operators currently assume two codes are the complete grading story.

**Downsides:** Slightly larger SSE payloads; must update `buildDecisionEventPayload()` and sidebar renderers together.

**Confidence:** 93%

**Complexity:** Low

**Status:** Unexplored

---

### 3. Cascade Routing Receipt

**Description:** Attach a `cascade_meta` block to every decision: `heuristic_score`, `llm_invoked`, `branch_trigger` (`gray_band`, `escalate`, `disagreement`, `forceLlm`), `disagreement_delta`, `latency_ms`, `final_worker`. Render compact fingerprint chip on each row — `H:47`, `H→L`, `H→L Δ19` — answering "which scorer produced this number and why that path ran?"

**Axis:** Scorer provenance

**Basis:** `direct:` `runCascade()` returns full metadata; `processor.js` holds `cascadeResult` through commit but none reaches SSE · `external:` MoMoE expert-trace pattern; Filter-And-Refine cascade audit — log which stage decided

**Rationale:** A displayed score of 52 is ambiguous: heuristic-only fast path vs LLM-refined gray-band result. Provenance is the first question when a borderline post surprises during demo.

**Downsides:** Requires threading cascade metadata into publish path; chip copy must stay in sync if cascade rules change.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

---

### 4. Confidence & Gray-Band Stamp

**Description:** Qualify every numeric score with uncertainty context: confidence value or tier (fragile/solid), `GRAY_BAND` badge when score ∈ [30,60], and escalate pin when `escalate: true`. Two posts at score 55 must read differently at confidence 0.35 vs 0.92. Optional uncertainty band visualization: `[score − band, score + band]` derived from `(1 − confidence)`.

**Axis:** Uncertainty signals

**Basis:** `direct:` heuristic assigns confidence 0.75/0.55 by word count; `escalate = score >= 30 && score <= 60`; sidebar omits confidence on SHOW/HIDE · `external:` Calabrese — wrong explanations erode trust; SAP Fiori — confidence categories over false precision

**Rationale:** Score without confidence is false precision. A 42 in the gray band is inherently provisional — the stamp prevents operators from treating it as a firm grade.

**Downsides:** UI density on compact rows; must not conflate confidence with harness HOLD policy (pair with #5).

**Confidence:** 88%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 5. Harness Commit Explainer (Agent vs Policy Fork)

**Description:** Publish structured `commit_rationale` separate from agent grading: which `commitDecision()` branch fired (`SCORE_ABOVE_THRESHOLD`, `LOW_CONFIDENCE_HIGH_REACH`, `AGENT_ESCALATION`, guardrail BLOCK), policy inputs used (`show_threshold: 40`, `likes`, `confidence`), and harness `reason_codes` displayed in a distinct column from agent `reasons[]`. Dual-column card: left = "what the scorer thought," right = "why the harness committed."

**Axis:** Harness threshold mapping

**Basis:** `direct:` `commitDecision()` encodes compound rules invisible in UI; architecture KTD2 "agent scores; harness decides" · `external:` ECOA principal-reason-for-action distinct from score-factor list; Discord violation cards separate policy from evidence

**Rationale:** A HOLD at score 55 looks like "the agent rejected it" when harness policy triggered `LOW_CONFIDENCE_HIGH_REACH`. Separating scorer output from harness branch is essential for score explainability — the number and the action are not the same story.

**Downsides:** More fields in decision schema; demo copy must explain threshold constants.

**Confidence:** 89%

**Complexity:** Medium

**Status:** Unexplored

---

### 6. Threshold Distance & Counterfactual Ruler

**Description:** Show margin to harness flip point: `39 → 1pt below SHOW (≥40)` with a visual ruler. Emit lightweight counterfactuals at commit: `distance_to_show`, optional `at_threshold_35: SHOW`. For heuristic posts, add near-miss chips from inverted rule checks: `+ citation (+12) → 47 SHOW` when citation regex did not match.

**Axis:** Comparative/counterfactual hooks

**Basis:** `direct:` `SHOW_THRESHOLD = 40` in `decision.js`; UI shows HIDE/SHOW without distance · `reasoned:` invert `heuristic-classifier.js` rule guards on stored normalized text without re-scoring

**Rationale:** Explains "why HIDE at 39?" as a named policy miss, not mysterious veto. Counterfactual chips turn "why this score?" into "what single change flips it?" — highest demo value for borderline posts.

**Downsides:** Counterfactual chips heuristic-only; LLM path needs different empty state. Near-miss chips could mislead if rules interact non-additively (document as single-factor estimate).

**Confidence:** 86%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 7. Heuristic ↔ LLM Diff Panel

**Description:** When `llm_invoked`, show side-by-side cards: heuristic pre-score (category, reasons, confidence) vs final CP-2 `agentOutput`, highlighting fields that changed, category flip, and disagreement delta. Heuristic-only posts show single column with "no second opinion invoked." Pairs with cascade receipt (#3).

**Axis:** Scorer provenance · Comparative/counterfactual hooks

**Basis:** `direct:` `cascadeResult.heuristicResult` exists at process time; disagreement object computed when delta ≥ 15; no UI compares them · `external:` LangSmith trajectory partial-credit — compare steps not just final verdict

**Rationale:** "Why this score?" on LLM path requires knowing whether the LLM changed the grade and which reasons shifted. The tiered cascade's core narrative is invisible without this diff.

**Downsides:** Only meaningful when LLM runs; depends on #3 or bundle trace for data access; empty state for heuristic-only majority of posts.

**Confidence:** 87%

**Complexity:** Medium

**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Neighbor Score Comparator | Decorative peer context; weak `reasoned:` basis; doesn't explain *this* score |
| 2 | Zero-UI Full Trace in Every SSE | Payload bloat; bundle trace API is cleaner compounding path |
| 3 | DoorDash Per-Category Harm Sub-Scores | Requires new multi-factor schema not in agent-output contract |
| 4 | Auto-Synthesized Grading Narrative | Faithfulness risk — Calabrese/Oxford AIGI warn post-hoc prose can mislead |
| 5 | In-Feed Score Anatomy Overlay (standalone) | Valid placement but depends on #2–#3 data; better as UI variant after SSE enrichments |
| 6 | Dropped-Factor Ghost Footer | Stopgap subsumed by #2 (stop truncation) |
| 7 | Confidence-First Row Inversion | Partial UX flip; subsumed by #4 confidence stamp |
| 8 | Push Trace on Decision (no click) | Overlaps fat SSE; bundle trace + expand is cleaner |
| 9 | Recall-Ranking Full CP-0..CP-5 Audit | Overlaps plan 006 bundle trace; checkpoint accordion is separate surface |
| 10 | Span-Anchored Highlights | Strong but Medium+ scope; deferred — pairs well with #1 ledger as follow-on |
| 11 | OpenTelemetry / Black Box Recorder | Plan 003 explicitly out of scope |
| 12 | Grading Dashboard (demote decisions) | Too disruptive to panel hierarchy for hackathon scope |
| 13 | MoMoE Full Expert Trace JSON | Heavier than #3 receipt; receipt covers demo needs |
| 14 | Delete-Only vs Ledger-Only | Merged into #1+#2 as complementary survivors |

## Compounding Thread

Suggested ship order for score explainability: **#2 + #3 + #4** (SSE enrichments, low friction) → **#1** (ledger needs heuristic path exposed) → **#5 + #6** (policy context) → **#7** (diff panel, needs cascade meta). Ideas #1–#6 compose into a single expandable **Score Story Row** per post. Plan 006 bundle trace API remains the read-model backend for expand/drill-down without N round-trips.
