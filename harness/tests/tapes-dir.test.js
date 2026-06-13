import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chdir, cwd } from 'process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defaultTapesDir, tapeExists } from '../lib/tapes-dir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessDir = join(__dirname, '..');

test('defaultTapesDir resolves repo tapes regardless of cwd', () => {
  const previous = cwd();
  try {
    chdir(harnessDir);
    assert.equal(tapeExists('demo-v1'), true);
    assert.ok(defaultTapesDir().endsWith(`${join('tapes')}`));
  } finally {
    chdir(previous);
  }
});
