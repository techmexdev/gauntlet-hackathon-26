const CTA_PATTERNS = [
  /\b(follow|subscribe|sign up|click here|link in bio|dm me)\b/i,
  /\b(giveaway|airdrop|free)\b/i,
];

const BAIT_PATTERNS = [
  /\b(like if|retweet if|you won't believe|hot take)\b/i,
  /🧵/,
  /(!){3,}/,
];

export function scorePost(normalized) {
  const text = normalized.text || '';
  let score = 50;
  const reasons = [];

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount >= 30) {
    score += 15;
    reasons.push('high information density');
  } else if (wordCount < 10) {
    score -= 20;
    reasons.push('very short content');
  }

  const hasCitation = /https?:\/\/[^\s]+/.test(text) || /\b(according to|reported by|source:)\b/i.test(text);
  if (hasCitation) {
    score += 12;
    reasons.push('citation or source reference');
  }

  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  const emojiDensity = wordCount > 0 ? emojiCount / wordCount : emojiCount;
  if (emojiDensity > 0.15) {
    score -= 25;
    reasons.push('high emoji density');
  }

  for (const pattern of CTA_PATTERNS) {
    if (pattern.test(text)) {
      score -= 20;
      reasons.push('call-to-action pattern');
      break;
    }
  }

  for (const pattern of BAIT_PATTERNS) {
    if (pattern.test(text)) {
      score -= 30;
      reasons.push('engagement bait pattern');
      break;
    }
  }

  if (/\b(breaking|analysis|report|data shows|research)\b/i.test(text)) {
    score += 10;
    reasons.push('informational keywords');
  }

  score = Math.max(0, Math.min(100, score));

  let category = 'personal';
  if (score < 25) category = 'engagement_bait';
  else if (score < 40) category = 'noise';
  else if (score >= 70 && hasCitation) category = 'news';
  else if (score >= 55) category = 'analysis';
  else if (CTA_PATTERNS.some((p) => p.test(text))) category = 'promo';

  const confidence = wordCount >= 20 ? 0.75 : 0.55;
  const escalate = score >= 30 && score <= 60;

  return {
    signal_score: score,
    category,
    reasons: reasons.length ? reasons : ['baseline heuristic score'],
    confidence,
    escalate,
  };
}
