import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { defaultTapesDir } from '../lib/tapes-dir.js';

export function createTapeRecorder(tapeId, tapesDir = defaultTapesDir()) {
  const dir = join(tapesDir, tapeId);
  mkdirSync(dir, { recursive: true });
  const postsPath = join(dir, 'posts.jsonl');

  return {
    tapeId,
    record(normalized) {
      appendFileSync(postsPath, JSON.stringify(normalized) + '\n');
    },
    writeManifest(meta) {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(meta, null, 2));
    },
  };
}
