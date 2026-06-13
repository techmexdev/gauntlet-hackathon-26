import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createApp } from '../server.js';
import { EventBus } from '../routes/events.js';

test('SSE client receives decision events in order', async () => {
  const eventBus = new EventBus();
  const { app } = createApp({ dbPath: ':memory:', eventBus });
  const server = app.listen(0);
  const { port } = server.address();

  const events = [];
  let req;
  const ssePromise = new Promise((resolve) => {
    req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const eventLine = part.split('\n').find((l) => l.startsWith('event:'));
          const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
          if (eventLine && dataLine) {
            events.push({
              type: eventLine.replace('event: ', ''),
              data: JSON.parse(dataLine.replace('data: ', '')),
            });
            if (events.length >= 2) {
              req.destroy();
              resolve();
            }
          }
        }
      });
    });
  });

  await new Promise((r) => setTimeout(r, 100));

  eventBus.publish('decision', { bundle_id: 'b-1', action: 'HIDE' });
  eventBus.publish('alarm', { type: 'agent_latency', message: 'slow' });

  await Promise.race([ssePromise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);

  assert.equal(events[0].type, 'decision');
  assert.equal(events[1].type, 'alarm');

  await new Promise((resolve) => server.close(resolve));
});
