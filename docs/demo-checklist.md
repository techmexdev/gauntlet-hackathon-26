# Demo Checklist

Manual verification for acceptance examples AE1–AE7.

## Setup

- [ ] `npm install` completes
- [ ] `npm test` passes
- [ ] `npm start` — harness on http://localhost:3847
- [ ] Extension loaded unpacked from `extension/`
- [ ] Side panel opens from extension icon
- [ ] When harness offline, **Start demo in replay** banner visible; after `npm start`, one click boots `demo-v1` without terminal replay command

## AE1 — Live scroll filter (R1–R3)

- [ ] Logged into x.com/home
- [ ] Scroll 60s with extension active
- [ ] 30+ posts captured
- [ ] ≥70% receive HIDE or BLOCK overlay
- [ ] Outcomes visible on native timeline (badges/dim/hide)

## AE1b — Session metrics + quiet ticker (plan 012)

- [ ] Side panel **Feed quieting** section shows filter rate, SNR, quiet ratio, signal count
- [ ] After 30+ decisions on replay, AE1 badge shows **READY** with ≥70% filter rate on `demo-v1`
- [ ] With side panel closed, **Feed quiet** ticker bottom-left updates on hide/block (pulse on filter)
- [ ] Ticker dismiss (×) hides until tab refresh; metrics in sidebar still update

## AE2 — Live → replay fallback (R4, R20)

- [ ] Live mode ingesting posts
- [ ] Press Alt+Shift+R (or side panel button)
- [ ] Scraper stops; SSE continues
- [ ] Overlay layout unchanged
- [ ] Decisions keep flowing from tape replay

## AE3 — Guardrail named reason (R7, R12)

- [ ] Bait or duplicate post blocked
- [ ] **Filtered Posts** side panel row shows `@author`, post snippet, confidence N/A, no agent reasons in collapsed row
- [ ] Block occurs before agent scoring (checkpoint log shows CP-1 fail)
- [ ] Expand blocked row or open Gates tab → CP-1 fail with guardrail code

## AE3b — Grading Story Row (plan 010)

- [ ] Collapsed row shows action, score, confidence bar (0.5 marker), cascade chip only — no agent reason codes visible
- [ ] Expand row → four tabs: Agent, Cascade, Gates, Policy
- [ ] **Recent Decisions** / **Hidden Posts** expand with **Agent** tab default
- [ ] **Checkpoints** click opens same bundle with **Gates** tab default (lazy trace fetch)
- [ ] Gates tab shows loading skeleton, then CP-0..CP-5; unavailable message on 404 only
- [ ] Policy tab shows harness branch + inputs separate from Agent reasons (AE3 HOLD narrative)
- [ ] Anchor bundles: `demo-bait-0` (BLOCK), `demo-borderline-0` (cascade), `demo-signal-0` (SHOW)

## AE3b (legacy trace) — superseded by Grading Story Row

- [ ] ~~Click row → immediate trace accordion~~ replaced by Gates tab lazy load
- [ ] ~~Reasons chevron~~ replaced by Agent tab

## AE3c — Held explainability parity

- [ ] Held row uses Grading Story Row collapsed summary (confidence bar + cascade chip)
- [ ] Expand → Agent tab for agent reasons; Policy tab for harness HOLD branch when data present

## AE4 — Mid-checkpoint replay + worker swap (R21)

- [ ] `npm run replay -- --tape demo-v1` completes
- [ ] `npm run replay -- --tape demo-v1 --from CP-3 --agent heuristic` completes
- [ ] Bundle IDs stable across runs
- [ ] At least one decision differs after worker swap

## AE5 — Worker score divergence (R15)

- [ ] Heuristic and LLM produce different scores on borderline post
- [ ] Visible in replay or side panel decision log

## AE6 — HITL resolve (R16–R18)

- [ ] Held count > 0 during demo tape replay
- [ ] Side panel **Held for review** section shows author, snippet, cascade/confidence badges, and expandable agent reasons (expand section if collapsed)
- [ ] Click a held row in side panel → timeline scrolls and floating review card opens for that post
- [ ] **Needs review** dock → drawer list → click row → floating review card opens (same resolve surface as sidebar)
- [ ] Floating HITL panel shows agent reasons (resolve buttons on timeline only)
- [ ] Resolve Hide → held count decrements and row disappears from side panel queue without reload
- [ ] Overlay updates on resolved post

## AE7 — Timed rehearsal (R5)

- [ ] Full script in `docs/demo-script.md` under 5 minutes
- [ ] Rehearsal kit in `docs/demo-rehearsal-kit.md` under 10 minutes with anchor bundles
- [ ] All four pillar beats narrated
- [ ] Rehearsed twice on replay before live pitch

## Extension smoke tests

- [ ] Scraper extracts author, text from visible tweets
- [ ] Overlay applies within 500ms of SSE decision on replay
- [ ] MutationObserver picks up newly scrolled posts
- [ ] Side panel shows alarms, checkpoints, decisions, **Held for review**, and **Filtered Posts** (HIDE/BLOCK with reasons)
- [ ] Held count updates in real time

## Harness smoke tests

- [ ] `npm run seed:tape` generates demo-v1
- [ ] `GET /health` returns ok
- [ ] SSE `/events` streams decision + alarm events
- [ ] `AGENT=heuristic` runs without API key
