# 5-Minute Demo Script

Target: 5 minutes. Rehearse twice on replay before live X.

## Minute 0:00 — Sensory hook (30s)

**Covers R1–R3, AE1, AE1b. Panel stays closed.**

Start harness: `npm start`  
Load extension on x.com/home (or `npm run replay -- --tape demo-v1` if X is flaky)

Scroll timeline at normal speed. Point to **Feed quiet** ticker (bottom-left) and overlays appearing on posts.

> "Watch the feed quiet — that's roughly 70% noise filtered, with named reason codes and checkpoint gates behind every decision."

Let ticker climb and AE1 badge approach **READY** (30+ decisions, ≥70% filter rate on replay). Do not open the side panel yet.

## Minute 0:30 — Material Handler (45s)

**Pillar beat: Material Handler (R6)**

Open side panel if needed. Point to posts getting badges.

> "Every post is normalized before the agent sees it — HTML stripped, stable bundle IDs, content hashes for dedupe. The scoring worker never gets raw DOM."

Click `demo-signal-0` row → **Gates** tab → CP-0 plain text (no raw HTML).

## Minute 1:15 — Guardrails (45s)

**Pillar beat: Guardrails**

Find a blocked or hidden bait post. Open side panel if needed.

> "Guardrails run before the agent. Engagement bait, duplicates, spam domains — each gets a named BLOCK reason. No LLM call wasted on obvious junk."

## Minute 2:00 — Checkpoints + scoring (60s)

**Pillar beat: Checkpoints (R8, R10–R12)**

Open side panel checkpoint log. Click a row → **Gates** tab shows CP-0..CP-5.

> "Six checkpoint gates validate every output. Invalid category? Schema violation? The pipeline holds — it doesn't crash."

**Worker swap (R13–R15, AE5):** Pre-stage terminal commands before demo. Narrate in ≤20s; point at cascade chip on `demo-borderline-0` if terminal swap is skipped on stage.

```bash
# Pre-staged in terminal — do not type live unless rehearsed
npm run replay -- --tape demo-v1 --agent heuristic
npm run replay -- --tape demo-v1 --from CP-3 --agent llm
```

> "Same tape, different worker — watch the borderline post change score."

**Agent tools (stretch, R-T4–R-T9):** On replay with `AGENT=llm`, narrate checkpoint log tool beats when present:

- `demo-tool-promo-0` — *"The agent asked the harness for author history."*
- `demo-tool-url-0` — *"The agent checked whether this link is trusted."*
- `demo-tool-engagement-0` — *"The agent compared how viral this post is relative to the session."*

## Minute 3:00 — Alarms (45s)

**Pillar beat: Alarms**

Point to alarm stream in side panel (latency, block rate, confidence).

> "Structured alarms — not log spam. Block rate spike? Agent latency? The operator gets a recommended action."

## Minute 3:45 — HITL resolve (45s)

**Pillar beat: Human-in-the-loop**

Resolve one held post via floating panel (Show / Hide / Block).

> "Borderline posts escalate to HOLD. Operator sees agent reasoning and commits the final call. Held count decrements."

## Minute 4:30 — Replay fallback (30s)

Press **Alt+Shift+R** (or click "Switch to Replay" in side panel).

> "If live X fails mid-demo, one hotkey switches to replay. Same overlay, same events — judges won't notice."

## Minute 5:00 — Close

> "Four pillars: Material Handler, Guardrails, Checkpoints, Alarms. Governed filtering with replay fallback. Questions?"

## Fallback script (no live X)

Skip minute 0:30 live scroll. Start with:

```bash
npm run replay -- --tape demo-v1
```

Extension in replay mode shows decisions on timeline posts as tape replays through SSE.

## AE7 timing compression (if rehearsal exceeds 5 min)

Preserve all four pillar beats (R5). Cut padding only:

| Beat | Keep | Compress |
|------|------|----------|
| Hook | Ticker + 15s scroll | Skip live X; start replay immediately |
| Material Handler | CP-0 on `demo-signal-0` | One sentence; no second row |
| Guardrails | `demo-bait-0` CP-1 | Skip View on timeline |
| Checkpoints | Gates tab on one row | Skip live terminal swap; point at cascade chip |
| Alarms | One alarm scroll | ≤15s dwell |
| HITL | `demo-borderline-0` resolve Hide | Pre-expand Held section before minute 3:45 |
| Replay fallback | Alt+Shift+R one-liner | Skip if already on replay |
| Close | Four pillars line | No repeat of worker swap |

Rehearse compressed script once; use as primary if two timed runs both exceed 5:00.

## Operator references

- Requirements map: `docs/demo-rehearsal-kit.md` → Requirements Traceability Matrix
- Rubric prep + Q&A: same file → Rubric-to-Proof and Q&A Defense sections
- Manual verification: `docs/demo-checklist.md` AE1–AE7
