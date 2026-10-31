const assert=require("assert");
const {analyzeSequence,patternCount}=require("./lib/dragonx");
const {runWalkForward}=require("./lib/backtest");
const r=analyzeSequence(["BIG","SMALL","BIG","SMALL","BIG","BIG","SMALL","RED"]);
assert(r.pattern_count>=120, "expected at least 120 patterns");
assert.equal(r.observations,8);
assert(r.patterns.some(p=>p.name==="Transition matrix"));
assert(r.patterns.some(p=>p.name==="Dragon motif frequency (4)"));
assert(patternCount>=120);
const rows=Array.from({length:40},(_,i)=>({period:String(i+1),number:i%10,size:i%10>=5?"BIG":"SMALL",color:i%2?"GREEN":"RED"}));
const audit=runWalkForward(rows,{minHistory:20,windowSize:30});
assert.equal(audit.totalRoundsEvaluated,20);
assert.equal(audit.winLossHistory.length,20);
assert(audit.metrics.number.hits + audit.metrics.number.misses === 20);
console.log("PASS: "+patternCount+" patterns analyzed; walk-forward audit verified.");

const { getProfile, predict } = require("./lib/interval-logic");
const p30 = getProfile("30S");
const p1m = getProfile("1M");
assert.equal(p30.historyWindow, 120, "30S must analyze up to 120 rounds");
assert.equal(p1m.historyWindow, 120, "1M must analyze up to 120 rounds");
assert.notEqual(p30.recentWindow, p1m.recentWindow, "30S and 1M must use separate recent windows");
assert.notEqual(p30.transitionWeight, p1m.transitionWeight, "30S and 1M must use separate transition weights");
const sample = Array.from({length:80},(_,i)=>({number:i%10,size:i%10>=5?"BIG":"SMALL",color:i%2?"GREEN":"RED"}));
assert.equal(predict(sample,"30S").observationsUsed,80);
assert.equal(predict(sample,"1M").observationsUsed,80);
assert.notEqual(predict(sample,"30S").strategy, predict(sample,"1M").strategy);
assert(predict(sample,"30S").diagnostics.numberScores);
assert(predict(sample,"30S").numberLogic.scores, "separate number diagnostics required");
assert(predict(sample,"30S").sizeLogic.scores, "separate size diagnostics required");
assert.notDeepEqual(predict(sample,"30S").profileConfig.numberWeights, predict(sample,"1M").profileConfig.numberWeights);
assert.notDeepEqual(predict(sample,"30S").profileConfig.sizeWeights, predict(sample,"1M").profileConfig.sizeWeights);
assert.equal(predict(sample,"30S").number, Number(predict(sample,"30S").number));
assert(["SMALL","BIG"].includes(predict(sample,"1M").size));
console.log("PASS: interval-specific 30S/1M logic profiles verified.");


const { getPatternCatalog, calculatePatternBank, patternCount: advancedCount } = require("./lib/pattern-engine");
assert.equal(advancedCount, 880, "advanced catalog must contain exactly 880 patterns");
assert.equal(getPatternCatalog().length, 880);
for (const bank of ["trend-30s", "trend-1m", "number-30s", "number-1m"]) {
  assert.equal(getPatternCatalog().filter(p => p.bank === bank).length, 220, `${bank} must have 220 patterns`);
}
const advanced30 = calculatePatternBank(sample, "30S");
const advanced1m = calculatePatternBank(sample, "1M");
assert.equal(advanced30.patternsEvaluated, 440);
assert.equal(advanced1m.patternsEvaluated, 440);
assert.equal(advanced30.numberRanking.length, 10);
assert.equal(advanced1m.numberRanking.length, 10);
assert.notDeepEqual(advanced30.banks["number-30s"].scores, advanced1m.banks["number-1m"].scores, "interval banks should use distinct windows");
console.log("PASS: DRAGON-X 880 catalog verified; 220 patterns per bank, 440 calculations per interval.");
