---
date: 2026-06-13
topic: grading-story-row
origin: docs/ideation/2026-06-13-agent-grading-observability-ideation.md
---

# Requirements: Grading Story Row

## Summary

Add a unified **Grading Story Row** to the Signal Density Filter side panel — one shared expandable component used in Recent Decisions, Filtered Posts, and checkpoint log click. Collapsed view shows action, score, confidence bar, and cascade chip; expanded view uses four tabs (Agent, Cascade, Gates, Policy) so a demo judge can answer whether the LLM ran, which gate failed, and why a post was held — without server logs — in under 30 seconds per post.

---

## Problem Frame

Plans 003/004 shipped SSE decisions, alarms, checkpoints, and filtered posts, but grading observability still stops at action + score + two reason codes. The harness computes cascade metadata, full agent rationale, checkpoint runs, and distinct commit branches at decision time — yet operators cannot narrate the tiered heuristic→LLM cascade, separate agent judgment from harness policy, or walk CP-0→CP-5 for a single post during demo. The Checkpoints, cascade, HOLD, and Filtered Posts beats all need the same explainability surface; building four separate UIs would drift and duplicate logic.

---

## Key Decisions

- **Unified component, three entry points.** One shared row component renders in Recent Decisions, Filtered Posts, and when an operator clicks a checkpoint log row. Parent lists own list-specific behavior (ordering, clickability); row logic is not duplicated per surface.

- **Tabbed expand, not stacked accordion.** Expanded content organizes into four tabs — **Agent**, **Cascade**, **Gates**, **Policy** — so operators jump to the layer relevant to the current demo beat without scrolling a long card.

- **Enriched live payload + lazy trace for gates.** Agent, Cascade, and Policy tabs render from enriched decision data available at publish/hydrate time. The Gates tab loads full checkpoint narrative on first tab open via the bundle trace read model (plan 006). This balances instant cascade/confidence visibility with lean default payloads.

- **Collapsed confidence visible; reasons on expand.** The collapsed row shows action, score, confidence bar (with 0.5 threshold marker), and cascade chip. Agent reason codes appear only inside the Agent tab — not in the collapsed summary.

---

## Actors

- A1. **Demo operator** — narrates grading during live or replay demo; expands rows to answer judge questions.
- A2. **Demo judge / reviewer** — observes side panel; must grasp cascade path, gate failures, and HOLD rationale quickly.
- A3. **Harness** — publishes enriched decision data and serves bundle trace on demand.
- A4. **Extension side panel** — renders Grading Story Row; hydrates on open and streams live updates.

---

## Requirements

### Shared row component

- R1. A single Grading Story Row component renders in Recent Decisions, Filtered Posts, and as the expand target when an operator clicks a checkpoint log row for a known bundle.
- R2. Collapsed row displays: final action (SHOW/HIDE/HOLD/BLOCK), signal score, confidence bar (0–1 with 0.5 threshold marker), and cascade chip (`H` heuristic-only, `H→L` LLM invoked, optional disagreement delta when ≥15).
- R3. Expanding a row reveals four tabs: **Agent**, **Cascade**, **Gates**, **Policy**. Default tab on first expand is **Agent**.
- R4. Row identity is keyed by bundle — the same bundle expanded from different entry points shows consistent content.

### Agent tab

- R5. Agent tab shows full agent reason list (not truncated to two codes), category, worker, confidence value, and escalate flag when present.
- R6. When no agent ran (guardrail block before scoring), Agent tab shows an explicit empty state — not a blank panel.

### Cascade tab

- R7. Cascade tab shows whether the LLM was invoked, heuristic pre-score when available, gray-band context, escalation trigger when applicable (gray band, escalate flag, disagreement, forced LLM), disagreement delta, and scoring latency — sufficient for a demo judge to answer whether the LLM ran and why without server logs.
### Gates tab

- R9. Gates tab shows CP-0 through CP-5 pass/fail status per gate, reason code on failure, and enough detail at CP-2 to see agent scoring output summary.
- R10. Gates tab loads on first tab open (lazy), not on row collapse/expand alone — Agent and Cascade tabs must not wait for this fetch.
- R11. When bundle trace is unavailable, Gates tab shows a clear unavailable state — not partial or misleading gate data.

### Policy tab

- R12. Policy tab shows which harness commit branch fired (e.g. score above threshold, score below threshold, low confidence high reach, agent escalation, guardrail block) separately from agent reason codes.
- R13. Policy tab shows the policy inputs that drove the branch: show threshold, confidence, reach signal (likes or equivalent), guardrail outcome, and harness reason codes — distinct from agent reasons.
- R14. Policy tab makes HOLD attributable to harness policy when applicable — not presented as agent judgment.

### Data parity and live behavior

- R15. Every field visible in the collapsed row or Agent/Cascade/Policy tabs is present in live decision streaming and in REST hydration when the side panel opens — no panel-only fields that disappear on refresh.
- R16. Full agent reasons are retained at commit time for SHOW/HIDE — truncation to two codes is not the source of truth when the Grading Story Row is expanded.

---

## Key Flows

- F1. Operator expands a Recent Decisions row during replay
  - **Trigger:** Decision event arrives or row clicked in Recent Decisions.
  - **Actors:** A1, A4
  - **Steps:** Collapsed row shows action, score, confidence, cascade chip → operator expands → Agent tab visible immediately → operator switches to Cascade or Policy as needed → operator opens Gates tab → gate narrative loads → operator narrates answer to judge question.
  - **Outcome:** Judge question answered within 30 seconds without leaving the side panel.
  - **Covered by:** R2, R3, R5, R7, R9–R10, R12

- F2. Operator investigates a hidden post in Filtered Posts
  - **Trigger:** Post was HIDE or BLOCK; operator opens Filtered Posts section.
  - **Actors:** A1, A4
  - **Steps:** Same Grading Story Row as F1 → Policy tab explains harness commit → Gates tab shows where pipeline stopped if blocked before commit.
  - **Outcome:** "Why was this hidden?" answered from Policy + Gates tabs.
  - **Covered by:** R1, R12–R14

- F3. Operator clicks checkpoint log row
  - **Trigger:** Checkpoint SSE or hydrated log shows a stage event; operator clicks row.
  - **Actors:** A1, A4
  - **Steps:** Grading Story Row expands for that bundle → Gates tab selected or highlighted → full gate chain visible → other tabs available for cascade and commit context.
  - **Outcome:** Checkpoints demo beat connects log line to full bundle story.
  - **Covered by:** R1, R9, F1

---

## Acceptance Examples

- AE1. Heuristic-only SHOW
  - **Covers:** R2, R7, R12
  - **Given:** Post scored heuristic-only, score 62, confidence 0.82, SHOW committed
  - **When:** Operator expands row, opens Cascade tab, and opens Policy tab
  - **Then:** Cascade chip shows `H`; Cascade tab shows LLM not invoked; Policy tab shows score-above-threshold branch

- AE2. Gray-band LLM refinement
  - **Covers:** R2, R7, R5
  - **Given:** Heuristic 47, LLM invoked in gray band, final score 52, SHOW
  - **When:** Operator expands row
  - **Then:** Cascade chip shows `H→L`; Cascade tab shows heuristic pre-score, LLM invoked, gray-band trigger; Agent tab shows full LLM reasons

- AE3. Low-confidence HOLD
  - **Covers:** R2, R12, R14
  - **Given:** Score 55, confidence 0.35, high reach, HOLD with low-confidence-high-reach branch
  - **When:** Operator opens Policy tab
  - **Then:** Harness branch and inputs shown separately from agent reasons; operator can explain HOLD as policy-driven, not agent indecision

- AE4. Guardrail BLOCK before agent
  - **Covers:** R6, R9, R12
  - **Given:** CP-1 guardrail block; no agent output
  - **When:** Operator expands row and opens Agent, Gates, and Policy tabs
  - **Then:** Agent tab shows explicit no-agent state; Gates tab shows CP-1 fail; Policy tab shows guardrail block branch

- AE5. Gates tab trace unavailable
  - **Covers:** R11
  - **Given:** Bundle trace read model not reachable or bundle not found
  - **When:** Operator opens Gates tab
  - **Then:** Clear unavailable message; Agent, Cascade, and Policy tabs still render from decision data

---

## Success Criteria

- SC1. A demo judge can answer these three questions in under 30 seconds per post using only the Grading Story Row: (1) Did the LLM run? (2) Which checkpoint gate failed? (3) Why was this post held?
- SC2. The same row component and expand behavior work identically from Recent Decisions, Filtered Posts, and checkpoint log click — no surface-specific grading UI forks.

---

## Scope Boundaries

### Deferred for later

- Session-level grading vitals, ECE charts, strictness regime dial (ideation #5, #14)
- Shadow grading and counterfactual re-runs (ideation #7, #8)
- In-feed ghost receipt on the X timeline (ideation #13)
- Human oversight SSE events for HITL resolve (ideation #9)
- Policy version stamp chips (ideation #10)
- Heuristic↔LLM side-by-side diff panel as a separate surface (ideation #7) — Cascade tab carries the essential path narrative for v1
- Trace projection depths and trace digest watermark on rows (ideation #11, #12)
- Alarm-bundle provenance drawer (ideation #5 alarm correlation) — separate from per-bundle row expand

### Outside this product's identity

- OpenTelemetry export or NDJSON log-only observability
- Replacing the side panel with timeline-only or REST-pull-only observability

---

## Dependencies / Assumptions

- D1. **Bundle trace read model (plan 006)** is the authoritative source for Gates tab content. Agent, Cascade, and Policy tabs may ship first; Gates tab degrades gracefully until trace is available (R11).
- D2. **Enriched decision publishing** — cascade metadata, confidence, escalate, full agent reasons, and commit rationale must be available at decision publish/hydrate time for tabs that do not depend on trace.
- D3. **Architecture boundary preserved** — agent scores; harness decides. UI must never collapse these into a single undifferentiated reason list (R12–R14).
- AS1. Demo volume is moderate (replay tapes, live scroll) — per-row enrichments and lazy Gates fetch are acceptable latency-wise.
- AS2. Operators demo from the side panel during hackathon; timeline overlay observability is explicitly out of scope.

---

## Outstanding Questions

- OQ1. **Resolve before planning:** When bundle trace is not yet shipped, is it acceptable to release Grading Story Row with Agent/Cascade/Policy tabs only and a placeholder Gates tab — or must all four tabs work before merge?
- OQ2. **Deferred to planning:** Default tab on expand from checkpoint log click — always Agent, or Gates when entry point is checkpoint log?

---

## Sources / Research

- `docs/ideation/2026-06-13-agent-grading-observability-ideation.md` — ideas #1–#4 (rationale, cascade, trace, commit explainer); compounding thread
- `docs/plans/2026-06-13-004-feat-hidden-posts-observability-plan.md` — shared publish helper, enrich-at-publish pattern
- `docs/plans/2026-06-13-006-feat-bundle-trace-investigation-plan.md` — bundle trace read model for Gates tab
- `HARNESS.md` — four pillars, CP-0..CP-5 gates, cascade rules, architecture boundary
