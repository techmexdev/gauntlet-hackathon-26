---
date: 2026-06-13
topic: post-score-explainability-phase-a
---

# Post Score Explainability — Phase A

## Summary

Enrich every scored decision with full agent rationale, cascade provenance, and confidence/gray-band context at publish time. Side panel rows show score plus cascade chip and confidence tier in compact form; full agent reasons appear on row expand. Live events and REST hydrate carry the same fields so replay and panel-open stay consistent.

## Problem Frame

Operators and demo presenters see a signal score and one or two reason codes on each decision row. They cannot tell which scorer produced the number (heuristic-only vs LLM-refined), how confident the grade is, or whether the post sat in the gray band where escalation is expected. Agent reasons are truncated at commit for SHOW/HIDE, so the two visible codes are often incomplete. Cascade metadata is computed during processing but never reaches the panel. During demo beats (worker divergence, borderline HIDE, held queue review), "why this score?" requires server logs or checkpoint REST — not the observability cockpit the product already ships.

---

## Key Decisions

- **K1: Enrich at publish, not fetch-on-expand.** Decision events and stored decisions carry explainability fields when the harness commits. Row expand reveals data already on the row; no per-row trace fetch for Phase A.
- **K2: Compact row shows provenance and uncertainty; full reasons on expand.** Visible without expand: score, action, cascade chip, confidence tier (and gray-band badge when applicable). Full `agent_reasons` list appears only when the operator expands the row.
- **K3: Separate agent reasons from harness reason codes.** Harness codes (`SCORE_BELOW_THRESHOLD`, guardrail codes) describe policy outcome. Agent reasons describe grading rationale. Compact row does not merge them into one undifferentiated list.
- **K4: Same shape on SSE and REST.** Panel hydrate on open uses the same field names and semantics as live `decision` SSE events (snake_case at the wire boundary), following the pattern established for filtered-post observability.
- **K5: Side panel only for Phase A.** Recent Decisions, Filtered Posts, and Held for Review sections receive the new disclosure. Timeline overlay and in-feed score anatomy are deferred.

---

## Actors

- **A1. Operator (presenter)** — reads score explainability in the side panel during live demo and replay; expands rows when narrating "why this score."
- **A2. Side panel UI** — renders compact chips and expandable reason stacks on decision and held rows; hydrates from REST on panel open.
- **A3. Harness** — attaches explainability fields at decision commit and publishes them on the decision event bus; persists fields needed for REST hydrate.
- **A4. Service worker** — forwards hydrated decision payloads to the sidebar (existing fetch patterns; no direct harness calls from the panel).

---

## Requirements

### Harness — decision payload

- **R1.** When the harness commits a scored decision (SHOW, HIDE, or HOLD), the published decision payload includes the complete agent `reasons` array without truncation at commit time.
- **R2.** Harness `reason_codes` on SHOW/HIDE contain harness policy codes only (e.g. `SCORE_ABOVE_THRESHOLD`, `SCORE_BELOW_THRESHOLD`, guardrail codes on BLOCK). Agent reason strings are not spliced into `reason_codes`.
- **R3.** Published decision payload includes `agent_reasons` (array of strings) mirroring the agent output at CP-2.
- **R4.** Published decision payload includes `confidence` (0–1) and `escalate` (boolean) from agent output when present.
- **R5.** Published decision payload includes a `cascade_meta` object when cascade scoring ran, with at minimum: `heuristic_score`, `llm_invoked`, `final_worker`, and `branch_trigger` (`heuristic_only`, `gray_band`, `escalate`, `force_llm`, or `llm_fallback`).
- **R6.** When LLM was invoked and heuristic and final scores differ by 15 or more, `cascade_meta` includes `disagreement_delta`.
- **R7.** When LLM was invoked, `cascade_meta` includes `latency_ms` for the cascade.
- **R8.** REST endpoints that return session decisions for panel hydrate include the same explainability fields as live SSE decision events (`agent_reasons`, `confidence`, `escalate`, `cascade_meta`).
- **R9.** BLOCK decisions from guardrails omit agent scoring fields (`agent_reasons`, `confidence`, `escalate`, `cascade_meta` null or absent) rather than emitting misleading provenance.

### Side panel — compact disclosure

- **R10.** Recent Decisions rows display: action badge, signal score (when present), cascade chip derived from `cascade_meta`, and confidence tier derived from `confidence`.
- **R11.** Cascade chip encodes scorer path at a glance: heuristic-only (`H:{score}`), LLM invoked (`H:{h} → L:{final}` or equivalent compact form), optional disagreement suffix when `disagreement_delta` is present, fallback indicator when branch is `llm_fallback`.
- **R12.** Confidence tier uses three bands: solid (≥ 0.7), moderate (0.5–0.69), fragile (< 0.5). Display as labeled tier or icon, not raw float alone on the compact row.
- **R13.** When `escalate` is true or heuristic score falls in the gray band (30–60), compact row shows a gray-band or escalation badge distinct from the confidence tier.
- **R14.** Filtered Posts rows (HIDE and BLOCK sections) follow the same compact disclosure rules as Recent Decisions when agent scoring fields are present.
- **R15.** Held for Review rows include cascade chip and confidence tier in compact form, matching Recent Decisions and Filtered Posts so held posts are not richer on provenance only in that section.

### Side panel — expand disclosure

- **R16.** Clicking or toggling a decision row expands an inline section listing all `agent_reasons` in order.
- **R17.** Expanded section does not duplicate harness `reason_codes` as if they were agent rationale; harness codes remain visible as action/policy context (e.g. adjacent to action badge or in a separate labeled line).
- **R18.** Only one expanded decision row per list section at a time; expanding another row collapses the previous.
- **R19.** When `agent_reasons` is empty or absent (BLOCK), expand affordance is hidden or shows a guardrail-specific message — no empty expand shell.

### Demo and parity

- **R20.** Replay and live ingest produce decision rows with identical explainability field shapes so demo rehearsal matches live behavior.
- **R21.** Panel open hydrate (Filtered Posts, Recent Decisions) renders the same compact and expand behavior as rows appended from live SSE during the session.

---

## Key Flows

- **F1. Live scored post arrives**
  - **Trigger:** Harness commits SHOW, HIDE, or HOLD after CP-2 scoring.
  - **Actors:** A3, A2
  - **Steps:** Harness publishes decision with full explainability fields → sidebar prepends row with compact chips → operator optionally expands for full agent reasons.
  - **Outcome:** Operator can answer "which scorer?" and "how fragile?" without leaving the panel.

- **F2. Panel hydrate on open**
  - **Trigger:** Operator opens side panel mid-session.
  - **Actors:** A4, A2, A3
  - **Steps:** Service worker fetches session decisions → sidebar renders historical rows with same compact/expand rules as SSE-appended rows.
  - **Outcome:** Explainability is not forward-only; past decisions in the session are legible.

- **F3. Borderline HIDE narration**
  - **Trigger:** Operator expands a HIDE row near threshold during demo.
  - **Actors:** A1, A2
  - **Steps:** Compact row shows score and cascade path → expand reveals full agent reason list separate from `SCORE_BELOW_THRESHOLD`.
  - **Outcome:** Operator narrates grading factors, not just policy outcome.

---

## Acceptance Examples

- **AE1. Heuristic-only SHOW**
  - **Covers:** R1, R3, R5, R10, R11, R16
  - **Given:** Post scored heuristic-only at 72 with three agent reasons
  - **When:** Decision appears in Recent Decisions
  - **Then:** Compact row shows score 72, chip `H:72`, solid confidence tier; expand lists all three agent reasons; `reason_codes` contains `SCORE_ABOVE_THRESHOLD` only

- **AE2. Gray-band LLM path**
  - **Covers:** R5, R6, R11, R13
  - **Given:** Heuristic 52, LLM invoked via gray band, final score 45, delta 7 (< 15)
  - **When:** Decision row renders
  - **Then:** Chip shows `H:52 → L:45`; gray-band badge visible; no disagreement suffix

- **AE3. High disagreement**
  - **Covers:** R6, R11
  - **Given:** Heuristic 58, LLM 41, delta 17
  - **When:** Decision row renders
  - **Then:** Chip includes disagreement indicator (e.g. `Δ17`)

- **AE4. Guardrail BLOCK**
  - **Covers:** R9, R19
  - **Given:** Post blocked at CP-1 with no agent score
  - **When:** Row appears in Filtered Posts blocked section
  - **Then:** No cascade chip or confidence tier; no expand for agent reasons; guardrail reason codes visible

- **AE5. Fragile confidence**
  - **Covers:** R4, R12
  - **Given:** Two SHOW decisions both at score 55, confidence 0.92 vs 0.42
  - **When:** Rows render side by side
  - **Then:** Compact rows show different confidence tiers without expanding

- **AE6. Hydrate parity**
  - **Covers:** R8, R21
  - **Given:** Session with prior HIDE decisions before panel was opened
  - **When:** Operator opens panel and Filtered Posts hydrates
  - **Then:** Hydrated rows match compact/expand behavior of rows seen via live SSE

---

## Success Criteria

- During the worker-divergence demo beat, operator can state whether LLM ran and the heuristic pre-score without opening server logs or checkpoint REST.
- Operator can expand any SHOW/HIDE row and read the complete agent reason list in one click.
- A judge comparing two borderline posts can distinguish fragile vs solid grades from compact row alone.
- No regression: existing side panel sections (alarms, checkpoints, held count) continue to function; new fields do not break rows when absent (replay of older tapes without new fields degrades gracefully).

---

## Scope Boundaries

**Deferred for later (Phase B+):**
- Heuristic score ledger (signed factor waterfall)
- Harness commit explainer (agent grading vs harness policy fork)
- Threshold distance ribbon and counterfactual chips
- Heuristic ↔ LLM side-by-side diff panel
- Timeline overlay / in-feed score anatomy
- Bundle trace accordion as primary explainability surface (plan 006 remains complementary)

**Outside this product's identity:**
- Post-hoc LLM-generated "explain this score" prose summaries
- OpenTelemetry / external trace export for scoring

---

## Dependencies / Assumptions

- Tiered cascade rules (gray band 30–60, escalate flag, disagreement threshold 15) remain as implemented; chip copy tracks current cascade behavior.
- `publishDecision` shared helper remains the single builder for SSE decision shape; ingest and tape replay both call it.
- Held queue REST already returns agent reasons; Phase A adds cascade and confidence fields to held row hydrate or decision join as needed.
- Assumption: compact row fits demo panel width with chip + tier + score; if not, chip abbreviates before dropping score.

---

## Sources / Research

- Ideation: `docs/ideation/2026-06-13-post-score-explainability-ideation.md` (survivors #2–#4, Phase A ship order)
- Prior observability pattern: `docs/plans/2026-06-13-004-feat-hidden-posts-observability-plan.md` (enrich at publish + REST hydrate)
- Held queue row shape precedent: `docs/brainstorms/2026-06-13-held-queue-sidebar-requirements.md` (full agent reasons on held rows)
- Bundle trace API exists for future drill-down but is not required for Phase A row expand
