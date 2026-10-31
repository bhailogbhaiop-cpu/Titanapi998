const fetch = globalThis.fetch;
const { analyzeSequence } = require('../lib/dragonx');
const { runWalkForward } = require('../lib/backtest');
const { predict: predictForInterval, getProfile } = require('../lib/interval-logic');
const { calculatePatternBank, patternCount: advancedPatternCount } = require('../lib/pattern-engine');

const BRANDING = { username: '@titan_mod', channelLink: 'https://t.me/+FhPjWwW93FwzNjA9' };

const ENDPOINTS = {
  '1M': [
    'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
    'https://draw.ar-lottery02.com/WinGo/WinGo_1M/GetHistoryIssuePage.json'
  ],
  '30S': [
    'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
  ]
};

function extractList(json) {
  const candidates = [
    json && json.data && json.data.list,
    json && json.data && json.data.records,
    json && json.data && json.data.history,
    json && json.list,
    json && json.records,
    json && json.history,
    json && json.data && Array.isArray(json.data) && json.data
  ];
  return candidates.find(Array.isArray) || [];
}

function getPeriod(row) {
  return row && (row.issueNumber ?? row.issue ?? row.period ?? row.periodNumber ?? row.issue_no);
}
function getNumber(row) {
  return row && (row.number ?? row.openNumber ?? row.result ?? row.winNumber ?? row.open_num);
}
function getColor(row, number) {
  if (row && row.color != null) return String(row.color);
  const n = Number(number);
  if (n === 0) return 'RED + VIOLET';
  if (n === 5) return 'GREEN + VIOLET';
  if ([1, 3, 7, 9].includes(n)) return 'GREEN';
  if ([2, 4, 6, 8].includes(n)) return 'RED';
  return null;
}
function getSize(number) {
  const n = Number(number);
  return Number.isFinite(n) ? (n >= 5 ? 'BIG' : 'SMALL') : null;
}
function nextIssue(issue) {
  if (issue == null) return null;
  const s = String(issue);
  if (!/^\d+$/.test(s)) return null;
  try { return (BigInt(s) + 1n).toString(); } catch (_) { return null; }
}

async function requestHistory(baseUrl, method) {
  const url = new URL(baseUrl);
  if (url.pathname.includes('30S')) url.searchParams.set('ts', String(Date.now()));
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (compatible; DRAGON-X-History-Client/2.1)',
    'Origin': 'https://www.tirangagame.top',
    'Referer': 'https://www.tirangagame.top/'
  };
  const options = { method, headers, signal: AbortSignal.timeout(9000) };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    url.searchParams.set('pageSize', '120');
    url.searchParams.set('pageNo', '1');
    options.body = JSON.stringify({ pageSize: 120, pageNo: 1 });
  } else {
    url.searchParams.set('pageSize', '120');
    url.searchParams.set('pageNo', '1');
  }
  const response = await fetch(url.toString(), options);
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const trimmed = text.trim();
  if (!response.ok) throw new Error(`HTTP ${response.status}; content-type=${contentType}; body=${trimmed.slice(0, 180)}`);
  if (!trimmed || trimmed.startsWith('<') || /text\/html/i.test(contentType)) {
    throw new Error(`HTML/non-JSON response; HTTP ${response.status}; content-type=${contentType}; body=${trimmed.slice(0, 180)}`);
  }
  let json;
  try { json = JSON.parse(trimmed); }
  catch (_) { throw new Error(`Invalid JSON; HTTP ${response.status}; content-type=${contentType}; body=${trimmed.slice(0, 180)}`); }
  const list = extractList(json);
  if (!list.length) throw new Error(`JSON received but history list was empty/unrecognized; keys=${Object.keys(json || {}).join(',')}`);
  return { json, list, source: url.origin + url.pathname, method, status: response.status };
}


// Process-local prediction ledger. A deployment with ephemeral/serverless instances
// may need a database to preserve this ledger across cold starts.
const predictionLedger = new Map();
function confidenceFromScores(scores, chosen) {
  const values = Object.values(scores || {}).map(Number).filter(Number.isFinite);
  if (!values.length) return 0;
  const min = Math.min(...values);
  const shifted = values.map(v => v - min + 0.000001);
  const total = shifted.reduce((a,b)=>a+b,0) || 1;
  const key = String(chosen);
  const keys = Object.keys(scores || {});
  const index = keys.indexOf(key);
  return Number((index < 0 ? 0 : shifted[index] / total * 100).toFixed(1));
}
function updateLedger(game, validRows, current) {
  const ledger = predictionLedger.get(game) || [];
  const actualByPeriod = new Map(validRows.map(r => [String(r.period), r]));
  for (const item of ledger) {
    const actual = actualByPeriod.get(String(item.TargetPeriod));
    if (actual && item.status === 'PENDING') {
      item.actual = { number: actual.number, size: actual.size, color: actual.color };
      if (Number(actual.number) === Number(item.prediction.number)) item.status = 'JACKPOT';
      else if (actual.size === item.prediction.size || actual.color === item.prediction.color) item.status = 'WIN';
      else item.status = 'LOSS';
    }
  }
  const existing = ledger.find(item => String(item.TargetPeriod) === String(current.TargetPeriod));
  if (!existing) ledger.unshift({ ...current, status: 'PENDING', actual: null });
  else Object.assign(existing, current);
  const trimmed = ledger.slice(0, 50);
  predictionLedger.set(game, trimmed);
  return trimmed;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use GET or POST' });

  const rawType = String((req.query && req.query.type) || '1M').trim().toUpperCase();
  const typeAliases = { '30S': '30S', '30SEC': '30S', '30SECS': '30S', '30SECOND': '30S', '30SECONDS': '30S', '1M': '1M', '1MIN': '1M', '1MINUTE': '1M', '60S': '1M' };
  const gameType = typeAliases[rawType];
  if (!gameType) return res.status(400).json({ success: false, error: 'Invalid type. Use type=30S or type=1M.', supportedTypes: ['30S', '1M'] });
  let fetched = null;
  const attempts = [];
  for (const endpoint of ENDPOINTS[gameType]) {
    for (const method of ['GET', 'POST']) {
      try { fetched = await requestHistory(endpoint, method); break; }
      catch (error) { attempts.push({ endpoint: new URL(endpoint).origin, method, error: String(error.message).slice(0, 260) }); }
    }
    if (fetched) break;
  }
  if (!fetched) {
    return res.status(502).json({
      success: false,
      error: 'Unable to fetch WinGo history as JSON. Upstream may be blocking this host or returning an HTML security page.',
      game: gameType === '30S' ? 'WinGo 30Sec' : 'WinGo 1Min',
      attempts,
      branding: { top: BRANDING, bottom: BRANDING }
    });
  }

  const history = fetched.list.filter(row => getPeriod(row) != null && getNumber(row) != null);
  if (!history.length) return res.status(502).json({ success: false, error: 'JSON response had no recognizable period/number fields.', source: fetched.source });
  const latest = history[0];
  const latestPeriod = getPeriod(latest);
  const latestNumber = Number(getNumber(latest));
  const chronological = [...history].reverse();
  const valid = chronological.map(row => ({ period: String(getPeriod(row)), number: Number(getNumber(row)), size: getSize(getNumber(row)), color: getColor(row, getNumber(row)) })).filter(row => Number.isFinite(row.number) && row.size);
  const sequence = valid.map(row => row.size);
  const intervalProfile = getProfile(gameType);
  const engineResult = analyzeSequence(sequence.slice(-intervalProfile.historyWindow), { periods: valid.slice(-intervalProfile.historyWindow).map(row => row.period) });

  const numberCounts = {};
  const sizeCounts = { BIG: 0, SMALL: 0 };
  const colorCounts = {};
  for (const row of valid) {
    numberCounts[row.number] = (numberCounts[row.number] || 0) + 1;
    sizeCounts[row.size]++;
    for (const color of String(row.color || 'UNKNOWN').split(' + ')) colorCounts[color] = (colorCounts[color] || 0) + 1;
  }
  const total = valid.length || 1;
  const toShares = counts => Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count, share: Number((count / total).toFixed(4)) }]));
  const historicalAnalytics = {
    sampleSize: valid.length,
    numberDistribution: toShares(numberCounts),
    sizeDistribution: toShares(sizeCounts),
    colorDistribution: toShares(colorCounts),
    latestWindow: {
      last20: valid.slice(-20).map(row => ({ period: row.period, number: row.number, size: row.size, color: row.color })),
      last50: valid.slice(-50).map(row => ({ period: row.period, number: row.number, size: row.size, color: row.color }))
    },
    dataQuality: {
      validRows: valid.length,
      droppedRows: fetched.list.length - valid.length,
      duplicatePeriods: [...new Set(valid.map(row => row.period).filter((period, i, all) => all.indexOf(period) !== i))]
    }
  };
  const predictionAudit = runWalkForward(valid, { minHistory: intervalProfile.minHistory, windowSize: intervalProfile.backtestWindow });
  predictionAudit.intervalProfile = intervalProfile.name;

  // Each game interval has its own independently tuned historical heuristic.
  const intervalPrediction = predictForInterval(valid, gameType);
  const advancedPatterns = calculatePatternBank(valid, gameType);
  // Combine the interval's number-specific pattern bank with the original interval scorer.
  // This remains a heuristic ranking, not a guaranteed forecast.
  const safePredictedNumber = Number.isInteger(advancedPatterns.numberRanking[0]?.value)
    ? advancedPatterns.numberRanking[0].value
    : intervalPrediction.number;
  const predictedColor = getColor(null, safePredictedNumber);
  const predictedSize = getSize(safePredictedNumber);

  const numberScores = Object.fromEntries((advancedPatterns.numberRanking || []).map(x => [String(x.value), x.score]));
  const prediction = {
    number: safePredictedNumber,
    size: predictedSize,
    color: predictedColor
  };
  const responseCore = {
    success: true,
    branding: { top: BRANDING, bottom: BRANDING },
    game: gameType === '30S' ? 'WinGo 30Sec' : 'WinGo 1Min',
    engine: 'DRAGON-X-880',
    TargetPeriod: nextIssue(latestPeriod),
    prediction,
    analysis: {
      patternsAnalyzed: advancedPatterns.patternsEvaluated,
      numberConfidence: confidenceFromScores(numberScores, safePredictedNumber),
      sizeConfidence: confidenceFromScores(intervalPrediction.sizeLogic.scores, predictedSize),
      colorConfidence: confidenceFromScores(intervalPrediction.colorLogic.scores, predictedColor)
    }
  };
  const predictionHistory = updateLedger(gameType, valid, responseCore);
  return res.status(200).json({
    ...responseCore,
    result: predictionHistory[0]?.status || 'PENDING',
    history: predictionHistory
  });
};
