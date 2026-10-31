// Retrospective walk-forward audit. Uses only outcomes before each tested round.
// This is a diagnostic of historical fit, not a reliable forecast of random draws.
function majority(values, fallback) {
  if (!values.length) return fallback;
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  let best = fallback, bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) { best = value; bestCount = count; }
  }
  return best;
}
function runWalkForward(rows, options = {}) {
  const minHistory = Math.max(10, Number(options.minHistory) || 20);
  const windowSize = Math.max(minHistory, Math.min(200, Number(options.windowSize) || 60));
  const tested = [];
  for (let i = minHistory; i < rows.length; i++) {
    const prior = rows.slice(Math.max(0, i - windowSize), i);
    const actual = rows[i];
    const predictedNumber = Number(majority(prior.map(r => r.number), '0'));
    const predictedSize = majority(prior.map(r => r.size), 'SMALL');
    const predictedColor = majority(prior.map(r => r.color), 'UNKNOWN');
    tested.push({
      period: String(actual.period),
      actual: { number: actual.number, size: actual.size, color: actual.color },
      evaluated: {
        number: { result: predictedNumber === actual.number ? 'HIT' : 'MISS', predicted: predictedNumber },
        size: { result: predictedSize === actual.size ? 'HIT' : 'MISS', predicted: predictedSize },
        color: { result: predictedColor === actual.color ? 'HIT' : 'MISS', predicted: predictedColor }
      }
    });
  }
  const summarize = key => {
    const hits = tested.filter(r => r.evaluated[key].result === 'HIT').length;
    const misses = tested.length - hits;
    return { tested: tested.length, hits, misses, hitRate: tested.length ? Number((hits / tested.length).toFixed(4)) : null };
  };
  const recent = tested.slice(-30).reverse();
  return {
    mode: 'retrospective_walk_forward',
    method: 'rolling-window historical majority baseline',
    minHistory, windowSize,
    totalRoundsEvaluated: tested.length,
    metrics: { number: summarize('number'), size: summarize('size'), color: summarize('color') },
    winLossHistory: recent.map(r => ({ period: r.period, actual: r.actual, number: r.evaluated.number, size: r.evaluated.size, color: r.evaluated.color })),
    note: 'HIT/MISS labels are retrospective statistical comparisons only, not betting wins or guarantees. Random outcomes may not be predictable; past fit does not imply future accuracy.'
  };
}
module.exports = { runWalkForward };
