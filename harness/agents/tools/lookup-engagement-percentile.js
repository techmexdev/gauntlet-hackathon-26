import { HIGH_REACH_LIKES } from '../../pipeline/decision.js';

export function lookupEngagementPercentile(input, { store, sessionId }) {
  const likes = Number(input?.likes) || 0;

  if (!store || !sessionId) {
    return {
      likes,
      session_median_likes: null,
      percentile: null,
      is_high_reach: likes >= HIGH_REACH_LIKES,
    };
  }

  const distribution = store.getSessionEngagementLikes(sessionId);
  if (!distribution.length) {
    return {
      likes,
      session_median_likes: null,
      percentile: null,
      is_high_reach: likes >= HIGH_REACH_LIKES,
    };
  }

  const sorted = [...distribution].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const sessionMedian =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const belowOrEqual = sorted.filter((value) => value <= likes).length;
  const percentile = Math.round((belowOrEqual / sorted.length) * 100);

  return {
    likes,
    session_median_likes: sessionMedian,
    percentile,
    is_high_reach: likes >= HIGH_REACH_LIKES,
  };
}
