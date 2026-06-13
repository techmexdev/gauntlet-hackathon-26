# Signal Density Harness

Local Node.js harness for the Signal Density Filter demo. Four named pillars govern every post through the pipeline.

## Four Pillars

### 1. Material Handler

Normalizes raw post envelopes from the extension or replay tape. Strips HTML, extracts plain text and URLs, computes `content_hash` for dedupe, and assigns stable `bundle_id` values. The scoring worker never receives raw HTML.

**Checkpoint:** CP-0 (normalized)

### 2. Guardrails

Declarative pre-agent rules in `harness/config/guardrails.yaml`. Blocks posts with named reason codes before any agent runs:

- `GUARDRAIL_TOO_SHORT`
- `GUARDRAIL_DUPLICATE`
- `GUARDRAIL_BLOCKED_ACCOUNT`
- `GUARDRAIL_ENGAGEMENT_BAIT`
- `GUARDRAIL_SPAM_DOMAIN`
- `GUARDRAIL_STALE_POST`

**Checkpoint:** CP-1 (guardrails_passed)

### 3. Checkpoints

Six gate validation stages before a decision commits:

| Stage | Name | Pass criteria |
|-------|------|---------------|
| CP-0 | normalized | Valid normalized post shape |
| CP-1 | guardrails_passed | No guardrail block |
| CP-2 | agent_scored | Worker returned valid output |
| CP-3 | schema_valid | Score 0–100, category in enum, reasons present |
| CP-4 | confidence_checked | Confidence present; escalation flag valid |
| CP-5 | decision_committed | SHOW/HIDE/HOLD/BLOCK written |

Replay from stage N reuses stored bundles and re-runs stages N through CP-5 only.

### 4. Alarms

Structured alarms stream to the extension sidebar via SSE:

- `schema_violation` — agent output failed validation
- `high_block_rate` — block rate exceeds 80% in rolling window
- `agent_latency` — scoring took longer than 2s
- `llm_calls_limit` — session exhausted its `LLM_CALLS` budget
- `confidence_collapse` — multiple low-confidence scores detected
- `escalation_queue_full` — held post queue needs attention

## Scoring Workers

Two workers behind one interface (`harness/agents/`):

| Worker | Env | Use case |
|--------|-----|----------|
| Heuristic | `AGENT=heuristic` | No API key; fast rehearsal |
| LLM | `AGENT=llm` | Default for live demo; requires `ANTHROPIC_API_KEY` |

Swap workers with configuration only — no harness code changes:

```bash
AGENT=heuristic npm start
AGENT=llm npm start
```

### Tiered cascade

Heuristic scores every post first. LLM runs only on gray band (score 30–60), `escalate: true`, or heuristic/LLM disagreement.

Set `LLM_CALLS` to cap Anthropic invocations per session (e.g. `LLM_CALLS=5`). After the budget is exhausted, borderline posts stay on the heuristic path and the harness fires an `llm_calls_limit` alarm.

## Decision rules

- **SHOW** — score ≥ 40
- **HIDE** — score < 40
- **HOLD** — `escalate: true` or low confidence on high-reach accounts
- **BLOCK** — guardrail rejection

## Replay

```bash
npm run seed:tape
npm run replay -- --tape demo-v1
npm run replay -- --tape demo-v1 --from CP-3 --agent heuristic
```

Mid-checkpoint replay reuses stored agent output from prior runs and re-evaluates decision gates only.

## Session modes

| Mode | Extension | Harness |
|------|-----------|---------|
| `live` | Scrape + POST ingest | Full pipeline |
| `record` | Same as live | Append to JSONL tape |
| `replay` | SSE only, no scrape | Read tape through pipeline |

Switch live → replay with `Alt+Shift+R` in the extension (invisible to judges — same overlay layout).

## API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/events` | GET | SSE stream (decision, alarm, checkpoint, held_count) |
| `/sessions` | POST | Create session |
| `/sessions/:id/mode` | PATCH | Switch mode |
| `/sessions/:id/replay` | POST | Replay tape into session |
| `/ingest` | POST | Ingest posts |
| `/hitl/:id/held` | GET | List held posts |
| `/hitl/:id/resolve/:bundleId` | POST | Resolve held post |
