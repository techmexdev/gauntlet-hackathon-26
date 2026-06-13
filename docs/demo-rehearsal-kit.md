# Demo Rehearsal Kit

Timed operator script for `demo-v1` replay. Rehearse twice back-to-back before live X.

## Setup (2 min)

```bash
npm start
# Extension loaded; side panel open
npm run replay -- --tape demo-v1
# Or Alt+Shift+R in extension after live session started
```

## Anchor Bundles

Memorize these three bundle IDs — do not hunt during the pitch.

| Beat | Bundle ID | What to show |
|------|-----------|--------------|
| **Guardrails** | `demo-bait-0` | Blocked Posts row → click → CP-1 fail · `GUARDRAIL_ENGAGEMENT_BAIT` |
| **Material + scoring** | `demo-signal-0` | Hidden/Decisions row → click → CP-0 normalized text (no raw HTML) · CP-2 score · SHOW |
| **HITL** | `demo-borderline-0` | Held for review → click row → resolve Hide on timeline card |

## 10-Minute Beat Script

### 0:00 — Hook + live scroll (optional 45s)

> "X timelines are mostly noise. Watch the feed quiet as governed filtering runs — named codes, not opaque fades."

Scroll x.com/home briefly if live works; otherwise stay on replay.

### 1:00 — Material Handler + Checkpoints

Open side panel → **Checkpoints** or **Hidden Posts**.

Click any row for `demo-signal-0` (or a recent checkpoint row for that bundle).

> "Every post normalizes before the agent sees it — CP-0 is plain text and a content hash. Six gates through CP-5; click any row to see the chain."

Expand accordion: point at CP-0 text, CP-2 score, CP-5 committed SHOW.

### 3:00 — Guardrails

Expand **Blocked Posts** → click `demo-bait-0`.

> "Guardrails run before the LLM. Engagement bait gets a named block at CP-1 — no token wasted."

Point at `GUARDRAIL_*` in accordion. Optional: **View on timeline** link.

### 4:30 — Explainability (policy + cascade)

Click a HIDE row with policy chip visible.

> "The harness decides, not the model alone. Score below 40 → HIDE. Full agent reasons on the row; cascade chip shows heuristic path when LLM ran."

If LLM replay was run, point at `H:47 → L:52 ΔN` chip.

### 6:00 — Alarms

Scroll **Alarms** section.

> "Structured alarms with recommended actions — latency, block rate, escalation queue."

### 7:00 — HITL climax

Expand **Held for review** → click `demo-borderline-0` → floating card on timeline.

> "Borderline posts escalate to HOLD. Operator sees agent reasoning and commits Show, Hide, or Block."

Resolve **Hide** — held count decrements.

### 8:30 — Replay fallback

Press **Alt+Shift+R** (or click Switch to Replay).

> "Live sessions record to tape. One hotkey — same overlay, same events. Demo reliability is a feature."

### 9:30 — Close

> "Four pillars: Material Handler, Guardrails, Checkpoints, Alarms. Governed filtering with explainable decisions and replay fallback."

## Worker-Swap Narration (terminal, pre-staged)

Run before demo; narrate from decision log or re-replay:

```bash
npm run replay -- --tape demo-v1 --agent heuristic
npm run replay -- --tape demo-v1 --from CP-3 --agent llm
```

Point at `demo-borderline-0` or any row where cascade chip shows disagreement.

## Verification Checklist

- [ ] Click checkpoint row → CP-0..CP-5 accordion loads
- [ ] `demo-bait-0` trace shows CP-1 fail + guardrail code
- [ ] HIDE row shows `HIDE (score N < 40)` policy chip
- [ ] `demo-borderline-0` in held queue; resolve decrements count
- [ ] Full script ≤ 10 min on replay

## Fallback (no live X)

Skip live scroll. Start with `npm run replay -- --tape demo-v1` and run beats from anchor table only.

---

## Requirements Traceability Matrix

One-page map from requirements → acceptance example → visible proof. Narrate the requirement while showing the proof.

| Req | AE | Visible proof | Anchor / action | Script minute |
|-----|-----|---------------|-----------------|---------------|
| R1 | AE1 | Scroll with overlays updating | Live x.com/home or replay | 0:00–0:30 |
| R2 | AE1, AE1b | ≥70% filter rate; AE1 badge **READY** | Replay 30+ posts; sidebar + ticker | 0:00–0:30 |
| R3 | AE1 | Badges/dim/hide on native timeline | Scroll with panel closed first | 0:00–0:30 |
| R4 | AE2 | Alt+Shift+R; layout unchanged | Hotkey or side panel button | 4:30 |
| R5 | AE7 | All four pillar beats under 5 min | Full script timed twice | entire |
| R6 | AE3b | CP-0 normalized text, no raw HTML | `demo-signal-0` → Gates tab | 0:30–1:15 |
| R7 | AE3 | CP-1 fail before agent; named code | `demo-bait-0` → Gates tab | 1:15 |
| R8 | AE4 | CP-0..CP-5 chain; replay from CP-3 | Grading Story Row Gates tab | 2:00 |
| R9 | — | Alarms section with severity + action | Side panel Alarms scroll | 3:00 |
| R10 | AE3b | Policy tab: score vs threshold | HIDE row policy chip | 2:00 |
| R11 | AE6 | HOLD on borderline; not auto SHOW/HIDE | `demo-borderline-0` | 3:45 |
| R12 | AE3 | Named guardrail/agent reason codes | `demo-bait-0`, Agent tab | 1:15 |
| R13–R15 | AE5 | Cascade chip `H:N → L:N ΔN` | `demo-borderline-0` or terminal swap | 2:00 |
| R16–R18 | AE6 | Held count; resolve decrements | Dock → drawer → floating card | 3:45 |
| R19–R21 | AE4 | Tape replay; mid-checkpoint + worker swap | `npm run replay -- --tape demo-v1` | 2:00, 4:30 |

**Checklist crosswalk:** Walk `docs/demo-checklist.md` AE1–AE7 after each rehearsal. Unchecked box = punch-list item, not a new feature.

---

## Rubric-to-Proof Judge Prep

Write exact on-screen proof under each likely judging dimension. Lead with Impact in the first 30 seconds.

| Dimension | Proof judges will see | When to show |
|-----------|----------------------|--------------|
| **Impact** | Feed quiet ticker climbing; ≥70% filtered; overlays on timeline | First 30s — scroll with panel closed |
| **Innovation** | Named guardrail codes; six checkpoint gates; harness decides (not model alone) | `demo-bait-0`, Grading Story Row |
| **Technical** | `demo-v1` replay; mid-checkpoint replay; worker swap; SSE overlay | AE4 terminal (pre-staged), AE2 fallback |
| **Demo / presentation** | 5-min script; no debugging on stage; replay pivot under 30s | AE7 rehearsal; backup screencast |

**Opening line (memorize):** *"Watch the feed quiet — that's roughly 70% noise filtered, with named reason codes and checkpoint gates behind every decision."*

Do not open the side panel until ticker shows activity or AE1 badge approaches READY.

---

## Q&A Defense Cheat Sheet

Keep answers under 20 seconds; end with *"let me show you"* → anchor bundle.

| Question | Answer | Show |
|----------|--------|------|
| Why not just blocklists? | Guardrails catch obvious junk before any LLM call; the agent handles borderline signal on the rest. Harness commits SHOW/HIDE/HOLD/BLOCK — not the model alone. | `demo-bait-0` (guardrail) + `demo-borderline-0` (agent) |
| Why checkpoints? | Six gates enforce schema and policy contracts; a bad agent output holds instead of crashing. Any run replays from a mid-pipeline gate without re-scraping X. | `demo-signal-0` Gates tab; optional `npm run replay -- --from CP-3` |
| What if the agent is wrong? | Borderline posts escalate to HOLD; operator sees agent reasons and commits Show, Hide, or Block. Held count decrements on resolve. | `demo-borderline-0` → floating review card |

**Worker swap (if asked):** Same tape, different scoring worker — heuristic vs LLM produces different scores on the same post set. Point at cascade chip or re-run pre-staged terminal commands.
