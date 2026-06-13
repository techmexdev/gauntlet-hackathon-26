---
date: 2026-06-13
topic: agent-grading-observability
focus: adding more observability into what the agent is doing, the grading and so on
mode: repo-grounded
---

# Ideation: Agent Activity & Grading Observability

## Grounding Context

**Project:** Signal Density Filter — Node.js harness + Chrome MV3 extension filtering X.com posts via governed scoring (Material Handler → Guardrails → Checkpoints CP-0..CP-5 → Alarms). Tiered cascade: heuristic scores all posts; LLM on gray band (30–60), `escalate: true`, or heuristic/LLM disagreement ≥15pts.

**Baseline shipped (plans 003/004):** Four SSE types (`decision`, `alarm`, `checkpoint`, `held_count`); side panel with alarms, checkpoint log, recent decisions, filtered posts (score/category/worker), held count badge.

**Agent/grading gaps today:**
- Sidebar shows action + score + 2 reason codes — no confidence, escalate, or cascade path
- `commitDecision()` truncates agent `reasons` to 2 for SHOW/HIDE; full reasons only on HOLD
- `cascadeResult` (heuristic pre-score, `llmInvoked`, `disagreement`, `latencyMs`) computed in `processor.js` but never emitted on SSE
- CP-2 stores full `agentOutput` in SQLite; SSE checkpoint events carry only stage/status/reason_code
- Checkpoint REST drill-down exists (`GET /sessions/:id/checkpoints/:bundleId`) but sidebar has no click handler
- Alarms fire (`agent_latency`, `confidence_collapse`) without bundle-linked evidence in UI
- Architecture boundary: agent scores; harness decides — UI conflates the two today

**External context:** Langfuse/LangSmith trajectory scoring; LangGraph checkpoint gates; AgentTrace progressive disclosure; moderation cascades with structured rationale; CI/CD gate-status badges; airport-security lane replay analogies.

## Topic Axes

1. Agent scoring output visibility — score, category, reasons[], confidence, escalate
2. Cascade path visibility — heuristic vs LLM, disagreement, latency, llmInvoked
3. Checkpoint gate narrative — CP-0..CP-5 pass/fail with agent payload at CP-2
4. Decision/commit rationale — how harness maps agent output to SHOW/HIDE/HOLD/BLOCK
5. Anomaly & grading health — confidence_collapse, agent_latency, disagreement linked to bundles

## Ranked Ideas

### 1. Full Agent Rationale Surface

**Description:** Extend `publishDecision()` and REST decision payloads with full `agent_reasons[]`, `confidence`, `escalate`, and `worker`. Update Filtered Posts and Recent Decisions rows with an expandable reason stack: collapsed view keeps compact codes; expanded view shows complete agent rationale plus confidence bar (0–1 with 0.5 threshold marker) and escalate pin. Remove silent truncation at the UI layer — let collapse/expand replace `reasons.slice(0, 2)`.

**Axis:** Agent scoring output visibility

**Basis:** `direct:` `decision.js` slices `reasons.slice(0, 2)` for SHOW/HIDE; `buildDecisionEventPayload()` omits confidence and escalate; sidebar `renderFilteredRow()` only shows score and category

**Rationale:** Score-only rows hide grading fragility — a 55 at 0.3 confidence and a 55 at 0.9 look identical today. This is the lowest-effort, highest-signal fix because the harness already computes every field at commit time.

**Downsides:** Slightly larger SSE payloads; must keep shared publish helper in sync with REST to avoid drift (pattern established in plan 004).

**Confidence:** 90%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 2. Cascade Path on Every Decision

**Description:** Enrich decision SSE (via `publishDecision()` or sibling `publishCascade()`) with a `cascade_meta` block: `heuristic_score`, `llm_invoked`, `gray_band`, `llm_fallback`, `disagreement_delta`, `latency_ms`, `final_worker`. Render a compact fingerprint chip on each row — `H` (heuristic-only), `H→L` (LLM invoked), `H→L Δ19` (disagreement) — plus optional gray-band receipt explaining the branch taken (`in_gray_band`, `escalate`, `forceLlm`).

**Axis:** Cascade path visibility

**Basis:** `direct:` `runCascade()` returns full metadata; `processor.js` holds `cascadeResult` through commit but none reaches SSE · `external:` GenAI cascade routing patterns recommend logging every routing decision and escalation reason

**Rationale:** The tiered cascade is the product's core grading story, but operators cannot answer "did the LLM even run?" without server logs. Makes the heuristic→LLM design legible during demo.

**Downsides:** Requires threading cascade metadata into publish path; gray-band receipt copy needs maintenance if cascade rules change.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

---

### 3. Per-Bundle Grading Trace (Checkpoint Flight Recorder)

**Description:** Wire checkpoint log rows and Filtered Posts rows to `GET /sessions/:sessionId/checkpoints/:bundleId`. Render inline CP-0→CP-5 accordion: pass/fail per gate, reason codes on failure, CP-2 expand showing full `agentOutput` JSON already stored in SQLite. Failed stages highlight where pipeline stopped; links to final decision action.

**Axis:** Checkpoint gate narrative

**Basis:** `direct:` REST endpoint exists in `sessions.js`; CP-2 payload stores `{ agentOutput }`; sidebar checkpoint handler only prepends flat stage/status/bundle_id rows · `direct:` observability plan U4 specified click-to-drill-down — not implemented

**Rationale:** Checkpoints are the trust layer; disconnected log lines cannot tell one post's journey. REST authority already exists — this is primarily UI wiring.

**Downsides:** Per-row fetch on expand (mitigated by bundle trace API #6); must handle partial traces when pipeline fails early.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

---

### 4. Harness Commit Explainer

**Description:** Publish a structured `commit_rationale` alongside each decision: which `commitDecision()` branch fired (`SCORE_ABOVE_THRESHOLD`, `LOW_CONFIDENCE_HIGH_REACH`, `AGENT_ESCALATION`, guardrail BLOCK), inputs used (`show_threshold: 40`, `likes`, `confidence`, `guardrail_passed`), and harness `reasonCodes` displayed separately from agent `reasons[]`. Dual-column card optional: left = agent grading, right = harness policy outcome.

**Axis:** Decision/commit rationale

**Basis:** `direct:` `commitDecision()` encodes distinct branches with compound rules (high-reach + low-confidence HOLD) invisible in UI · `direct:` architecture KTD: "agent scores; harness decides" — UI conflates them today · `external:` credit adverse-action and policy-cited moderation rationale patterns

**Rationale:** A HOLD looks like "the agent wanted it" when harness policy triggered `LOW_CONFIDENCE_HIGH_REACH`. Separating agent judgment from harness policy is essential for governed-scoring credibility.

**Downsides:** More fields in decision schema; demo copy must explain threshold constants clearly.

**Confidence:** 87%

**Complexity:** Medium

**Status:** Unexplored

---

### 5. Grading Health & Disagreement Spotlight

**Description:** Session-level vitals strip: rolling mean confidence, gray-band LLM invocation rate, heuristic↔LLM disagreement count, schema-violation rate, latency p95. Auto-publish `grading_anomaly` SSE when `disagreement.delta ≥ 15`. Extend alarms with `triggering_bundle_ids[]` and grading snapshot; alarm rows open provenance drawer listing score, confidence, worker, cascade fingerprint at fire time.

**Axis:** Anomaly & grading health

**Basis:** `direct:` `cascade.js` computes disagreement but never surfaces it; `AlarmManager` tracks confidence/latency windows but sidebar shows message only · `direct:` ideation backlog #11/#12 for alarm-bundle correlation and pre-alarm gauges

**Rationale:** Disagreement is the highest-signal cascade health event; hiding it wastes the two-tier design. Shifts Alarms demo beat from event list to diagnosable grading degradation.

**Downsides:** Rolling window state in harness; vitals UI adds panel complexity; must dedupe with existing alarm list.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

---

### 6. Bundle Trace Read Model API

**Description:** Single endpoint `GET /sessions/:sessionId/traces/:bundleId` returning normalized bundle, all checkpoint runs, cascade metadata, final decision, related alarms, and held/HITL state — assembled from existing store queries. Powers checkpoint drill-down (#3), Filtered Posts expand, alarm investigation (#5), and held-queue forensics without N round-trips per feature.

**Axis:** Checkpoint gate narrative (compounding)

**Basis:** `direct:` ideation #13; plan 004 deferred Filtered Posts → checkpoint trace; today requires multiple REST calls · `reasoned:` one read model compounds every "explain this post" surface

**Rationale:** Highest leverage infrastructure move — every grading observability UI feature inherits one authoritative bundle view. Prevents SSE/REST shape drift as surfaces multiply.

**Downsides:** New route + assembly logic; must version response shape carefully; slightly more backend work before UI features land.

**Confidence:** 85%

**Complexity:** Medium–High

**Status:** Unexplored

---

### 7. Heuristic ↔ LLM Scoring Diff Panel

**Description:** When `llm_invoked`, expandable side panel section shows side-by-side cards: heuristic pre-score (category, reasons, confidence) vs final CP-2 `agentOutput`, highlighting fields that changed and the worker that won. Pairs naturally with cascade fingerprint (#2) and bundle trace (#6).

**Axis:** Agent scoring output visibility · Cascade path visibility

**Basis:** `direct:` `cascadeResult.heuristicResult` exists at process time; CP-2 stores final output; no UI shows whether LLM refined or overrode heuristic · `external:` LangSmith trajectory partial-credit scoring — compare steps not just final verdict

**Rationale:** Judges need to see *whether the LLM changed the grade* and *why* — the core narrative of tiered scoring. Depends on cascade metadata (#2) or bundle trace (#6) for data access.

**Downsides:** Only meaningful when LLM runs (~gray-band posts); empty state needed for heuristic-only path; benefits from #2/#6 shipping first.

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Structured Log-Only Mode (NDJSON) | Contradicts demo strategy (KTD1: side panel first); zero-UI path is brainstorm variant not product improvement |
| 2 | Score Diff Overlay on Timeline | Valid but U9 deferred; larger scope than side-panel grading observability |
| 3 | CP-2 Replay Lab | High demo value but high complexity; better as brainstorm follow-on to #3 |
| 4 | Grading Replay Scrubber | Overlaps #3+#7; demo-only affordance — brainstorm variant |
| 5 | Tool-Call Audit Strip | Depends on agent-tools plan not shipped; premature without CP-2 tool_calls |
| 6 | Embed full trace in every decision SSE | Payload bloat; #6 bundle trace API is cleaner compounding path |
| 7 | Grading Dashboard (decisions demoted) | Too disruptive to existing panel hierarchy for hackathon scope |
| 8 | FICO Disclosure Strip / Moderation Label Stack | Requires new multi-factor/label schema not in agent-output contract |
| 9 | Black Box Flight Recorder / OpenTelemetry | Plan 003 explicitly out of scope; OTel-adjacent |
| 10 | Triage Chief Complaint / Adverse Action Letter | Decorative prose layers; covered by #4 commit explainer |
| 11 | Auto-synthesized grading narrative string | Overlaps #3+#4; risks stale copy if rules change |
| 12 | Invert checkpoint SSE (fat failures only) | Partial value subsumed by #3 drill-down |
| 13 | Confidence–Score Divergence filter | Narrow UX affordance; subset of #1 confidence bar |
| 14 | Escalation Queue Resolution workflow | Overlaps held-queue brainstorm; observe-and-jump scope already defined |
| 15 | Truncation Diff (shown vs dropped) | Stopgap if #1 ships; redundant once full reasons exposed |

## Compounding Thread

Ship order suggestion: **#1 + #2** (fast SSE enrichments) → **#6** (read model) → **#3 + #4 + #7** (UI surfaces) → **#5** (session health). Ideas #1–#4 compose into a single expandable **Grading Story Row** per post.
