'use strict';
// 880 deterministic, distinct historical feature calculations across four independent banks.
// These are heuristic rankings, not calibrated probabilities or guaranteed forecasts.
const METRICS = ['frequency','recency','exponential_decay','momentum','transition','pair_transition','streak_affinity','gap_pressure','alternation_context','window_drift'];
const WINDOWS = {
  'trend-30s': Array.from({length:22},(_,i)=>i+3),
  'trend-1m': Array.from({length:22},(_,i)=>i+8),
  'number-30s': Array.from({length:22},(_,i)=>i+3),
  'number-1m': Array.from({length:22},(_,i)=>i+8)
};
const BANKS = [
  {id:'trend-30s',interval:'30S',kind:'trend',label:'30-second trend'},
  {id:'trend-1m',interval:'1M',kind:'trend',label:'1-minute trend'},
  {id:'number-30s',interval:'30S',kind:'number',label:'30-second number'},
  {id:'number-1m',interval:'1M',kind:'number',label:'1-minute number'}
];
const catalog = BANKS.flatMap(bank => WINDOWS[bank.id].flatMap(window => METRICS.map(metric => ({
  id:`${bank.id}:${metric}:w${window}`, bank:bank.id, interval:bank.interval, kind:bank.kind,
  window, metric, name:`${bank.label} / ${metric.replace(/_/g,' ')} / window ${window}`
}))));
function norm(v) { return String(v ?? '').toUpperCase(); }
function getSeries(rows, bank) {
  if (bank.kind === 'number') return rows.map(r => String(r.number));
  return rows.map(r => norm(r.size || (Number(r.number)>=5?'BIG':'SMALL')));
}
function scoreOne(series, candidates, pattern) {
  const a=series.slice(-pattern.window), n=a.length, last=a[n-1], prev=a[n-2];
  const counts=new Map(), recent=new Map(), weighted=new Map(), transitions=new Map(), pairs=new Map(), gaps=new Map();
  a.forEach((v,i)=>{
    counts.set(v,(counts.get(v)||0)+1);
    const age=n-1-i; weighted.set(v,(weighted.get(v)||0)+Math.pow(pattern.metric==='exponential_decay'?0.82:0.94,age));
    if(i>=Math.max(0,n-5)) recent.set(v,(recent.get(v)||0)+1);
    if(i<n-1 && v===last) transitions.set(a[i+1],(transitions.get(a[i+1])||0)+1);
    if(i<n-2 && a[i]===prev && a[i+1]===last) pairs.set(a[i+2],(pairs.get(a[i+2])||0)+1);
  });
  let run=0; for(let i=n-1;i>=0&&a[i]===last;i--)run++;
  const scores={};
  for(const c of candidates){const k=String(c), freq=(counts.get(k)||0)/Math.max(1,n), rec=(recent.get(k)||0)/Math.min(5,n), wt=(weighted.get(k)||0)/Math.max(1,[...weighted.values()].reduce((x,y)=>x+y,0)), trans=(transitions.get(k)||0)/Math.max(1,[...transitions.values()].reduce((x,y)=>x+y,0)), pair=(pairs.get(k)||0)/Math.max(1,[...pairs.values()].reduce((x,y)=>x+y,0));
    const firstHalf=a.slice(0,Math.floor(n/2)), secondHalf=a.slice(Math.floor(n/2));
    const f1=firstHalf.filter(v=>v===k).length/Math.max(1,firstHalf.length), f2=secondHalf.filter(v=>v===k).length/Math.max(1,secondHalf.length);
    let gap=n; for(let i=n-1;i>=0;i--)if(a[i]===k){gap=n-1-i;break;}
    let s=0; switch(pattern.metric){
      case 'frequency': s=freq; break; case 'recency': s=rec; break; case 'exponential_decay': s=wt; break;
      case 'momentum': s=0.5+(f2-freq); break; case 'transition': s=trans; break; case 'pair_transition': s=pair; break;
      case 'streak_affinity': s=freq+(k===last?run/Math.max(1,n):0); break;
      case 'gap_pressure': s=gap/Math.max(1,n); break;
      case 'alternation_context': s=(k!==last?1:0)*0.5+freq*0.5; break;
      case 'window_drift': s=0.5+(f2-f1); break;
    }
    // deterministic, small smoothing avoids undefined scores on sparse samples
    scores[k]=Number((s+0.001).toFixed(8));
  }
  return scores;
}
function calculatePatternBank(rows, gameType) {
  const interval=['30S','30SEC','30SECONDS'].includes(String(gameType).toUpperCase())?'30S':'1M';
  const active=BANKS.filter(b=>b.interval===interval), result={interval, totalPatterns:440, banks:{}, numberScores:Object.fromEntries(Array.from({length:10},(_,i)=>[i,0])), trendScores:{BIG:0,SMALL:0}, patternsEvaluated:0};
  for(const bank of active){
    const series=getSeries(rows,bank), candidates=bank.kind==='number'?[0,1,2,3,4,5,6,7,8,9]:['SMALL','BIG'];
    const patterns=catalog.filter(p=>p.bank===bank.id); const aggregate=Object.fromEntries(candidates.map(c=>[c,0]));
    for(const p of patterns){const scores=scoreOne(series,candidates,p); for(const c of candidates)aggregate[c]+=scores[String(c)]; result.patternsEvaluated++;}
    for(const c of candidates)aggregate[c]=Number((aggregate[c]/Math.max(1,patterns.length)).toFixed(8));
    result.banks[bank.id]={patternCount:patterns.length,windowRange:[Math.min(...patterns.map(p=>p.window)),Math.max(...patterns.map(p=>p.window))],metrics:METRICS.length,scores:aggregate};
    if(bank.kind==='number') for(const c of candidates)result.numberScores[c]+=aggregate[c];
    else for(const c of candidates)result.trendScores[c]+=aggregate[c];
  }
  const top=(scores)=>Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([value,score])=>({value:Number.isNaN(Number(value))?value:Number(value),score:Number(score.toFixed(8))}));
  result.numberRanking=top(result.numberScores); result.trendRanking=top(result.trendScores);
  result.note='Heuristic ranking from historical data only; not calibrated probabilities. Random independent draws cannot be reliably predicted.';
  return result;
}
function getPatternCatalog() { return catalog.map(({id,bank,interval,kind,window,metric,name})=>({id,bank,interval,kind,window,metric,name})); }
module.exports={calculatePatternBank,getPatternCatalog,patternCount:catalog.length};
