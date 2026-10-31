// Interval-specific historical analytics for WinGo-like results.
// This is descriptive heuristic scoring, NOT a reliable prediction or betting system.
const PROFILES = {
  '30S': {
    name: 'WinGo 30-second Advanced 120+', historyWindow: 120,
    recentWindow: 12, minHistory: 20, backtestWindow: 120, transitionWeight: 1.35, recentWeight: 1.8, momentumWeight: 0.9,
    number: { overall: 0.65, recent: 1.8, transition: 1.35, momentum: 0.9, decay: 0.94 },
    size:   { overall: 0.55, recent: 2.0, transition: 1.65, momentum: 1.15, decay: 0.88 },
    color:  { overall: 0.6, recent: 1.7, transition: 1.2, momentum: 0.8, decay: 0.92 },
    strategy: 'short-window weighted trend + last-result transition',
    description: 'Up to 120 rounds; 12-round short trend and faster-decaying recent signal.'
  },
  '1M': {
    name: 'WinGo 1-minute Advanced 120+', historyWindow: 120,
    recentWindow: 36, minHistory: 30, backtestWindow: 120, transitionWeight: 0.55, recentWeight: 1.0, momentumWeight: 0.45,
    number: { overall: 1.25, recent: 1.0, transition: 0.55, momentum: 0.45, decay: 0.985 },
    size:   { overall: 1.35, recent: 1.05, transition: 0.65, momentum: 0.5, decay: 0.975 },
    color:  { overall: 1.2, recent: 1.0, transition: 0.5, momentum: 0.4, decay: 0.98 },
    strategy: 'long-window smoothed frequency + 36-round trend',
    description: 'Up to 120 rounds; balances long-run frequency with a slower 36-round trend.'
  }
};

function normalizeType(type) {
  return ['30S','30SEC','30SECONDS'].includes(String(type).toUpperCase()) ? '30S' : '1M';
}
function scoreCandidates(values, candidates, weights, recentWindow) {
  const all = values.slice(-120).map(String);
  const recent = all.slice(-recentWindow);
  const counts = new Map(), recentCounts = new Map(), weightedCounts = new Map();
  all.forEach((v, i) => {
    counts.set(v, (counts.get(v) || 0) + 1);
    // Newer observations receive greater weight; decay differs by interval and signal.
    const age = all.length - 1 - i;
    weightedCounts.set(v, (weightedCounts.get(v) || 0) + Math.pow(weights.decay, age));
  });
  recent.forEach(v => recentCounts.set(v, (recentCounts.get(v) || 0) + 1));
  const last = all.length ? all[all.length - 1] : null;
  const previous = all.length > 1 ? all[all.length - 2] : null;
  const transitionCounts = new Map(), pairCounts = new Map();
  for (let i = 0; i < all.length - 1; i++) {
    if (all[i] === last) transitionCounts.set(all[i + 1], (transitionCounts.get(all[i + 1]) || 0) + 1);
    if (i > 0 && all[i - 1] === previous && all[i] === last) {
      pairCounts.set(all[i + 1], (pairCounts.get(all[i + 1]) || 0) + 1);
    }
  }
  const transitionTotal = [...transitionCounts.values()].reduce((a,b)=>a+b,0);
  const pairTotal = [...pairCounts.values()].reduce((a,b)=>a+b,0);
  const scores = {};
  for (const c of candidates) {
    const k = String(c);
    const overall = (counts.get(k) || 0) / Math.max(1, all.length);
    const recentShare = (recentCounts.get(k) || 0) / Math.max(1, recent.length);
    const weightedShare = (weightedCounts.get(k) || 0) / Math.max(1, [...weightedCounts.values()].reduce((a,b)=>a+b,0));
    const transitionShare = (transitionCounts.get(k) || 0) / Math.max(1, transitionTotal);
    const pairShare = (pairCounts.get(k) || 0) / Math.max(1, pairTotal);
    const momentum = recentShare - overall;
    // Pair transition is intentionally small: a short sequence is noisy and sparse.
    scores[k] = Number((100 * (weights.overall * overall + weights.recent * recentShare +
      0.35 * weightedShare + weights.transition * transitionShare +
      0.2 * pairShare + weights.momentum * momentum)).toFixed(4));
  }
  // Deterministic tie-break: use stable candidate order, not randomness.
  const best = candidates.reduce((a,b) => scores[String(b)] > scores[String(a)] ? b : a, candidates[0]);
  return { value: best, scores, last, previous, sampleSize: all.length };
}
function predict(rows, gameType) {
  const type = normalizeType(gameType), profile = PROFILES[type];
  const recentRows = rows.slice(-profile.historyWindow);
  const numberResult = scoreCandidates(recentRows.map(r=>r.number), [0,1,2,3,4,5,6,7,8,9], profile.number, profile.recentWindow);
  const sizeResult = scoreCandidates(recentRows.map(r=>r.size), ['SMALL','BIG'], profile.size, profile.recentWindow);
  const colorValues = recentRows.map(r=>r.color).filter(Boolean);
  const colorResult = scoreCandidates(colorValues, ['GREEN','RED','VIOLET','RED + VIOLET','GREEN + VIOLET'], profile.color, profile.recentWindow);
  const diagnostics = result => ({ scores: result.scores, lastObserved: result.last, previousObserved: result.previous, sampleSize: result.sampleSize });
  return {
    profile: profile.name, strategy: profile.strategy, description: profile.description,
    profileConfig: {
      requestedHistory: 120, historyWindow: profile.historyWindow, recentWindow: profile.recentWindow,
      minHistory: profile.minHistory, backtestWindow: profile.backtestWindow,
      numberWeights: profile.number, sizeWeights: profile.size, colorWeights: profile.color
    },
    number: Number(numberResult.value), size: sizeResult.value, color: colorResult.value,
    observationsUsed: recentRows.length,
    numberLogic: diagnostics(numberResult), sizeLogic: diagnostics(sizeResult), colorLogic: diagnostics(colorResult),
    diagnostics: {
      numberScores: numberResult.scores, sizeScores: sizeResult.scores, colorScores: colorResult.scores,
      sufficientHistory: recentRows.length >= profile.minHistory
    },
    confidence: 'not-calibrated',
    note: 'Heuristic ranking from past outcomes only. Scores are not probabilities; independent/random outcomes may not be predictable and no future result or win is guaranteed.'
  };
}
function getProfile(gameType) { return PROFILES[normalizeType(gameType)]; }
module.exports = { predict, getProfile, PROFILES };
