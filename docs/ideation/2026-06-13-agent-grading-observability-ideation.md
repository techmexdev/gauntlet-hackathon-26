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

**External context:** Langfuse/LangSmith trajectory scoring; LangGraph checkpoint gates; AgentTrace progressive disclosure; moderation cascades with structured rationale; CI/CD gate-status badges; airport-security lane replay analogies; shadow-mode rollout (llmtrace, Claude Lab); ECE calibration; exception-first audit; FIM One stub-first disclosure; Witness trace diff.

**Continuation note (2026-06-13):** Second ideation pass — 7 new survivors (#8–#14) below. Prior #1–#7 unchanged.

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

**Status:** Explored → `docs/brainstorms/2026-06-13-grading-story-row-requirements.md`

---

### 2. Cascade Path on Every Decision

**Description:** Enrich decision SSE (via `publishDecision()` or sibling `publishCascade()`) with a `cascade_meta` block: `heuristic_score`, `llm_invoked`, `gray_band`, `llm_fallback`, `disagreement_delta`, `latency_ms`, `final_worker`. Render a compact fingerprint chip on each row — `H` (heuristic-only), `H→L` (LLM invoked), `H→L Δ19` (disagreement) — plus optional gray-band receipt explaining the branch taken (`in_gray_band`, `escalate`, `forceLlm`).

**Axis:** Cascade path visibility

**Basis:** `direct:` `runCascade()` returns full metadata; `processor.js` holds `cascadeResult` through commit but none reaches SSE · `external:` GenAI cascade routing patterns recommend logging every routing decision and escalation reason

**Rationale:** The tiered cascade is the product's core grading story, but operators cannot answer "did the LLM even run?" without server logs. Makes the heuristic→LLM design legible during demo.

**Downsides:** Requires threading cascade metadata into publish path; gray-band receipt copy needs maintenance if cascade rules change.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Explored → `docs/brainstorms/2026-06-13-grading-story-row-requirements.md`

---

### 3. Per-Bundle Grading Trace (Checkpoint Flight Recorder)

**Description:** Wire checkpoint log rows and Filtered Posts rows to `GET /sessions/:sessionId/checkpoints/:bundleId`. Render inline CP-0→CP-5 accordion: pass/fail per gate, reason codes on failure, CP-2 expand showing full `agentOutput` JSON already stored in SQLite. Failed stages highlight where pipeline stopped; links to final decision action.

**Axis:** Checkpoint gate narrative

**Basis:** `direct:` REST endpoint exists in `sessions.js`; CP-2 payload stores `{ agentOutput }`; sidebar checkpoint handler only prepends flat stage/status/bundle_id rows · `direct:` observability plan U4 specified click-to-drill-down — not implemented

**Rationale:** Checkpoints are the trust layer; disconnected log lines cannot tell one post's journey. REST authority already exists — this is primarily UI wiring.

**Downsides:** Per-row fetch on expand (mitigated by bundle trace API #6); must handle partial traces when pipeline fails early.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Explored → `docs/brainstorms/2026-06-13-grading-story-row-requirements.md`

---

### 4. Harness Commit Explainer

**Description:** Publish a structured `commit_rationale` alongside each decision: which `commitDecision()` branch fired (`SCORE_ABOVE_THRESHOLD`, `LOW_CONFIDENCE_HIGH_REACH`, `AGENT_ESCALATION`, guardrail BLOCK), inputs used (`show_threshold: 40`, `likes`, `confidence`, `guardrail_passed`), and harness `reasonCodes` displayed separately from agent `reasons[]`. Dual-column card optional: left = agent grading, right = harness policy outcome.

**Axis:** Decision/commit rationale

**Basis:** `direct:` `commitDecision()` encodes distinct branches with compound rules (high-reach + low-confidence HOLD) invisible in UI · `direct:` architecture KTD: "agent scores; harness decides" — UI conflates them today · `external:` credit adverse-action and policy-cited moderation rationale patterns

**Rationale:** A HOLD looks like "the agent wanted it" when harness policy triggered `LOW_CONFIDENCE_HIGH_REACH`. Separating agent judgment from harness policy is essential for governed-scoring credibility.

**Downsides:** More fields in decision schema; demo copy must explain threshold constants clearly.

**Confidence:** 87%

**Complexity:** Medium

**Status:** Explored → `docs/brainstorms/2026-06-13-grading-story-row-requirements.md`

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

### 8. Shadow Grade Whispers

**Description:** For heuristic-only commits, optionally run a non-blocking **shadow scorer** (LLM or alternate heuristic profile) that never affects CP-5. Store shadow output in SQLite keyed by `bundle_id`; surface on expand as a ghost card: `committed: H:47 SHOW` vs `shadow: L:58 would-HIDE`. Sample rate configurable or on-demand for gray-band near-misses.

**Axis:** Agent scoring output visibility · Cascade path visibility

**Basis:** `external:` shadow grading / champion–challenger moderation (llmtrace, Claude Lab shadow mode) · `direct:` `runCascade()` branches but only one path commits; CP-2 stores one `agentOutput`

**Rationale:** Operators see grading uncertainty the cascade *avoided*, not just the path taken. Demo beat: "We didn't call the LLM — but here's what it would have said." Distinct from cascade fingerprint (#2), which labels the path taken only.

**Downsides:** Extra LLM cost if sampled aggressively; must clearly label shadow as non-enforcing; heuristic-only path needs empty-state copy.

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

---

### 9. Human Oversight as First-Class SSE Events

**Description:** When an operator resolves a held post (`sdf:resolve-held` → harness), emit a new **`oversight`** SSE type: `{ bundle_id, actor: 'operator', prior: HOLD, resolution: SHOW|HIDE, dwell_ms, optional_note }`. Side panel logs oversight beside agent decisions; optional brief glyph on timeline overlay during HITL beat.

**Axis:** Decision/commit rationale · Anomaly & grading health

**Basis:** `direct:` held resolution exists in overlay flow but isn't in the four SSE types (`decision`, `alarm`, `checkpoint`, `held_count`) · `external:` EU AI Act / HITL audit patterns — human corrections as distinct telemetry

**Rationale:** The harness decides; humans correct. Without oversight events, HOLD→SHOW looks like the agent changed its mind. Closes the HITL demo beat (~4:00) with stream-visible proof of human-in-the-loop.

**Downsides:** New SSE type + schema; must sync with held-queue REST hydration; optional note field needs UX for quick resolve vs annotated resolve.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

---

### 10. Policy Regime Stamp Row

**Description:** At commit time, stamp each decision with immutable **policy fingerprints**: `guardrails_yaml_hash`, `cascade_rules_version`, `show_threshold`, `gray_band` bounds. Render a tiny `policy@v2.1` chip on every row; mixed stamps in one session flag "rule change mid-flight" during replay or config edits.

**Axis:** Decision/commit rationale

**Basis:** `direct:` `commitDecision()` uses threshold 40 and `cascade.js` band rules with no provenance in SSE · `external:` policy version stamps / adverse-action "model card at decision time"

**Rationale:** "Why did this flip?" is often "rules changed," not "agent changed." Separates grading drift from policy drift — complements commit explainer (#4) with *which policy* was active, not just *which branch* fired.

**Downsides:** Hash computation at startup/config reload; chip UI noise if policy never changes mid-session; must document hash algorithm for reproducibility.

**Confidence:** 85%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 11. Trace Projection Depths (`summary` | `grading` | `full`)

**Description:** One `getBundleTrace()` assembler; REST accepts `?depth=` and returns layered projections — row chips need `summary` (score, worker, cascade fingerprint), expand needs `grading` (+ reasons, commit branch, heuristic pre-score), forensics need `full` (+ raw CP-2 payload). Same route, same store query, three response shapes.

**Axis:** Checkpoint gate narrative (compounding)

**Basis:** `direct:` plan 006 trace object aggregates bundle, checkpoints, decision, alarms, held; plan 004 publish-helper anti-drift pattern; deferred Filtered Posts / alarm / held expand all need same bundle story at different detail levels

**Rationale:** Highest-leverage extension to bundle trace API (#6). Every new "explain this post" surface picks a depth instead of a new endpoint. One assembler → checkpoint accordion, Filtered expand, alarm drawer, held forensics, timeline tooltip.

**Downsides:** Response-shape versioning; route must validate depth param; assembler complexity grows with each new field in disclosure manifest.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

---

### 12. Trace Digest Watermark on Every Row

**Description:** Every decision SSE carries a ~40-byte **`trace_digest`**: `{ stages_passed, failed_at, llm_invoked, disagreement_delta, anomaly_flags[] }`. Full CP-0..CP-5 body fetched on expand via trace API (#6). Digest renders as always-visible 6-dot micro-rail on every Recent Decisions / Filtered Posts row — universal *index*, not universal *payload*.

**Axis:** Checkpoint gate narrative · Cascade path visibility

**Basis:** `reasoned:` rejected "embed full trace in every decision SSE" for bloat; plan 006 trace API is on-demand body · `external:` FIM One stub-first progressive disclosure

**Rationale:** Operator always sees "did this post complete all gates?" at a glance; expand cost paid only when investigating. Compounds with cascade fingerprint (#2) and trace depths (#11) without repeating either.

**Downsides:** Digest schema must stay stable; 6-dot UI needs legend; digest can drift from trace API if not generated from same assembler.

**Confidence:** 87%

**Complexity:** Medium

**Status:** Unexplored

---

### 13. In-Feed Ghost Receipt Trace

**Description:** When overlay hides a post (HIDE/BLOCK), the collapsed ghost on the X timeline shows a **receipt strip** — score, worker chip, top reason, CP-fail icon. Click ghost → inline trace accordion (CP gate summary + agent rationale) via `fetch_trace`, without opening the side panel.

**Axis:** Decision/commit rationale · Agent scoring output visibility

**Basis:** `direct:` plan 004 hidden-posts observability is sidebar-only; overlay removes DOM nodes — operator looks at ghost when content vanishes · `direct:` `commitDecision()` truncates reasons to 2 for SHOW/HIDE

**Rationale:** Answers "why did that tweet disappear?" at the moment of disappearance — strongest demo beat for governed filtering. Breaks assumption that observability = side panel only.

**Downsides:** Content-script complexity; inline accordion must not break X layout; shares fetch path with plan 006; ghost may be easy to miss without visual polish.

**Confidence:** 84%

**Complexity:** Medium–High

**Status:** Unexplored

---

### 14. Strictness Regime Dial + Session Receipt

**Description:** Session-level **strictness knob** (Rehearsal / Demo / Strict) widens or narrows gray band and optional `forceLlm` rules. One `regime_change` event on toggle; every decision carries `regime_id`. Sidebar vitals: "14 posts scored under Strict since 2:04pm" and LLM invocation rate shift after toggle.

**Axis:** Cascade path visibility · Anomaly & grading health

**Basis:** `direct:` cascade thresholds are env-static today; no UI for "how aggressive is routing?" · `external:` FlexGuard strictness-adaptive thresholds; strictness regime dial patterns

**Rationale:** "Did the LLM run?" depends on regime. Dial makes the cascade legible as a *live policy choice*, not hidden code — demo narrators can tighten mid-session and show observability respond.

**Downsides:** Regime definitions must stay in sync with `cascade.js`; mid-session toggle complicates policy stamp (#10); risk of operator confusion if not labeled clearly.

**Confidence:** 82%

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
| 16 | Shadow Would-Block Ledger (session counters) | Overlaps #14 regime + #5 vitals; weaker than per-bundle shadow (#8) |
| 17 | Escalation Funnel SLO strip | Subsumed by #5 grading health + #14 regime receipt |
| 18 | Agent vs Harness Provenance Split (two lanes) | Overlaps #4 commit explainer + #7 diff panel |
| 19 | Stub-First Checkpoint Drill-Down | Overlaps #3 per-bundle trace + plan 006 accordion |
| 20 | Exception-First Alarm Queue | Overlaps #5 alarm-bundle correlation + #6 trace |
| 21 | Trace Diff Compare (counterfactual pair) | Overlaps #7 heuristic↔LLM diff; full replay lab rejected |
| 22 | Gray-Band ECE Drift Widget | Overlaps #5 session vitals + #14 regime; narrow statistical UX |
| 23 | Exceptions-Only Side Panel | Disrupts rehearsed demo beats (Recent Decisions, Filtered Posts) |
| 24 | Silent Success Checkpoints | Undermines Checkpoints demo beat (~2:30) — gates must be visible |
| 25 | Auto-Commit Receipt (one-line) | Lighter #4 variant — brainstorm copy, not structured explainer |
| 26 | Self-Promoting Anomaly Bundles | Partial overlap #5; spotlight strip is UX polish on existing rows |
| 27 | Threshold Distance Badge | Tactical subset of #4; better as render detail inside commit explainer |
| 28 | Grading Pulse Digest | Session aggregate overlaps #5 vitals strip |
| 29 | Split Agent vs Harness Columns | Layout variant of #4; not additive product surface |
| 30 | Prefetch-on-Anomaly Hover Cards | Implementation pattern for #6+#11; not standalone idea |
| 31 | Exception-First Audit Inbox | Overlaps #23 + #5; empty-inbox narrative conflicts with checkpoint demo |
| 32 | Session Calibration Strip (ECE-lite) | Overlaps #5; requires held-resolution ground truth not yet reliable |
| 33 | Trace Stub Glyphs on timeline | Merged into #12 digest watermark + #13 ghost receipt |
| 34 | commit_branch_id Enum alone | Compounds with #4 — ship as part of commit explainer, not separate |
| 35 | SW Trace Cache / renderTraceSlice | Implementation details for plan 006 consumers |
| 36 | Grading Disclosure Manifest | CI/meta artifact; low demo-visible value for hackathon |
| 37 | activity_spans[] on trace | Compounds with #11; defer to trace API schema design |
| 38 | anchor_bundle_id on alarms | Narrower slice of #5 alarm provenance |
| 39 | Background Trace Prefetch | Implementation optimization for #11+#12 |
| 40 | Shadow Lane Receipt (path-not-taken) | Zero-cost variant of #8; ship as empty-state inside shadow whispers |
| 41 | Checkpoint Glyph Strip | Lighter #12 digest; subsumed by digest watermark on rows |
| 42 | Material Factor Stack | Heuristic signed-deltas only; LLM reasons unquantified — narrow |
| 43 | Live vs Replay Trace Diff | High value but demo-adjacent; brainstorm follow-on to #6 |
| 44 | Oversight Freeze Capsule | Subsumed by #5 + #6 trace alarms[] |
| 45 | Rule Match Receipt | Good complement to #4; defer to commit explainer field set |
| 46 | Triage Tag vs Chart layers | UI pattern inside #1 rationale surface |
| 47 | In-Feed CP Gate Rail (all posts) | Overlaps #13; all-post rail is noisier than ghost-on-hide |
| 48 | REST Pull Grading Journal | Architectural pivot from SSE; out of scope for side-panel-first strategy |
| 49 | Silent Until Exception panel mode | Overlaps #23; conflicts with demo rehearsal |
| 50 | Sampled Trace Spotlight | Scale story; hackathon volume doesn't justify |
| 51 | Agent Operator Note (LLM prose) | Requires worker contract change; risks stale/hallucinated narration |
| 52 | Alarm-Triggered Trace Burst | Event shape variant of #5 + #6; not separate surface |
| 53 | Counterfactual Replay Slots | Valid but high scope; brainstorm follow-on to #6 after trace ships |

## Compounding Thread

Ship order suggestion: **#1 + #2** (fast SSE enrichments) → **#6** (read model) → **#3 + #4 + #7** (UI surfaces) → **#5** (session health). Ideas #1–#4 compose into a single expandable **Grading Story Row** per post.

**Continuation thread:** **#11 + #12** (digest + depth on trace API) → **#8** (shadow grading) + **#10** (policy stamp) → **#9** (HITL oversight events) → **#13** (timeline ghost receipt) → **#14** (regime dial for live demo control). #9 pairs with held-queue plan 005; #13 breaks sidebar-only observability assumption.
