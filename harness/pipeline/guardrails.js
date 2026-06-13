import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../config/guardrails.yaml');

let cachedConfig = null;

export function loadGuardrailConfig() {
  if (!cachedConfig) {
    cachedConfig = yaml.load(readFileSync(CONFIG_PATH, 'utf8'));
  }
  return cachedConfig;
}

export function resetGuardrailConfig() {
  cachedConfig = null;
}

/** Convert YAML patterns with (?i) prefix to JS RegExp. */
export function compilePattern(pattern) {
  let source = pattern;
  let flags = '';
  if (source.startsWith('(?i)')) {
    source = source.slice(4);
    flags = 'i';
  }
  return new RegExp(source, flags);
}

export function evaluateGuardrails(normalized, store) {
  const config = loadGuardrailConfig();
  const reasons = [];

  if ((normalized.text || '').trim().length < config.min_text_length) {
    reasons.push('GUARDRAIL_TOO_SHORT');
  }

  const duplicate = store.findRecentDuplicate(normalized.content_hash, config.duplicate_window_hours);
  if (duplicate && duplicate.bundle_id !== normalized.bundle_id) {
    reasons.push('GUARDRAIL_DUPLICATE');
  }

  if (config.blocked_accounts.includes(normalized.author_handle)) {
    reasons.push('GUARDRAIL_BLOCKED_ACCOUNT');
  }

  for (const pattern of config.engagement_bait_patterns) {
    const re = compilePattern(pattern);
    if (re.test(normalized.text)) {
      reasons.push('GUARDRAIL_ENGAGEMENT_BAIT');
      break;
    }
  }

  for (const domain of config.spam_domains) {
    if (normalized.urls.some((url) => url.includes(domain))) {
      reasons.push('GUARDRAIL_SPAM_DOMAIN');
      break;
    }
  }

  const postedAt = new Date(normalized.posted_at || normalized.captured_at);
  const ageHours = (Date.now() - postedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > config.stale_post_hours) {
    reasons.push('GUARDRAIL_STALE_POST');
  }

  if (reasons.length > 0) {
    return { passed: false, action: 'BLOCK', reasonCodes: reasons };
  }

  return { passed: true, reasonCodes: [] };
}
