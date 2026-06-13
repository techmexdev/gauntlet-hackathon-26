export function lookupAuthorHistory(input, { store, sessionId }) {
  const authorHandle = input?.author_handle;
  if (!authorHandle || !store || !sessionId) {
    return {
      post_count: 0,
      avg_signal_score: null,
      hide_rate: 0,
      recent_categories: [],
    };
  }

  const stats = store.getAuthorDecisionStats(sessionId, authorHandle);
  return {
    post_count: stats.postCount,
    avg_signal_score: stats.avgSignalScore,
    hide_rate: stats.hideRate,
    recent_categories: stats.recentCategories,
  };
}
