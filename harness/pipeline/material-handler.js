import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../lib/schemas.js';

const HTML_TAG_RE = /<[^>]+>/g;
const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function stripHtml(html) {
  if (!html) return '';
  return html.replace(HTML_TAG_RE, ' ').replace(/\s+/g, ' ').trim();
}

export function extractUrls(text) {
  const matches = text.match(URL_RE);
  return matches ? [...new Set(matches)] : [];
}

export function computeContentHash(text, authorHandle) {
  return createHash('sha256').update(`${authorHandle}:${text.trim().toLowerCase()}`).digest('hex').slice(0, 16);
}

export function normalizePost(raw, sessionId, ingestSource = 'live') {
  const text = stripHtml(raw.text || raw.html || '');
  const authorHandle = (raw.author_handle || raw.authorHandle || 'unknown').replace(/^@/, '');
  const bundleId = raw.bundle_id || uuidv4();
  const capturedAt = raw.captured_at || new Date().toISOString();

  const normalized = {
    bundle_id: bundleId,
    session_id: sessionId,
    ingest_source: ingestSource,
    author_handle: authorHandle,
    author_display_name: raw.author_display_name || raw.authorDisplayName || authorHandle,
    text,
    urls: extractUrls(text),
    engagement: raw.engagement || {},
    content_hash: computeContentHash(text, authorHandle),
    captured_at: capturedAt,
    posted_at: raw.posted_at || raw.postedAt || capturedAt,
  };

  const postId = raw.post_id || raw.postId;
  if (postId) normalized.post_id = postId;

  const { valid, errors } = validate('normalized-post', normalized);
  if (!valid) {
    throw new Error(`Normalization failed schema validation: ${JSON.stringify(errors)}`);
  }

  return normalized;
}

export function normalizeBatch(rawPosts, sessionId, ingestSource = 'live') {
  return rawPosts.map((raw) => normalizePost(raw, sessionId, ingestSource));
}
