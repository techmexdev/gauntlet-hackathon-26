import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const harnessRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoTapesDir = join(harnessRoot, '..', 'tapes');

export function defaultTapesDir() {
  if (process.env.TAPES_DIR) {
    return resolve(process.env.TAPES_DIR);
  }
  return repoTapesDir;
}

export function resolveTapePath(tapeId, tapesDir = defaultTapesDir()) {
  return join(tapesDir, tapeId, 'posts.jsonl');
}

export function tapeExists(tapeId, tapesDir = defaultTapesDir()) {
  return existsSync(resolveTapePath(tapeId, tapesDir));
}
