---
date: 2026-06-13
topic: ui-ux-improvement
focus: UI/UX + observability improvements (continued 2026-06-13)
mode: repo-grounded
---

# Ideation: UI/UX & Observability Improvements for Signal Density Filter

## Grounding Context

**Project:** Signal Density Filter — Chrome MV3 extension + local Node.js harness filtering X.com timelines. Vanilla HTML/CSS/JS. Operator console in Chrome side panel; timeline overlays via content scripts; HITL floating panel for held posts.

**Key pain points:**

* Split attention between timeline overlays and side panel

* BLOCK posts vanish from timeline; guardrails "why" only in panel

* HITL panel easy to miss under demo pressure

* No first-run / connection state when harness down

* Utilitarian operator UI — functional lists, minimal hierarchy

* Alt+Shift+R replay shortcut invisible to judges

**Leverage points:**

* Side panel as demo cockpit (stats, Filtered Posts, alarms, checkpoints)

* Decision-color token system (SHOW/HIDE/HOLD/BLOCK)

* Plan 004 enriched Filtered Posts payloads (author, snippet, full reason codes)

* Demo script mirrors 4 pillars order (Material → Guardrails → Checkpoints → Alarms)

**External context:**

* Blur > hide for trust (Slop Block, Bluesky)

* Bouncer: reason suggestions + filtered log

* Inline HITL beats sidebar queue for feed context

* SSE step events → pipeline stepper UI

**Observability continuation (2026-06-13):** Plans 003 and 004 shipped the baseline path — four SSE types, alarm REST hydrate, Filtered Posts, checkpoint ring buffer. Remaining gaps: checkpoint drill-down not wired in panel, held queue not hydrated on open, no connection/disconnect UI, no SSE reconnect backfill, alarms lack bundle correlation, demo checklist omits checkpoint/held SSE smoke tests.

## Topic Axes

1. Timeline feed overlays
2. Sidebar operator console
3. HITL review flow
4. Connection & session modes
5. Demo narration & trust

**Observability axes** (for ideas #8–14):

1. Harness pipeline & event contract
2. Side panel operator console
3. Demo reliability & rehearsal
4. Timeline↔panel linkage (see also #2)
5. HITL & escalation observability

## Ranked Ideas

### 1. Graduated Overlay Language

**Description:** Replace binary SHOW/HIDE/BLOCK rendering with a three-tier visual language on the timeline. SHOW posts stay full clarity. HOLD and low-confidence posts get progressive blur with an amber border. BLOCK posts collapse to slim tombstone rows showing decision color, author handle, and primary reason code — they stay in feed order instead of vanishing. Hover or long-press on any overlay reveals a museum-placard micro-card: title line, provenance ("Guardrail · Pre-agent"), and top reason codes.

**Axis:** Timeline feed overlays

**Basis:** `direct:` BLOCK posts vanish from timeline while guardrails "why" lives only in panel · `external:` Blur > hide for trust (Slop Block, Bluesky); museum placard provenance pattern · `reasoned:` one overlay mechanic serves all four decision types with graduated treatment

**Rationale:** Demo trust breaks when the feed looks "clean" but the panel says otherwise. Tombstones preserve feed rhythm while making suppression legible; blur ladder makes HOLD feel like "needs you" rather than broken filtering.

**Downsides:** Tombstone height vs. blur intensity needs tuning; X's virtualized feed may reflow on expand; conflicts with current `display:none` BLOCK contract (demo checklist AE3 expects panel-only BLOCK visibility).

**Confidence:** 82%

**Complexity:** Medium

**Status:** Unexplored

***

### 2. Feed↔Panel Bidirectional Sync

**Description:** Clicking a timeline badge sends a `highlight_bundle` message that scrolls the side panel's Filtered Posts list to the matching entry and applies a 2-second decision-color pulse. Clicking a Filtered Posts row scrolls X.com to the corresponding `article[data-sdf-bundle-id]` and flashes its overlay. Optional vertical minimap beside Filtered Posts shows colored ticks positioned by scrape order for spatial context.

**Axis:** Sidebar operator console

**Basis:** `direct:` split attention between timeline and panel is top pain point · `direct:` plan 004 enriched payloads enable author/snippet rows · `reasoned:` bidirectional linking turns two UIs into one mental model without merging surfaces

**Rationale:** Compounds enriched Filtered Posts into operability — operators answer "which post triggered that alarm?" without reverse-engineering timestamps in a flat list.

**Downsides:** Requires reliable bundleId→article mapping on X's dynamic DOM; scroll-jump on fast-scrolling feed may disorient; minimap needs scrape-order index from harness.

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

***

### 3. Post-Anchored HITL with Escalation Thread

**Description:** Replace the fixed-position floating HITL panel with a review card docked directly below the held post's DOM node — moves with scroll, shows agent reasons, confidence, and Show/Hide/Block buttons. When `escalation_queue_full` or held-count threshold fires, auto-scroll to center the held article, pulse amber border, and draw a visible thread: alarm banner in panel → linked post on timeline → HITL dock auto-opens. Queue depth shows as stack indicator ("2 more held above").

**Axis:** HITL review flow

**Basis:** `direct:` HITL panel easy to miss under demo pressure · `direct:` HITL queue UX tied to escalation alarms · `external:` inline HITL beats sidebar queue for feed context (Koder.ai, displaying.cloud)

**Rationale:** Borderline HOLD decisions are the narrative climax of the demo; spatial binding to the offending content makes human-in-the-loop feel part of feed governance, not a popup lost under browser chrome.

**Downsides:** DOM insertion risk on X infinite scroll; viewport-fixed fallback may still be needed; auto-scroll may interrupt operator's scroll demo.

**Confidence:** 80%

**Complexity:** Medium–High

**Status:** Unexplored

***

### 4. Inline Pipeline Stepper on Badge Click

**Description:** Clicking any timeline badge expands an inline accordion beneath the tweet showing a live pipeline stepper fed by SSE checkpoint events for that `bundle_id` — Material → Guardrails → Agent → Decision. Failed stages show reason codes; passed stages collapse to green ticks. Side panel checkpoint log remains for aggregate view; feed becomes primary explain surface during scroll.

**Axis:** Demo narration & trust

**Basis:** `external:` SSE step events → pipeline stepper UI (agent-dash, LangGraph) · `direct:` checkpoint drill-down today requires side panel click + fetch · `reasoned:` judges asking "how did it decide?" get answers without breaking scroll rhythm

**Rationale:** Makes governance explainable at point of curiosity — critical for the Checkpoints demo beat without splitting attention to the panel.

**Downsides:** Per-post accordion adds DOM weight; may duplicate side panel checkpoint section; needs per-bundle SSE event routing in content script.

**Confidence:** 75%

**Complexity:** Medium

**Status:** Unexplored

***

### 5. Harness Heartbeat & Offline Replay Boot

**Description:** Persistent strip at top of side panel showing connection state: Live (green pulse), Degraded (SSE stale > N sec), Offline (harness down). On extension load when harness unreachable, show full-panel connection stage with one-click "Start demo in replay" that creates session and loads `demo-v1` without terminal interaction. Auto-reconnect in background; on reconnect, hydrate from session APIs with "back online" toast. Optionally inject a slim health bar on x.com when panel hasn't been opened.

**Axis:** Connection & session modes

**Basis:** `direct:` no first-run / connection state when harness down · `direct:` demo checklist assumes harness running at minute 0:00 · `reasoned:` silent failure reads as "extension broken" to judges

**Rationale:** Hackathon demos fail silently when harness isn't running; visible mode prevents unexplained empty panel and enables one-click recovery.

**Downsides:** Offline replay may diverge from live demo story; health strip on x.com adds chrome; auto-boot replay needs careful session API wiring.

**Confidence:** 85%

**Complexity:** Medium

**Status:** Unexplored

***

### 6. Pillar Progress Rail

**Description:** Restructure side panel into four collapsible sections mirroring demo script pillar order (Material Handler → Guardrails → Checkpoints → Alarms). Sticky progress rail on left edge shows active pillar; SSE events auto-expand relevant section and dim others. Section headers include one-line narration hints. Manual "Next beat" button for rehearsal gaps.

**Axis:** Demo narration & trust

**Basis:** `direct:` demo script mirrors 4 pillars order · `direct:` utilitarian operator UI lacks hierarchy · `direct:` section hints already exist ("what was filtered and why")

**Rationale:** Console becomes demo teleprompter — structure compounds with existing stats/alarms/checkpoints instead of adding new features; reduces presenter cognitive load.

**Downsides:** Reordering panel IA may confuse non-demo use; auto-expand vs manual control needs tuning; may feel "training wheels" to some judges.

**Confidence:** 72%

**Complexity:** Low–Medium

**Status:** Unexplored

***

### 7. Mode-Change Audience Toast

**Description:** When operator hits Alt+Shift+R, inject a large centered toast on x.com (3 seconds, audience-visible) showing the shortcut chord, new mode (REPLAY / LIVE), and active tape ID. Side panel mode badge simultaneously animates flip transition. Toast includes "Press again to return to LIVE" hint. Makes replay fallback a narratable moment instead of hidden operator muscle memory.

**Axis:** Demo narration & trust

**Basis:** `direct:` Alt+Shift+R invisible to judges · `direct:` mode badge exists but is panel-only · `reasoned:` hackathon judges reward systems they can see working

**Rationale:** Replay mode is a demo superpower that currently happens off-screen; surfacing the chord and mode change builds trust that outcomes aren't manually faked.

**Downsides:** 3-second toast may interrupt scroll demo; audience-visible chrome on x.com may feel intrusive; needs toggle for rehearsal vs live demo.

**Confidence:** 70%

**Complexity:** Low

**Status:** Unexplored

***

## Observability Improvements (added 2026-06-13)

Ideas #8–14 close harness/extension observability gaps left after plans 003/004. They complement #2–#7 (linkage, heartbeat, pillar rail) without duplicating them.

### 8. Checkpoint Bundle Trace on Click

**Description:** Wire checkpoint rows in the side panel to `GET /sessions/:id/checkpoints/:bundleId`. Clicking a row expands an inline accordion of CP-0 through CP-5 with pass/fail status and reason codes — the Checkpoints demo beat without curl or a separate tool.

**Axis:** Side panel operator console

**Basis:** `direct:` observability plan U4/R10 specifies click-to-drill-down; `sidebar.js` prepends flat rows with no click handler · `direct:` REST endpoint already exists and is authoritative per bundle

**Rationale:** Highest gap vs written acceptance criteria — operators see scrolling stage codes but cannot show the gate chain judges expect.

**Downsides:** Fast replay may produce many expandable rows; optional bundle-group collapse is follow-on polish.

**Confidence:** 88%

**Complexity:** Low

**Status:** Unexplored

***

### 9. SQLite-Backed SSE Cursor & Reconnect Backfill

**Description:** Persist published events with monotonic sequence numbers; expose `GET /events?since=<seq>` (or `Last-Event-ID`). Service worker stores cursor in `chrome.storage.local` and replays missed rows after reconnect before resuming live EventSource — with exponential backoff replacing the current 2s retry.

**Axis:** Harness pipeline & event contract

**Basis:** `direct:` observability plan deferred "SSE reconnect with exponential backoff and missed-event replay from SQLite" · `direct:` alarms and Filtered Posts hydrate on panel open but mid-session disconnect loses forward-only events · `external:` Vaadin 4-state connection + cursor tail is standard SSE recovery pattern

**Rationale:** Largest reliability hole in the observability stack; every surface (panel, future feed stepper) inherits one catch-up path.

**Downsides:** Requires harness schema/work for event log; must dedupe with hydrate-on-open to avoid duplicate rows.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

***

### 10. Held Queue Sidebar Hydration

**Description:** Add a **Held for Review** section to the side panel. On open, fetch `GET /hitl/:sessionId/held`; on SSE `held_count`, refresh badge and queue. Rows match Filtered Posts shape (author, snippet, agent reasons). Complements the floating HITL panel — observability cockpit shows the queue without hunting page chrome.

**Axis:** HITL & escalation observability

**Basis:** `direct:` observability plan R11; `service-worker.js` implements `fetchHeld` but sidebar never calls it · `direct:` demo HITL beat requires visible agent reasons on held posts

**Rationale:** Badge-only held count does not answer *what* is waiting; escalation alarms lack evidence without the queue visible.

**Downsides:** Duplicates floating HITL UI unless roles are split (panel = observe, page = resolve).

**Confidence:** 86%

**Complexity:** Low–Medium

**Status:** Explored

***

**Description:** Extend alarm SSE (and REST) with `triggering_bundle_ids[]` and window stats for `high_block_rate`, `confidence_collapse`, and `escalation_queue_full`. Alarm rows link to Filtered Posts rows and optional bundle trace drill-down.

**Axis:** Side panel operator console

**Basis:** `direct:` alarms show message + recommended_action but not which posts caused them · `direct:` UI ideation #2 needs bundle anchors for feed↔panel sync · `reasoned:` AlarmManager already computes rolling windows — correlation is exposing existing state

**Rationale:** Turns Alarms pillar from orphan banners into entry points for investigation; pairs naturally with #2 and #8.

**Downsides:** Payload size on large windows; UI must cap inline bundle list with "show all in Filtered Posts."

**Confidence:** 83%

**Complexity:** Medium

**Status:** Unexplored

***

### 12. Rolling-Window Threshold Gauges

**Description:** Surface live gauges for the same rolling windows that fire alarms — e.g. "16/20 blocked (80% threshold)", "5/10 low-confidence scores" — updated on each decision or checkpoint. Threshold line visible before alarm fires.

**Axis:** Side panel operator console

**Basis:** `direct:` thresholds are constants in `alarms.js`; alarm metadata includes `blockRate`/`windowSize` but UI shows message only after fire · `reasoned:` judges ask "why did that alarm fire?" — the window math is the answer

**Rationale:** Reframes alarms from mysterious failures to visible policy instrumentation; cheap harness publish extension.

**Downsides:** Adds panel chrome; may distract during non-alarm beats unless collapsible.

**Confidence:** 79%

**Complexity:** Low–Medium

**Status:** Unexplored

***

### 13. Bundle Trace Aggregate API

**Description:** Single endpoint `GET /sessions/:sessionId/traces/:bundleId` returning normalized bundle, all checkpoint runs, final decision, related alarms, and held/HITL state — assembled from existing store queries. Powers checkpoint drill-down (#8), Filtered Posts expand, alarm investigation, and future inline stepper (#4).

**Axis:** Harness pipeline & event contract

**Basis:** `direct:` plan 004 deferred Filtered Posts row → checkpoint trace; today requires multiple round-trips · `reasoned:` one read model compounds every "explain this post" surface

**Rationale:** Leverage play — add UI surfaces without new SQL per feature.

**Downsides:** Response size for noisy bundles; caching not needed for demo scale.

**Confidence:** 81%

**Complexity:** Medium

**Status:** Unexplored

***

### 14. Observability Contract Gate in CI

**Description:** JSON Schema + snapshot tests for all four SSE event types and REST hydrate counterparts (`decisions`, `alarms`, checkpoint runs). Fail CI when publish sites drift from `shared/schemas/*`. Add integration test: `replayTape('demo-v1')` with eventBus asserts at least one alarm + checkpoint + decision ordering.

**Axis:** Demo reliability & rehearsal

**Basis:** `direct:` plan 004 introduced `publishDecision` to prevent SSE/REST drift · `direct:` demo checklist harness smoke omits `checkpoint` and `held_count` SSE types · `reasoned:` demo trust breaks silently when panel renders empty fields mid-rehearsal

**Rationale:** Locks demo beats in CI; every future observability field gets a regression net.

**Downsides:** Snapshot churn when enriching payloads; must scope snapshots to stable fields.

**Confidence:** 87%

**Complexity:** Low

**Status:** Unexplored

***

## Rejection Summary

| #  | Idea                                              | Reason Rejected                                      |
| :- | :------------------------------------------------ | :--------------------------------------------------- |
| 1  | Single-Surface Cockpit (timeline-attached drawer) | X DOM breakage risk too high vs Side Panel API       |
| 2  | Remove Filtered Posts entirely (feed-only tray)   | Conflicts with plan 004 and AE3 guardrails demo beat |
| 3  | Squawk/transponder HUD metaphor                   | Too insider for hackathon judges                     |
| 4  | Voice-over captions from SSE                      | 10x-budget fantasy, not hackathon scope              |
| 5  | Signal Spotlight (dim entire feed 40%)            | High visual disruption; censorship optics            |
| 6  | Ghost/tombstone variants (6 duplicates)           | Merged into #1 Graduated Overlay Language            |
| 7  | Duplicate teleprompters (4 variants)              | Merged into #6 Pillar Progress Rail                  |
| 8  | Context-collapsing console                        | Loses observability outside demo mode                |
| 9  | Connection liveness strip (duplicate)             | Merged into #5 Harness Heartbeat & Offline Replay Boot |
| 10 | Feed↔panel bundle highlight (duplicate)           | Merged into #2 Feed↔Panel Bidirectional Sync         |
| 11 | Pillar-ordered / auto-expand sections (duplicate) | Merged into #6 Pillar Progress Rail                  |
| 12 | Inline timeline stepper (duplicate)               | Already #4 Inline Pipeline Stepper on Badge Click    |
| 13 | Escalation thread HITL (duplicate)                | Already #3 Post-Anchored HITL with Escalation Thread |
| 14 | Remove Recent Decisions feed                      | Conflicts with plan 004 KTD5; breaks volume observability rehearsal |
| 15 | Full OpenTelemetry trace per bundle               | Explicitly out of scope in plan 003; 10× budget flip |
| 16 | Lakera Watch/Block toggle on timeline             | Conflicts with AE3 BLOCK contract unless demo checklist updated |
| 17 | Unified governance ledger (single feed)           | Large IA refactor; weaker than targeted linkage (#2, #11) |
| 18 | Pre-computed observability tapes                  | Honest `[REPLAY]` label helps but risks decoupling from live pipeline |
| 19 | Aggregate-only telemetry at 1M users              | Valid scale stress-test but outside hackathon demo scope |
| 20 | Negative-space / skipped-stage events             | Interesting governance story; scope creep for current sprint |
| -  | axis: Timeline↔panel linkage                      | Covered by existing #2; no new survivor beyond linkage payloads (#11) |
