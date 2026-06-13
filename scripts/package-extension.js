#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXTENSION_DIR = join(ROOT, 'extension');
const DIST_DIR = join(ROOT, 'dist');

const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
const zipName = `signal-density-filter-extension-v${manifest.version}.zip`;
const zipPath = join(DIST_DIR, zipName);

mkdirSync(DIST_DIR, { recursive: true });

try {
  execFileSync('zip', ['-r', zipPath, '.', '-x', '*.DS_Store'], {
    cwd: EXTENSION_DIR,
    stdio: 'inherit',
  });
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Error: `zip` command not found. Install zip or run on macOS/Linux.');
    process.exit(1);
  }
  throw error;
}

console.log(`\nPackaged extension → ${zipPath}`);
console.log('Share the zip; recipients unzip and Load unpacked in chrome://extensions (Developer mode).');
