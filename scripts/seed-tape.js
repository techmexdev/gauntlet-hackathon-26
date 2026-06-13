#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const corpus = yaml.load(readFileSync(join(ROOT, 'corpora/demo.yaml'), 'utf8'));

function pickTemplates(ratio, templates, count) {
  const n = Math.round(count * ratio);
  return Array.from({ length: n }, (_, i) => templates[i % templates.length]);
}

function authorByHandle(handle) {
  return corpus.authors.find((author) => author.handle === handle) || { handle, display: handle };
}

function serializePost(post) {
  return JSON.stringify({
    bundle_id: post.bundle_id,
    author_handle: post.author.handle,
    author_display_name: post.author.display,
    text: post.text,
    urls: post.urls,
    engagement: post.engagement,
    escalate: post.escalate ?? false,
    category_hint: post.category_hint || post.category || 'tool_beat',
    captured_at: new Date().toISOString(),
  });
}

function buildToolBeatPosts() {
  const beats = corpus.tool_beats;
  if (!beats) return [];

  const posts = [];
  for (const seed of beats.author_history?.seed_posts || []) {
    posts.push({
      ...seed,
      author: authorByHandle(seed.author),
      category: 'promo',
    });
  }

  for (const beat of [
    beats.author_history?.trigger_post,
    beats.url_trust?.trigger_post,
    beats.engagement_percentile?.trigger_post,
  ]) {
    if (!beat) continue;
    posts.push({
      ...beat,
      author: authorByHandle(beat.author),
      category: 'borderline',
      escalate: true,
    });
  }

  return posts;
}

const total = corpus.posts.total;
const generatedPosts = [
  ...pickTemplates(corpus.posts.bait_ratio, corpus.bait_templates, total).map((text, i) => ({
    category: 'bait',
    text,
    author: corpus.authors[2],
    bundle_id: `demo-bait-${i}`,
    escalate: false,
  })),
  ...pickTemplates(corpus.posts.signal_ratio, corpus.signal_templates, total).map((text, i) => ({
    category: 'signal',
    text,
    author: corpus.authors[0],
    bundle_id: `demo-signal-${i}`,
    escalate: false,
  })),
  ...pickTemplates(corpus.posts.borderline_ratio, corpus.borderline_templates, total).map((text, i) => ({
    category: 'borderline',
    text,
    author: corpus.authors[1],
    bundle_id: `demo-borderline-${i}`,
    escalate: true,
  })),
  ...pickTemplates(corpus.posts.personal_ratio, corpus.personal_templates, total).map((text, i) => ({
    category: 'personal',
    text,
    author: corpus.authors[3],
    bundle_id: `demo-personal-${i}`,
    escalate: false,
  })),
  ...pickTemplates(corpus.posts.promo_ratio, corpus.promo_templates, total).map((text, i) => ({
    category: 'promo',
    text,
    author: corpus.authors[4],
    bundle_id: `demo-promo-${i}`,
    escalate: false,
  })),
].slice(0, total);

const posts = [...buildToolBeatPosts(), ...generatedPosts];

const tapeDir = join(ROOT, 'tapes/demo-v1');
mkdirSync(tapeDir, { recursive: true });

const jsonl = posts.map(serializePost).join('\n');

writeFileSync(join(tapeDir, 'posts.jsonl'), jsonl + '\n');
writeFileSync(
  join(tapeDir, 'manifest.json'),
  JSON.stringify(
    {
      tape_id: 'demo-v1',
      created_at: new Date().toISOString(),
      post_count: posts.length,
      composition: corpus.posts,
      tool_beats: Object.keys(corpus.tool_beats || {}),
    },
    null,
    2
  )
);

console.log(`Seeded ${posts.length} posts to tapes/demo-v1/`);
