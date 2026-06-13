import { EventEmitter } from 'events';

export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  publish(type, data) {
    this.emit('event', { type, data, timestamp: new Date().toISOString() });
    this.emit(type, data);
  }
}

export function createSseHandler(eventBus) {
  const clients = new Set();

  eventBus.on('event', (event) => {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  });

  return {
    handler(req, res) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      clients.add(res);

      req.on('close', () => clients.delete(res));
    },
    clientCount: () => clients.size,
  };
}
