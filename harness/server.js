import express from 'express';
import { loadEnv } from './lib/load-env.js';
import { createStore } from './db/store.js';
import { createAgent } from './agents/index.js';
import { AlarmManager } from './pipeline/alarms.js';
import { EventBus, createSseHandler } from './routes/events.js';
import { createIngestRouter, createSessionsRouter, createHitlRouter } from './routes/sessions.js';
import { createTapeRecorder } from './replay/tape-recorder.js';
import { isForceLlmEnabled } from './pipeline/cascade.js';
import { getLlmCallsLimit } from './lib/llm-limit.js';

loadEnv();

export function createApp(options = {}) {
  const store = options.store || createStore(options.dbPath || process.env.DATABASE_PATH || './data/harness.db');
  const agent = options.agent || createAgent();
  const eventBus = options.eventBus || new EventBus();
  const sse = createSseHandler(eventBus);

  const alarmManager = new AlarmManager(store, (type, data) => eventBus.publish(type, data));

  const tapeRecorder = process.env.RECORD_TAPE
    ? createTapeRecorder(process.env.RECORD_TAPE)
    : options.tapeRecorder || null;

  const deps = { store, agent, alarmManager, eventBus, tapeRecorder };

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      agent: agent.type,
      llmConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      forceLlm: isForceLlmEnabled(),
      llmCallsLimit: getLlmCallsLimit(),
    })
  );
  app.get('/events', sse.handler);

  app.use('/ingest', createIngestRouter(deps));
  app.use('/sessions', createSessionsRouter(deps));
  app.use('/hitl', createHitlRouter(deps));

  return { app, store, agent, eventBus, alarmManager, sse, deps };
}

const { app, agent } = createApp();
const port = process.env.PORT || 3847;

if (process.argv[1]?.endsWith('server.js')) {
  app.listen(port, () => {
    const llmReady = agent.type === 'llm' && Boolean(process.env.ANTHROPIC_API_KEY);
    const forceLlm = isForceLlmEnabled();
    console.log(`Harness listening on http://localhost:${port}`);
    console.log(
      `Agent: ${agent.type}${llmReady ? ' (Anthropic API enabled, tiered cascade)' : ''}${forceLlm ? ' — FORCE_LLM: every post scored by Claude' : ''}`
    );
    if (agent.type === 'llm' && !process.env.ANTHROPIC_API_KEY) {
      console.warn('AGENT=llm but ANTHROPIC_API_KEY is missing — falling back to heuristic scoring');
    }
  });
}

export default app;
