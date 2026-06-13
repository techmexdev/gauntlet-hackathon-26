/** Keep formulas in sync with harness/lib/session-metrics.js */
(() => {
  const AE1_MIN_POSTS = 30;
  const AE1_TARGET_RATE = 0.7;

  function createSessionMetrics() {
    return { show: 0, hide: 0, block: 0, hold: 0, total: 0 };
  }

  function normalizeAction(action) {
    return String(action || '').toUpperCase();
  }

  function applyDecision(metrics, action) {
    const a = normalizeAction(action);
    if (!a) return metrics;
    switch (a) {
      case 'SHOW':
        metrics.show += 1;
        break;
      case 'HIDE':
        metrics.hide += 1;
        break;
      case 'BLOCK':
        metrics.block += 1;
        break;
      case 'HOLD':
        metrics.hold += 1;
        break;
      default:
        return metrics;
    }
    metrics.total += 1;
    return metrics;
  }

  function applyOversight(metrics, resolution) {
    return applyDecision(metrics, resolution);
  }

  function computeFilterRate(metrics) {
    if (!metrics?.total) return null;
    return (metrics.hide + metrics.block) / metrics.total;
  }

  function computeQuietRate(metrics) {
    if (!metrics?.total) return null;
    return (metrics.hide + metrics.block + metrics.hold) / metrics.total;
  }

  function metricsFromCounts(counts = {}) {
    const metrics = createSessionMetrics();
    metrics.show = counts.show ?? 0;
    metrics.hide = counts.hide ?? 0;
    metrics.block = counts.block ?? 0;
    metrics.hold = counts.hold ?? 0;
    metrics.total = metrics.show + metrics.hide + metrics.block + metrics.hold;
    return metrics;
  }

  function computeSnr(metrics) {
    if (!metrics?.total) return null;
    return metrics.show / metrics.total;
  }

  function ae1ProbeStatus(metrics) {
    const total = metrics?.total ?? 0;
    if (total < AE1_MIN_POSTS) {
      return {
        state: 'collecting',
        total,
        required: AE1_MIN_POSTS,
        filterRate: computeFilterRate(metrics),
      };
    }
    const filterRate = computeFilterRate(metrics);
    const ready = filterRate != null && filterRate >= AE1_TARGET_RATE;
    return {
      state: ready ? 'ready' : 'below',
      total,
      required: AE1_MIN_POSTS,
      filterRate,
      targetRate: AE1_TARGET_RATE,
    };
  }

  function formatPercent(rate) {
    if (rate == null || Number.isNaN(rate)) return '—';
    return `${Math.round(rate * 100)}%`;
  }

  function formatMetricsSummary(metrics) {
    const filterRate = computeFilterRate(metrics);
    const quietRate = computeQuietRate(metrics);
    const snr = computeSnr(metrics);
    const filtered = (metrics?.hide ?? 0) + (metrics?.block ?? 0);
    const quieted = filtered + (metrics?.hold ?? 0);
    return {
      filtered,
      quieted,
      total: metrics?.total ?? 0,
      show: metrics?.show ?? 0,
      hide: metrics?.hide ?? 0,
      block: metrics?.block ?? 0,
      hold: metrics?.hold ?? 0,
      filterRate,
      filterRateLabel: formatPercent(filterRate),
      quietRate,
      quietRateLabel: formatPercent(quietRate),
      snr,
      snrLabel: formatPercent(snr),
      ae1: ae1ProbeStatus(metrics),
    };
  }

  window.sdfSessionMetrics = {
    AE1_MIN_POSTS,
    AE1_TARGET_RATE,
    createSessionMetrics,
    applyDecision,
    applyOversight,
    computeFilterRate,
    computeQuietRate,
    metricsFromCounts,
    computeSnr,
    ae1ProbeStatus,
    formatPercent,
    formatMetricsSummary,
  };
})();
