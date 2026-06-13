import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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
  formatMetricsSummary,
} from '../lib/session-metrics.js';

test('empty metrics return null rates and collecting probe', () => {
  const m = createSessionMetrics();
  assert.equal(computeFilterRate(m), null);
  assert.equal(computeSnr(m), null);
  const probe = ae1ProbeStatus(m);
  assert.equal(probe.state, 'collecting');
  assert.equal(probe.total, 0);
});

test('filter rate and SNR for mixed decisions', () => {
  const m = createSessionMetrics();
  for (let i = 0; i < 7; i += 1) applyDecision(m, 'HIDE');
  for (let i = 0; i < 2; i += 1) applyDecision(m, 'BLOCK');
  applyDecision(m, 'SHOW');
  assert.equal(m.total, 10);
  assert.equal(computeFilterRate(m), 0.9);
  assert.equal(computeSnr(m), 0.1);
});

test('AE1 ready at 70% filter rate on 30 posts', () => {
  const m = createSessionMetrics();
  for (let i = 0; i < 21; i += 1) applyDecision(m, 'HIDE');
  for (let i = 0; i < 9; i += 1) applyDecision(m, 'SHOW');
  assert.equal(m.total, AE1_MIN_POSTS);
  assert.equal(computeFilterRate(m), AE1_TARGET_RATE);
  const probe = ae1ProbeStatus(m);
  assert.equal(probe.state, 'ready');
});

test('AE1 below when filter rate under target', () => {
  const m = createSessionMetrics();
  for (let i = 0; i < 15; i += 1) applyDecision(m, 'HIDE');
  for (let i = 0; i < 15; i += 1) applyDecision(m, 'SHOW');
  const probe = ae1ProbeStatus(m);
  assert.equal(probe.state, 'below');
  assert.equal(probe.filterRate, 0.5);
});

test('AE1 collecting before minimum posts', () => {
  const m = createSessionMetrics();
  for (let i = 0; i < AE1_MIN_POSTS - 1; i += 1) applyDecision(m, 'HIDE');
  assert.equal(ae1ProbeStatus(m).state, 'collecting');
});

test('oversight resolution counts toward metrics', () => {
  const m = createSessionMetrics();
  applyOversight(m, 'SHOW');
  assert.equal(m.show, 1);
  assert.equal(m.total, 1);
});

test('unknown action ignored', () => {
  const m = createSessionMetrics();
  applyDecision(m, 'PENDING');
  assert.equal(m.total, 0);
});

test('formatMetricsSummary includes labels', () => {
  const m = createSessionMetrics();
  applyDecision(m, 'HIDE');
  applyDecision(m, 'SHOW');
  const summary = formatMetricsSummary(m);
  assert.equal(summary.filtered, 1);
  assert.equal(summary.quieted, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.filterRateLabel, '50%');
  assert.equal(summary.quietRateLabel, '50%');
  assert.equal(summary.snrLabel, '50%');
});

test('quiet rate includes HOLD decisions', () => {
  const m = createSessionMetrics();
  for (let i = 0; i < 8; i += 1) applyDecision(m, 'HOLD');
  assert.equal(computeQuietRate(m), 1);
  assert.equal(computeFilterRate(m), 0);
  const summary = formatMetricsSummary(m);
  assert.equal(summary.quietRateLabel, '100%');
  assert.equal(summary.filterRateLabel, '0%');
});

test('metricsFromCounts rebuilds session metrics', () => {
  const m = metricsFromCounts({ show: 10, hide: 208, block: 280, hold: 612 });
  assert.equal(m.total, 1110);
  assert.equal(computeQuietRate(m), 1100 / 1110);
  assert.equal(computeFilterRate(m), (208 + 280) / 1110);
});
