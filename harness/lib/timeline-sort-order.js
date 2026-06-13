export function orderFeedCells(cells, getBundleId, decisions) {
  const scored = [];
  const rest = [];

  for (const cell of cells) {
    const bundleId = getBundleId(cell);
    const decision = bundleId ? decisions.get(bundleId) : null;
    if (decision?.action === 'SHOW' && decision.signal_score != null) {
      scored.push({ cell, score: decision.signal_score, bundleId });
    } else {
      rest.push(cell);
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bundleId.localeCompare(b.bundleId);
  });

  return [...scored.map((entry) => entry.cell), ...rest];
}

export function sameCellOrder(current, target) {
  if (current.length !== target.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i] !== target[i]) return false;
  }
  return true;
}
