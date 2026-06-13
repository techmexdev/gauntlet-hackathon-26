---
date: 2026-06-13
topic: hackathon-demo-winning
focus: hit R1–R21 requirements better and maximize judge demo perception
mode: repo-grounded
---

# Ideation: Winning the Hackathon Demo

## Grounding Context

**Project:** Signal Density Filter — Chrome MV3 extension + local Node.js harness that filters X.com timelines via a governed pipeline (Material Handler → Guardrails → Checkpoints → Alarms). Agent scores; harness commits SHOW/HIDE/HOLD/BLOCK. Hackathon success criterion: judges say *"my feed got quiet while I watched"* — not *"they showed me a dashboard."*

**Implemented vs demo-visible gap:** Harness core (R6–R14, R19–R21) is largely complete and tested. Winning is blocked by **UI beats** that make pillars legible on stage: checkpoint drill-down (plan 006 active, sidebar still flat), worker swap in terminal (R15 awkward), Material Handler with no visible beat (R6), explainability truncated to ~2 reason codes, live 70% hide rate unvalidated on real X (AE1).

**Past learnings:** `docs/solutions/` does not exist — greenfield knowledge base.

**External context:** 2025–2026 hackathon winners (GitLab DocSync, Aegis, Microsoft RiskWise) emphasize workflow-embedded agents, per-decision explainability, confidence-gated HITL, golden-path replay infrastructure, and trace-log scoring over "demo vibes" (AngelHack 2026 playbook). Demo infrastructure first beats live-only heroics (Since AI, Mario Ottmann).

## Topic Axes

1. **Live demo moment** — scroll, overlay, ~70% feed quieting (R1–R3)
2. **Harness pillar narration** — Material Handler, Guardrails, Checkpoints, Alarms visible beats (R5–R9)
3. **Demo reliability & fallback** — replay, connection state, rehearsal determinism (R4, R19–R20, AE7)
4. **Trust & explainability** — why hidden, score provenance, threshold policy (R10–R12, R15)
5. **HITL & escalation climax** — borderline HOLD, operator resolve (R16–R18)

## Ranked Ideas

### 1. Checkpoint Bundle Trace Accordion

**Description:** Wire side panel checkpoint rows (and optionally Filtered Posts / Blocked rows) to a bundle trace fetch. Click expands inline accordion showing CP-0 through CP-5 with pass/fail, reason codes, and key payloads. CP-0 displays normalized plain text, content hash, and bundle ID — delivering the Material Handler demo beat without a separate panel section.

**Axis:** Harness pillar narration

**Basis:** `direct:` Plan 006 notes `GET /sessions/:id/checkpoints/:bundleId` exists but `sidebar.js` prepends flat rows with no click handler; requirements R8 and demo script Checkpoints beat depend on showing the gate chain.

**Rationale:** Highest gap between "we have checkpoints" and "judges believe we have checkpoints." One UI surface unlocks two pillar beats (Checkpoints + Material Handler) and supports AE4 mid-gate replay narration.

**Downsides:** Fast replay produces many rows; need bundle grouping or collapse polish. Full trace API (plan 006 R1) is nicer than checkpoint-only fetch but adds harness work.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

---

### 2. Cascade Receipt + Full Agent Reasons

**Description:** (a) Stop truncating agent `reasons` to two codes at commit for SHOW/HIDE — emit full `agent_reasons[]` via SSE/REST; sidebar uses progressive disclosure (collapsed: top 2, expand: full list). (b) Attach `cascade_meta` to every decision: heuristic pre-score, `llm_invoked`, branch trigger (`gray_band`, `escalate`, `disagreement`), disagreement delta, final worker. Render compact chip on decision/filtered rows: `H:47 → L:52 Δ19`.

**Axis:** Trust & explainability

**Basis:** `direct:` Explainability ideation #2/#3; `decision.js` slices reasons for SHOW/HIDE while CP-2 stores complete output; cascade path computed in harness but not published to extension.

**Rationale:** Answers "why 39 not 41?" and makes worker-swap divergence visible **in the panel** without terminal archaeology. Smallest explainability bundle with highest judge Q&A defense.

**Downsides:** Slightly larger SSE payloads; must update publish helper to prevent SSE/REST drift (pattern already established in plan 004).

**Confidence:** 90%

**Complexity:** Low

**Status:** Unexplored

---

### 3. Harness Heartbeat + One-Click Replay Boot

**Description:** Persistent strip at top of side panel: `Live ●` / `Replay ●` / `Offline ✕` with last SSE timestamp. When harness unreachable on extension load, show connection stage with one button: **Start demo in replay** — creates session, loads `demo-v1`, switches extension to replay mode without terminal interaction.

**Axis:** Demo reliability & fallback

**Basis:** `direct:` UI/UX ideation #5 (85% confidence); demo checklist assumes `npm start` at minute 0:00; silent empty panel reads as broken extension to judges.

**Rationale:** Hackathon demos fail silently when harness isn't running. External pattern: golden-path demo infrastructure with deterministic fallback (Since AI, AngelHack). Converts replay from apology into rehearsed product mode.

**Downsides:** Auto-boot replay diverges from "live-first" story if used as default opener; should remain fallback, not headline.

**Confidence:** 85%

**Complexity:** Medium

**Status:** Unexplored

---

### 4. In-Panel Worker Rescore

**Description:** Side panel action: **Re-score session** with dropdown `Heuristic` / `LLM`, optional **from gate** `CP-2` / `CP-3`. POSTs to existing replay endpoint with alternate agent. Side panel highlights bundles whose decision or score changed after rescore.

**Axis:** Harness differentiation

**Basis:** `direct:` R15 requires worker-swap beat on same post set; today requires second terminal + `npm run replay -- --agent`; requirements success criteria: "agent swap and checkpoint replay each land as distinct harness-not-wrapper moments."

**Rationale:** Removes the most awkward demo beat (context switch to terminal). External: AngelHack trace-log scoring — judges score inspectable trajectories, not dev ops.

**Downsides:** Session-scoped agent override may need small harness API addition; must not require harness restart mid-demo.

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

---

### 5. Demo Rehearsal Kit — Anchor Posts & Dual Replay

**Description:** Extend `docs/demo-script.md` with three **anchor bundle IDs** from `demo-v1`: (1) guardrail BLOCK with named code, (2) borderline HOLD with agent reasons, (3) bundle where heuristic vs LLM scores diverge ≥10. Pre-run both agent replays before pitch; operator narrates from known rows, not hunt-by-scroll. Add one-page **AE runbook** timing each beat to 5 or 10 minutes.

**Axis:** Demo reliability & fallback

**Basis:** `direct:` Demo checklist AE3–AE6; tape manifest shows 40% bait, 15% borderline; builder has not validated live 70% on real X. `external:` AgentGate scripted adversarial inputs with expected trace evidence.

**Rationale:** Zero-to-low code; highest win-rate lift per hour. Identical outcomes on replay satisfy AE7 and success criteria "rehearse twice consecutively with identical outcomes."

**Downsides:** Does not fix live X DOM risk for opening scroll; pair with 30s live moment then tape for pillars.

**Confidence:** 95%

**Complexity:** Low

**Status:** Unexplored

---

### 6. Escalation-Driven HITL Beat Polish

**Description:** When `escalation_queue_full` alarm fires, auto-expand **Held for review**, pulse held stat (partially exists), and optionally scroll timeline to first held post. Ensure click held row → `open_held_review` → floating card with full reasons → resolve Hide decrements count (AE6). Optional **Triage** preset: expand held + sort held/hidden by score ascending (shoreline) so operator doesn't hunt borderline posts mid-narration.

**Axis:** HITL & escalation climax

**Basis:** `direct:` Plan 005 shipped held queue; demo script HITL beat at ~4:00; sort ideation #6 "Demo Triage Lens Preset"; GitLab DocSync pattern — confidence-gated escalation as designed branch, not failure.

**Rationale:** HITL is the narrative climax; existing code is easy to miss under demo pressure. Polish + preset turns implemented feature into rehearsed moment.

**Downsides:** Auto-scroll may interrupt live scroll demo; gate auto-scroll to alarm-triggered beat only.

**Confidence:** 82%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 7. Policy Threshold Chip on Filtered Rows

**Description:** On Filtered Posts and decision log rows near the boundary, show explicit harness policy: `Score 39 · HIDE (SHOW ≥ 40)` or `escalate → HOLD (auto-commit suppressed)`. Makes R10 threshold visible without opening accordion.

**Axis:** Trust & explainability

**Basis:** `direct:` R10 SHOW ≥ 40 / HIDE < 40; explainability ideation notes threshold invisible; UI conflates agent score with harness policy outcome.

**Rationale:** One-line chip answers the most common skeptical judge question in the Guardrails/Decisions beats. Complements idea #2 without full heuristic ledger.

**Downsides:** Demo copy must briefly explain threshold constants; borderline posts need both chip and full reasons.

**Confidence:** 88%

**Complexity:** Low

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Start replay-first, live as bonus | Scope overrun — live scroll is R1 headline and success criterion anchor |
| 2 | Auto-switch to replay on ingest stall | Too invisible / risky — R4 wants operator control; silent switch erodes trust |
| 3 | Inline pipeline stepper on every badge | Duplicates stronger #1 accordion; Medium DOM risk on X virtualized feed |
| 4 | Graduated blur / BLOCK tombstones on timeline | Medium complexity; conflicts with AE3 BLOCK panel-only contract unless redesigned |
| 5 | Feed↔panel bidirectional sync + minimap | Medium; secondary to trace accordion for checkpoint beat |
| 6 | Post-anchored HITL dock below tweet | Medium–High DOM risk; floating panel already exists |
| 7 | Pillar progress rail / teleprompter | Lower leverage than heartbeat + anchor kit; 72% confidence in prior ideation |
| 8 | Mode-change audience toast on Alt+Shift+R | Polarizing — may interrupt scroll; R4 wants invisible fallback |
| 9 | Show guardrail YAML on stage | Better as one blocked row + named code than raw YAML |
| 10 | SSE reconnect + cursor backfill | Too expensive pre-pitch; hydrate-on-open sufficient for demo scale |
| 11 | Heuristic score ledger waterfall | Medium; #2 cascade receipt covers worker path; ledger is follow-on |
| 12 | Golden-path demo mode cached fixtures | Overlaps #3 + #5; env flag adds scope |
| 13 | Event-log kill-and-resume mid-demo | High rehearsal risk; replay hotkey already covers reliability |
| 14 | Trace-log scoring rubric slide | Presentation asset, not product — handle in pitch deck not build |
| 15 | Author history enrichment | Explicit scope boundary in requirements |
| 16 | Standalone feed app / Chrome Web Store | Subject-replacement / out of scope |
| 17 | Full MoMoE / grading dashboard | Demoted in prior ideation; too heavy for hackathon |
| 18 | 60-second demo only | Below ambition for 10-min slot user requested |
| 19 | No side panel (everything inline) | Subject-replacement of operator console identity |
| 20 | 100% block rate as intentional feature | Gimmick; undermines R2 ~70% narrative |

## Recommended Build Order (if proceeding to brainstorm/plan)

1. **#5 Rehearsal Kit** — do today, zero risk  
2. **#1 Trace Accordion** — unlocks Checkpoints + Material Handler beats  
3. **#2 Cascade Receipt + Full Reasons** — quick trust win  
4. **#7 Threshold Chip** — pairs with #2  
5. **#6 HITL Polish** — rehearsal-only if time tight  
6. **#3 Heartbeat + Replay Boot** — insurance  
7. **#4 In-Panel Rescore** — if terminal swap still feels awkward after #5
