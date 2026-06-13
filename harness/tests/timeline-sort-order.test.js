import test from 'node:test';
import assert from 'node:assert/strict';
import { orderFeedCells, sameCellOrder } from '../lib/timeline-sort-order.js';

function bundleId(cell) {
  return cell.id || null;
}

test('orderFeedCells ranks scored SHOW posts highest first', () => {
  const cells = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const decisions = new Map([
    ['a', { action: 'SHOW', signal_score: 72 }],
    ['b', { action: 'HIDE', signal_score: 90 }],
    ['c', { action: 'SHOW', signal_score: 91 }],
    ['d', { action: 'HOLD', signal_score: 55 }],
  ]);

  const ordered = orderFeedCells(cells, bundleId, decisions);
  assert.deepEqual(
    ordered.map((cell) => cell.id),
    ['c', 'a', 'b', 'd']
  );
});

test('orderFeedCells keeps original order when already sorted', () => {
  const cells = [{ id: 'high' }, { id: 'low' }, { id: 'none' }];
  const decisions = new Map([
    ['high', { action: 'SHOW', signal_score: 90 }],
    ['low', { action: 'SHOW', signal_score: 70 }],
  ]);

  const ordered = orderFeedCells(cells, bundleId, decisions);
  assert.equal(sameCellOrder(cells, ordered), true);
});

test('orderFeedCells breaks score ties by bundle id', () => {
  const cells = [{ id: 'z-post' }, { id: 'a-post' }];
  const decisions = new Map([
    ['z-post', { action: 'SHOW', signal_score: 80 }],
    ['a-post', { action: 'SHOW', signal_score: 80 }],
  ]);

  const ordered = orderFeedCells(cells, bundleId, decisions);
  assert.deepEqual(
    ordered.map((cell) => cell.id),
    ['a-post', 'z-post']
  );
});
