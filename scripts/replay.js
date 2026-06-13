#!/usr/bin/env node
import { loadEnv } from '../harness/lib/load-env.js';
import { createStore } from '../harness/db/store.js';

loadEnv();
import { createAgent } from '../harness/agents/index.js';
import { AlarmManager } from '../harness/pipeline/alarms.js';
import { EventBus } from '../harness/routes/events.js';
import { replayTape } from '../harness/replay/tape-player.js';

function parseArgs(argv) {
  const args = { tape: 'demo-v1', from: 'CP-0', agent: process.env.AGENT || 'heuristic' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--tape') args.tape = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--agent') args.agent = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv);
const store = createStore(':memory:');
const agent = createAgent({ agent: args.agent });
const eventBus = new EventBus();
const alarmManager = new AlarmManager(store, (type, data) => eventBus.publish(type, data));

const result = await replayTape(args.tape, {
  store,
  agent,
  alarmManager,
  eventBus,
  fromStage: args.from,
});

const actions = result.results.reduce(
  (acc, r) => {
    acc[r.decision.action] = (acc[r.decision.action] || 0) + 1;
    return acc;
  },
  {}
);

console.log(`Replayed ${result.processed} posts (session: ${result.sessionId})`);
console.log('Decisions:', actions);
console.log(`Agent: ${args.agent}, from: ${args.from}`);

store.close();
