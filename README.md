# Signal Density Filter

Chrome MV3 extension + local Node.js harness that filters X.com timeline posts for a governed demo.

## Prerequisites

- **Node.js 20+** (required for native `better-sqlite3` bindings)
- **Chrome** (or Chromium) with MV3 extension sideload support
- **Anthropic API key** (optional — heuristic scoring works without one)

## Installation

```bash
git clone <repo-url>
cd gauntlet-hackathon-26
npm install
cp .env.example .env
```

Edit `.env` if you want LLM scoring or a non-default port. The harness creates `data/harness.db` on first run (gitignored).

## Run the harness

```bash
npm start
```

The harness listens on `http://localhost:3847` by default. Health check: `curl http://localhost:3847/health`.

### Scoring modes

| Mode | Setup | Use case |
|------|-------|----------|
| Heuristic | `AGENT=heuristic` in `.env` | Rehearsal, no API key |
| LLM | `AGENT=llm` + `ANTHROPIC_API_KEY` | Live demo (default in `.env.example`) |

See [HARNESS.md](./HARNESS.md) for pillars, checkpoints, cascade rules, and API details.

## Load the Chrome extension

1. Start the harness (`npm start`) so the extension can reach `localhost:3847`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `extension/` directory in this repo.
5. Open [x.com](https://x.com) — the side panel shows decisions, alarms, and held posts.

Pin the extension action to open the side panel quickly.

## Demo without live X

Record and replay a fixed post corpus for rehearsals:

```bash
npm run seed:tape          # writes tapes/demo-v1/
npm run replay -- --tape demo-v1
```

With the harness running, use the extension replay shortcut (`Alt+Shift+R`) or sidebar controls to switch modes.

## Tests

```bash
npm test
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3847` | Harness HTTP port |
| `AGENT` | `llm` | Scoring worker: `llm` or `heuristic` |
| `ANTHROPIC_API_KEY` | — | Required for LLM worker |
| `DATABASE_PATH` | `./data/harness.db` | SQLite store path |
| `LLM_CALLS` | unlimited | Cap Anthropic calls per session |
| `LLM_LOG` | `1` | Log LLM API calls to console |
| `RECORD_TAPE` | — | Tape id to append during live sessions |
| `TAPES_DIR` | `./tapes` | Override tape storage directory |
