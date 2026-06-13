---
title: Held Queue Sidebar Hydration
date: 2026-06-13
status: active
origin: docs/ideation/2026-06-13-ui-ux-improvement-ideation.md (#10)
---

# Held Queue Sidebar Hydration

## Summary

Add a **Held for Review** section to the Chrome side panel that hydrates pending HOLD posts on open and stays in sync via SSE `held_count`. Rows show post context and agent rationale; clicking a row jumps to the held post on the timeline and opens the existing floating review card. Resolve actions stay on the timeline HITL panel — the sidebar is observe-and-navigate, not a second resolve surface.

## Problem Frame

The side panel shows a held-count badge that updates in real time, but operators cannot see *which* posts are waiting or *why* without finding the floating HITL panel on the page. During the demo HITL beat, escalation alarms fire without visible queue evidence in the observability cockpit. Plan 003 promised held-post list visibility in the panel; the service worker already exposes `fetch_held`, but the sidebar never consumes it.

---

## Key Decisions

- **K1: Observe-and-jump, not resolve-in-panel.** The sidebar lists held posts and navigates to the timeline review card on row click. Show/Hide/Block buttons remain on the floating HITL panel only. Avoids two resolve surfaces and preserves feed-context review.
- **K2: Section always present, collapsed when empty.** Header reads "Held for review (N)" with N from held count. Collapsed body when N = 0; operator can expand manually anytime.
- **K3: Row shape matches Filtered Posts plus agent metadata.** Each row includes `@author`, text snippet, full reason codes, **confidence score**, and **worker** (heuristic/llm). Requires enriching held REST (bundle join) if author/snippet are not already present.
- **K4: Escalation alarm auto-expands Held section.** When `escalation_queue_full` SSE arrives, expand the Held section and pulse its header — links the Alarms beat (~3:30) to the HITL beat (~4:00) without new alarm types.

---

## Actors

- **A1. Operator (presenter)** — reads held queue in side panel during demo; clicks row to jump to post on timeline.
- **A2. Side panel UI** — hydrates queue on open, appends/refreshes on SSE, handles row click navigation.
- **A3. Floating HITL panel (timeline)** — receives focus when operator clicks a sidebar row; remains sole resolve surface.
- **A4. Harness** — serves `GET /hitl/:sessionId/held` with enriched post fields; emits `held_count` after HOLD and resolve.

---

## Requirements

### Side panel — Held for Review section

- **R1.** Side panel includes a collapsible **Held for Review** section with header showing pending count.
- **R2.** Section is always visible in the panel chrome; body collapsed when count is 0, expandable by operator.
- **R3.** On panel load, sidebar fetches held queue via service worker (`fetch_held`) and renders pending rows.
- **R4.** On SSE `held_count`, update header count and refresh queue contents (re-fetch or merge by `bundle_id`).
- **R5.** Each row displays: `@author_handle`, text snippet (≤120 chars), agent reason codes, signal score, worker name, and HOLD action badge.
- **R6.** Rows sort newest first; cap at 20 pending rows with overflow note if more exist.
- **R7.** Clicking a row sends `highlight_bundle` (or equivalent) to content script: scroll to `article[data-sdf-bundle-id]`, flash overlay, and open floating review card for that post.
- **R8.** Resolve in sidebar is out of scope — no Show/Hide/Block buttons in Held section.

### Escalation alarm linkage

- **R9.** When SSE `alarm` type is `escalation_queue_full`, auto-expand Held section and apply visible pulse on section header (same family as held-count stat pulse).

### Harness REST enrichment

- **R10.** `GET /hitl/:sessionId/held` returns enriched rows: existing held fields plus `authorHandle`, `textSnippet` from joined bundle `normalized_json`, and `worker` from the HOLD decision when available.
- **R11.** Response shape is stable for live ingest and tape replay (same fields, same ordering: `created_at` desc).

### Demo reliability

- **R12.** Replay mode populates Held section identically to live ingest after panel open + SSE updates.
- **R13.** After operator resolves a post on timeline, held row disappears from sidebar queue without panel reload (via `held_count` decrement or decision SSE with HOLD resolved).

---

## Key Flows

### F1. Panel open mid-session with pending held posts

1. Operator opens side panel.
2. Sidebar requests held queue from service worker → harness REST.
3. Section header shows count; operator expands section.
4. Rows list author, snippet, reasons, confidence, worker.

### F2. Row click → timeline review

1. Operator clicks held row in sidebar.
2. Service worker messages content script with `bundle_id`.
3. Content script scrolls to post, highlights overlay, opens floating review card with agent reasons.
4. Operator resolves on timeline; held count decrements; sidebar row removed.

### F3. Escalation alarm during demo

1. Third HOLD triggers `escalation_queue_full` alarm SSE.
2. Alarm appears in alarm stream; Held section auto-expands and pulses.
3. Operator points to queue rows as evidence, then clicks one row to begin HITL resolve beat.

---

## Scope Boundaries

**In scope:** Held section UI, hydrate on open, SSE sync, row click navigation, REST enrichment for author/snippet/worker, escalation auto-expand, demo checklist update for AE6 panel path.

**Out of scope:**
- Resolve buttons in sidebar (K1)
- Replacing or removing floating HITL panel
- Post-anchored inline HITL cards (ideation #3 — separate brainstorm)
- SSE `held_post` per-event stream (optional follow-up; REST refresh on count is sufficient for v1)
- Pagination beyond 20-row cap

**Deferred for later:**
- Click held row → inline checkpoint trace expand
- Bidirectional sync from timeline badge to sidebar held row (ideation #2)

---

## Acceptance Examples

- **AE1.** **Given** demo tape replay with ≥1 HOLD, **when** operator opens side panel, **then** Held section header shows correct count and expanded rows include author, snippet, confidence, and worker without using floating panel first.
- **AE2.** **Given** held row visible in sidebar, **when** operator clicks row, **then** timeline scrolls to post and floating review card opens with matching agent reasons.
- **AE3.** **Given** `escalation_queue_full` alarm during replay, **when** alarm SSE arrives, **then** Held section auto-expands and header pulses while alarm shows in alarm stream.
- **AE4.** **Given** operator resolves Hide on timeline, **when** resolve completes, **then** held count and sidebar queue decrement without full panel reload.
- **AE5.** **Given** replay mode, **when** tape processes HOLD posts, **then** Held section matches live ingest shape (R12).

---

## Success Criteria

- Operator can narrate HITL beat using sidebar queue alone to show *what* is held and *why*, then one click to reach resolve UI on timeline.
- AE6 demo checklist path documented: side panel Held queue → click row → floating panel resolve → count decrements.
- No duplicate resolve UX in sidebar.

---

## Outstanding Questions

None blocking — K1–K4 resolved in brainstorm dialogue.

---

## Sources

- Ideation seed: `docs/ideation/2026-06-13-ui-ux-improvement-ideation.md` (#10)
- Existing HITL: `extension/content/filter-ui.js`, `extension/background/service-worker.js`
- Harness held API: `harness/routes/sessions.js` (`createHitlRouter`), `harness/db/store.js`
- Observability baseline: `docs/plans/2026-06-13-003-feat-observability-plan.md` (R11 held count)
- Demo beat: `docs/demo-checklist.md` AE6
