---
date: 2026-06-13
topic: high-signal-tab
origin: docs/ideation/2026-06-13-sort-posts-by-score-ideation.md
---

# Requirements: High Signal Tab

## Summary

Add a **High signal** tab to the left of **For you** on X home. When selected, it replaces the native timeline with an extension-built list of **SHOW** posts sorted by **signal score, highest first**. Judges scroll the best posts without opening the side panel. Tapping a card expands it inline with full text, score, and agent reason codes (read-only). New SHOW decisions append to the bottom without re-sorting the whole list. Switching back to **For you** restores the normal timeline with existing filter overlays.

## Problem Frame

Signal Density Filter computes a 0–100 score for every post and shows it in operator tooling, but the primary reading surface — the X home feed — stays in platform order. Scores are badges and sidebar metadata, not a ranked reading experience. For the demo, the remembered moment is a cleaner feed while scrolling; today that moment depends on hiding low-signal posts in **For you**, not on surfacing the highest-signal posts first in a dedicated view. Judges who never open the side panel never see score-based ordering.

---

## Key Decisions

- **K1: Replacement feed, not filter-in-place.** When **High signal** is active, hide the native **For you** timeline and render the extension list in the primary column. Tab switch is mutually exclusive: **For you** ↔ **High signal**.
- **K2: Judge-first surface.** The tab exists so the audience can scroll ranked high-signal posts without the side panel. Operator observability (alarms, held queue, filtered lists) stays in existing surfaces.
- **K3: SHOW-only membership.** Only posts with a committed SHOW decision appear in **High signal**. HOLD, HIDE, and BLOCK stay in timeline overlays and side-panel lists.
- **K4: Score descending only for v1.** No in-tab sort modes (Shoreline, Fresh, asc/desc toggle) in the first version.
- **K5: Live append-bottom, no mid-scroll re-sort.** Initial list loads highest score first. New SHOW rows append to the bottom as decisions arrive. The list may drift from strict score order during a long session; that trade-off is accepted for scroll stability.
- **K6: Inline expand, no jump to For you.** Card tap expands content inside **High signal**. No scroll-to-post on the native timeline on tap.
- **K7: Extension-built cards.** Posts render as extension cards (author, snippet, score badge), not native X tweet nodes. Avoids fighting X feed virtualization.
- **K8: Read-only expanded detail.** Expanded cards show full post text, signal score, and agent reason codes. No resolve actions, links to X, or operator controls in the expand panel.
- **K9: DOM-first text, harness fallback.** Prefer full post text from the live page when the tweet is still in the DOM. Use harness session data when the post is off-screen or in replay mode.
- **K10: Media thumbnail when available.** Expanded cards may show an image or media thumbnail pulled from the live DOM post. No inline video playback in v1.

---

## Actors

- **A1. Judge (demo audience)** — selects **High signal**, scrolls ranked SHOW posts, expands cards inline.
- **A2. High signal tab UI (content script)** — injects nav tab, swaps primary-column content, renders and updates the list.
- **A3. Harness** — commits SHOW decisions with signal scores; emits real-time decision events the extension consumes.
- **A4. For you timeline (native X)** — remains available via tab switch; existing SHOW/HIDE/HOLD/BLOCK overlays continue to apply there.

---

## Requirements

### Tab navigation

- R1. On X home, inject a **High signal** tab immediately to the left of the native **For you** tab.
- R2. **High signal** and **For you** are mutually exclusive views. Only one primary-column feed is visible at a time.
- R3. Selecting **High signal** hides the native timeline content in the primary column and shows the extension list.
- R4. Selecting **For you** hides the extension list and restores the native timeline with existing filter behavior unchanged.
- R5. The active tab is visually distinct (selected state persists while the user stays on home).

### High signal feed list

- R6. The list includes only posts with a committed **SHOW** decision in the current session.
- R7. Posts sort by **signal score descending** on initial load. Higher scores appear above lower scores.
- R8. Each row shows at minimum: author handle or display name, text snippet, signal score, and SHOW status indicator.
- R9. HOLD, HIDE, and BLOCK posts never appear in **High signal**, even if their score is high.
- R10. When no SHOW posts exist yet, show an empty state that explains the tab will populate as high-signal posts pass the filter.

### Card interaction

- R11. Tapping a collapsed row expands it inline within **High signal**.
- R12. Expanded state shows **full post text**, **signal score**, and **agent reason codes**. The panel is read-only — no Show/Hide/Block actions and no navigation to **For you**.
- R13. Full post text prefers the live page when the tweet is still in the DOM. When the post is not on the page, use harness session text. If only a partial snippet exists, show it with a visible partial-content indicator.
- R14. When the live DOM post includes image or media preview assets, the expanded card shows a thumbnail. Video plays only outside **High signal** (no inline player in v1).
- R15. Tapping an expanded row collapses it, or a clear collapse affordance is provided.
- R16. Card tap does not switch to **For you** and does not scroll the native timeline.

### Live updates

- R17. When a new SHOW decision arrives during an active session, append the corresponding row to the **bottom** of the list.
- R18. Appending a new row does not re-sort or reorder existing rows while the user is viewing the list.
- R19. If a post's decision changes from SHOW to another action, remove it from **High signal** on the next update cycle.

### Session modes and reliability

- R20. **High signal** behaves consistently in live ingest and replay mode (same membership rules, same sort-on-load, same append behavior).
- R21. If the harness connection is unavailable, **High signal** shows a clear disconnected state rather than a stale or empty list that looks successful.

---

## Key Flows

### F1. Judge opens High signal during demo

- **Trigger:** Judge clicks **High signal** on X home with extension active and session running.
- **Actors:** A1, A2, A3
- **Steps:**
  1. Native **For you** feed hides.
  2. Extension loads SHOW posts for the session, sorted score descending.
  3. Judge scrolls highest-signal posts first.
- **Outcome:** Audience sees score-ranked reading without the side panel.

### F2. Inline expand

- **Trigger:** Judge taps a collapsed row.
- **Actors:** A1, A2
- **Steps:**
  1. Row expands inline with full post text, signal score, and agent reason codes.
  2. Extension loads text from the live DOM when the tweet is on-page; otherwise from harness session data.
  3. Media thumbnail appears when the live DOM post includes one.
  4. Judge reads content in place (no actions offered).
  5. Judge collapses or scrolls to another row.
- **Outcome:** Post detail and scoring rationale without leaving **High signal**.

### F3. New SHOW arrives during scroll

- **Trigger:** Harness commits a new SHOW decision while **High signal** is visible.
- **Actors:** A2, A3
- **Steps:**
  1. Extension receives the decision event.
  2. New row appends to the bottom of the list.
  3. Existing row order is unchanged.
- **Outcome:** Live session growth without scroll-jumping re-sorts.

### F4. Return to For you

- **Trigger:** User selects **For you**.
- **Actors:** A1, A2, A4
- **Steps:**
  1. Extension list hides.
  2. Native timeline reappears with existing overlays.
- **Outcome:** Normal filtered scrolling resumes.

---

## Acceptance Examples

### AE1. Initial ranked load

- **Covers:** R6, R7, R8
- **Given:** Session has SHOW posts with scores 72, 91, and 55
- **When:** User opens **High signal**
- **Then:** Rows appear in order 91, 72, 55 with scores visible on each row

### AE2. SHOW-only membership

- **Covers:** R6, R9
- **Given:** Session has one SHOW (score 80), one HOLD (score 45), and one HIDE (score 20)
- **When:** User opens **High signal**
- **Then:** Only the SHOW post appears

### AE3. Append without re-sort

- **Covers:** R17, R18
- **Given:** List shows scores 90 then 70; a new SHOW with score 95 arrives
- **When:** The new decision is processed
- **Then:** A third row appears at the bottom (score 95); the first two rows stay in place (90 above 70)

### AE4. Decision downgrade removes row

- **Covers:** R19
- **Given:** A post appears in **High signal** as SHOW
- **When:** Operator resolves the same post to HIDE on the timeline
- **Then:** The row disappears from **High signal**

### AE5. Empty state

- **Covers:** R10
- **Given:** Session is active but no SHOW decisions yet
- **When:** User opens **High signal**
- **Then:** Empty state copy appears; no native **For you** posts leak into the list

### AE6. Tab mutual exclusivity

- **Covers:** R2, R3, R4
- **Given:** User is on **High signal** with a populated list
- **When:** User clicks **For you**
- **Then:** Extension list hides and native timeline is visible again

### AE7. Expanded card content

- **Covers:** R12, R13, R14
- **Given:** A SHOW post with score 88, reason codes `HIGH_REACH`, `ON_TOPIC`, and full text visible on the live timeline
- **When:** Judge expands the row
- **Then:** Expanded panel shows full post text from the page, score 88, reason codes, and a media thumbnail if the tweet includes an image; no action buttons appear

### AE8. Harness fallback in replay

- **Covers:** R13, R20
- **Given:** Replay mode; post text exists in session data but the tweet is not in the live DOM
- **When:** Judge expands the row
- **Then:** Expanded panel shows harness session text, score, and reason codes; no DOM scrape is required

---

## Success Criteria

- A judge can select **High signal** and, within one scroll, articulate that posts are ordered by signal strength without opening the side panel.
- Demo narration can contrast **For you** (filtered native feed) with **High signal** (ranked SHOW-only feed) in under 30 seconds.
- Live append during demo does not jump scroll position of rows the judge is already reading.
- Replay mode produces the same tab behavior as live ingest for a fixed tape.

---

## Scope Boundaries

**In scope:** Nav tab injection, primary-column swap, SHOW-only ranked list, inline expand/collapse with full text + score + reason codes, DOM-first text with harness fallback, media thumbnails when available, append-bottom live updates, empty and disconnected states, replay parity.

**Deferred for later:**
- In-tab sort modes (Shoreline, Fresh, ascending audit toggle)
- Sidebar or drawer sort controls as the primary score-sort story
- Score-based reorder inside native **For you**
- Jump-to-timeline navigation from **High signal** rows
- HOLD or HIDE sections inside **High signal**
- Full mid-session re-sort when scores change

**Outside this product's identity:**
- Replacing X's recommendation algorithm globally
- A general-purpose custom social reader unrelated to harness-governed filtering

---

## Dependencies / Assumptions

- Harness already commits SHOW decisions with numeric signal scores for scored posts.
- Extension already receives decision events (or equivalent session data) during live and replay sessions.
- Initial load requires session-scoped access to SHOW posts with scores; append behavior requires incremental decision delivery.
- X home nav DOM remains injectable; layout changes on X.com may break tab placement until updated.
- **Assumption (accepted for v1):** Append-bottom order drift during long sessions is acceptable; strict score order is guaranteed on initial load only.

---

## Outstanding Questions

**Deferred to Planning:**
- Maximum list size before cap or virtualization
- Whether tied scores need a documented secondary ordering on initial load
- Collapsed-row snippet length and typography details

**Resolve Before Planning:** None — planning may proceed.

---

## Sources / Research

- Prior ideation: `docs/ideation/2026-06-13-sort-posts-by-score-ideation.md` (Clean feed / High signal refinement)
- Product demo frame: `docs/brainstorms/2026-06-13-signal-density-filter-requirements.md` (F1 live filtering, judge-as-audience)
- Existing extension surfaces: timeline overlays, filter-ui dock/drawer, side-panel observability — **High signal** is a new primary reading surface, not a replacement for operator tooling
