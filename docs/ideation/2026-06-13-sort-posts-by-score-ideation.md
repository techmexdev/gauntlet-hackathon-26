---
date: 2026-06-13
topic: sort-posts-by-score
focus: sorting posts by score
mode: repo-grounded
---

# Ideation: Sort Posts by Signal Score

## Grounding Context

**Project:** Signal Density Filter — Chrome MV3 extension + Node.js harness filtering X.com timelines. Vanilla JS/CSS; SQLite store; SSE observability.

**Current state:** `signal_score` (0–100) exists on decisions, held posts, SSE payloads, and all three UI surfaces (overlay badges, sidebar lists, filter-ui drawer). **No surface sorts by score today** — every list uses time (`decidedAt` / `createdAt`). Harness `getDecisionsBySession` hardcodes `ORDER BY decided_at ASC`; no `sort` query param on `GET /sessions/:id/decisions`. Timeline stays in X native order.

**Pain points:** Score is display-only metadata; operators triaging HOLD see arrival order not borderline-first order; BLOCK rows often lack `signal_score`; duplicate client `.sort()` in sidebar vs filter-ui; timeline DOM reorder fights X virtualization.

**External context:** Moderation queues sort by boundary proximity not raw score; Reddit/Meta use named sort modes (Hot/New/Top); deterministic tie-breakers required; Feed Cleaner uses threshold slider for calibration (presentation, not queue order).

**Past learnings:** No `docs/solutions/` entries yet.

## Topic Axes

1. Surface coverage — which UI lists get sort controls
2. Sort semantics — what "by score" means (raw, boundary-proximity, composite)
3. Data path — server API sort vs client-side vs SSE live reorder
4. Operator workflow — how sorting helps demo/review triage
5. Edge cases — null scores, BLOCK without score, tie-breaking, stability

## Ranked Ideas

### 1. Tri-Mode Sort Toggle (Top / Shoreline / Fresh)

**Description:** Add a single sort control in the sidebar cockpit (and mirror in filter-ui drawer headers) with three named modes: **Top** — `signal_score` descending (highest signal first); **Shoreline** — `|signal_score − 40|` ascending (closest to SHOW/HIDE threshold first, best for HOLD triage); **Fresh** — `created_at` / `decided_at` descending (current behavior). Mode persists in `chrome.storage.local` and re-renders held, hidden, blocked, and filtered lists through one shared `applySort(rows, mode)` helper.

**Axis:** Surface coverage + Sort semantics

**Basis:** `direct:` All lists today sort by time only (`sidebar.js` L98, L220–226; `filter-ui.js` L224–226) · `external:` Reddit Hot/New/Top and moderation boundary-first queues · `reasoned:` One control compounds across four lists without four bespoke toggles

**Rationale:** Directly answers "sort by score" while giving operators the borderline-first ordering moderation tools use for HOLD — without forcing one global semantics that fails on audit vs triage tasks.

**Downsides:** Global mode may confuse operators who want the live decision feed chronological while held queue is score-sorted; may need per-list override (see idea #3).

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 2. Harness-Authoritative Score Sort API

**Description:** Extend `getDecisionsBySession` and `getHeldPosts` in `harness/db/store.js` with `{ sortBy: 'decided_at' | 'signal_score' | 'boundary_proximity', direction, nulls: 'last' }`. Expose on `GET /sessions/:id/decisions?sort=signal_score:desc,decided_at:desc` and held endpoints. Extension becomes a thin renderer — remove duplicated client `.sort()` and hydrate pre-ordered rows.

**Axis:** Data path

**Basis:** `direct:` Store hardcodes `ORDER BY decided_at ASC`; routes expose no sort param; plan KTD5 intent is server-side policy · `direct:` Client re-sorts inconsistently (held DESC vs decisions ASC)

**Rationale:** Foundational — every sort UI, replay tape, and future bundle-trace view shares one SQL contract. Prevents sidebar vs drawer drift during demo.

**Downsides:** Requires harness + extension changes together; `boundary_proximity` needs documented threshold constant (40 from cascade).

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 3. Per-Surface Asymmetric Sort Defaults

**Description:** Instead of one global default, ship opinionated defaults per list: **Held** → Shoreline (boundary proximity); **Hidden (HIDE)** → Top (score desc, spot strongest hidden signal); **Blocked** → Fresh (time desc, because scores often null); **Recent decisions feed** → always Fresh (live narrative). Operator overrides persist per surface in storage. Tri-mode toggle sets all surfaces together; advanced users can decouple.

**Axis:** Surface coverage + Operator workflow

**Basis:** `direct:` BLOCK rows often lack `signal_score`; HIDE and HOLD answer different operator questions · `reasoned:` One sort direction across heterogeneous decision types misleads (guardrail BLOCK vs agent HIDE)

**Rationale:** "Sort by score" means different things on held vs hidden vs blocked lists; asymmetric defaults match how operators actually use each surface during the demo script.

**Downsides:** More configuration surface; risk of "why is held different from hidden?" confusion without good copy.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### 4. Null-Score Safe Partition

**Description:** When any view sorts by score, use SQL `ORDER BY signal_score IS NULL, signal_score DESC, decided_at DESC` (or explicit client partition): **scored rows first** by chosen semantics, **unscored rows last** sorted by time then reason-code tier. Never treat `null` as `0` or `100`. Display optional "Unscored" sub-header for BLOCK/guardrail rows.

**Axis:** Edge cases

**Basis:** `direct:` BLOCK paths set `signalScore: null`; UI renders `'—'`; naive numeric sort silently misorders guardrail rejections

**Rationale:** Required companion to any score sort — without it, operators lose trust in the sort control the first time a guardrail BLOCK jumps to the wrong end.

**Downsides:** Slightly more visual complexity; "NULL-first" alternative was rejected as it hides score-sorted narrative.

**Confidence:** 92%

**Complexity:** Low

**Status:** Unexplored

### 5. Sidebar-First Ranked Lists (No Timeline Reorder)

**Description:** Deliver score-based ordering in sidebar held/hidden/blocked lists and filter-ui drawer only — **do not** reorder X timeline DOM. Click-to-jump (`open_held_review`, scroll-to-post) remains the bridge to feed context. Explicit product choice: panel is the score-sorted canonical view; timeline stays chronological for scroll stability.

**Axis:** Surface coverage

**Basis:** `direct:` Timeline reorder flagged as hard (X virtual scroll); held sidebar already supports jump-to-review without feed reorder · `external:` Moderation tools use queue panels, not feed reorder

**Rationale:** Lowest-risk path to "sort posts by score" that ships in a hackathon window; avoids fragile content-script DOM surgery while still changing operator triage order.

**Downsides:** Does not improve the live-scroll "signal density" moment on the timeline itself; judges watching only the feed may not see score order.

**Confidence:** 86%

**Complexity:** Low (when paired with API sort + toggle)

**Status:** Unexplored

### 6. Demo Triage Lens Preset

**Description:** One-click operator preset in sidebar header: switches held + hidden to **Shoreline**, auto-expands held section, optionally pins sort for session. Named "Triage" for the HITL demo beat (~4:00 in demo script) so presenters don't hunt borderline posts in time order mid-narration.

**Axis:** Operator workflow

**Basis:** `direct:` Held queue requirements link escalation alarms to HITL beat; operators can't see which posts need review without timeline hunting · `direct:` Held sorts by `createdAt` only today

**Rationale:** Turns sort from a passive feature into a rehearsed demo move — high leverage for hackathon judges without requiring operators to discover the toggle.

**Downsides:** Demo-only affordance may feel bolted-on if not styled as a first-class mode; overlaps with tri-mode Shoreline default on held.

**Confidence:** 80%

**Complexity:** Low

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Timeline DOM reorder by score | Too expensive vs X virtual scroll |
| 2 | Fifth Pillar Ranking Handler | Scope overrun for sort feature |
| 3 | Cluster-primary sort | Missing cluster resolution semantics |
| 4 | Threshold slider as sort pivot | Blurs sort vs harness policy |
| 5 | SortDescriptor JSON schema | Over-engineering for current scope |
| 6 | SQLite composite index | Premature optimization |
| 7 | Borda multi-voter merge sort | Over-engineered |
| 8 | SSE live reorder | High complexity; hydrate sort sufficient for v1 |
| 9 | Score heat lane | Overlaps separate UI/UX ideation |
| 10 | Ordinal rank badges only | Weaker than list reorder |
| 11 | Review-next carousel | Workflow fork; tri-mode covers most cases |
| 12 | SHOW feed score reorder | Scope expansion beyond immediate ask |
| 13 | Score bands UI | Variant of tri-mode with extra complexity |
| 14 | Auto-sort on escalation alarm | Magic behavior; preset is clearer |
