import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=app.indexOf('  function marketTrendView(');
const end=app.indexOf('  function marketTrendRangeLabel(',start);
assert.ok(start>0&&end>start,'market trend view exists');
const marketTrendView=new Function(app.slice(start,end)+'\nreturn marketTrendView;')();
const today='2026-10-10';
const DAY=86400000;
const ms=Date.parse(today+'T00:00:00Z');
const daily=Array.from({length:400},(_,i)=>{
  const date=new Date(ms-(399-i)*DAY).toISOString().slice(0,10);
  return {date,jita:100+i,cn:200+i};
});
const oneMonth=marketTrendView(daily,30,today);
assert.equal(oneMonth.granularity,'day');
assert.equal(oneMonth.rows.length,30);
assert.equal(oneMonth.recordedDays,30);
assert.equal(oneMonth.windowStart,'2026-09-11');
const ninety=marketTrendView(daily,90,today);
assert.equal(ninety.granularity,'week');
assert.equal(ninety.recordedDays,90);
assert.ok(ninety.rows.length>=12&&ninety.rows.length<=14,'90 days reduce to weekly points');
const firstWeek=ninety.rows[0];
const firstWeekRaw=daily.filter(row=>row.date>=ninety.windowStart&&row.date<=firstWeek.lastDate);
assert.ok(firstWeekRaw.length>0);
assert.equal(firstWeek.jita,firstWeekRaw.reduce((sum,row)=>sum+row.jita,0)/firstWeekRaw.length,'weekly value is observed price mean, not fabricated zero');
const halfYear=marketTrendView(daily,180,today);
assert.equal(halfYear.granularity,'week');
assert.equal(halfYear.recordedDays,180);
const year=marketTrendView(daily,365,today);
assert.equal(year.granularity,'month');
assert.ok(year.rows.length>=12&&year.rows.length<=13);
assert.equal(year.recordedDays,365);
const all=marketTrendView(daily,'all',today);
assert.equal(all.granularity,'month');
assert.equal(all.recordedDays,400);
assert.ok(all.rows.length>=13);
const sparse=marketTrendView([
  {date:'2026-09-01',jita:100,cn:null},
  {date:'2026-09-30',jita:200,cn:70},
  {date:'2026-10-10',jita:300,cn:90},
],90,today);
assert.equal(sparse.recordedDays,3,'sparse dates do not become fake daily samples');
assert.equal(sparse.rows.reduce((n,row)=>n+row.days,0),3);
assert.ok(sparse.rows.every(row=>row.jita!==0),'missing dates do not become zero');
assert.equal(marketTrendView([],365,today).rows.length,0);
assert.equal(marketTrendView(daily,'nonsense',today).range,'30');
assert.ok(html.includes('data-market-days="365"')&&html.includes('data-market-days="all"'),'long range controls shown');
assert.ok(html.includes('id="iceTrendWindowLabel"')&&html.includes('id="oreTrendWindowLabel"'),'both ice and ore charts show time granularity');
assert.ok(app.includes('marketTrendView(marketHistoryPoints(\'ore\'')&&app.includes('marketTrendView(marketHistoryPoints(\'ice\''),'both charts use the selected range');
assert.match(server,/MARKET_HISTORY_MAX_DAYS=731/,'actual price observations retained for two years');
assert.match(server,/slice\(-MARKET_HISTORY_MAX_DAYS\)/,'backend no longer truncates records at 31 days');
console.log('Long-range market trend aggregation, observed-data coverage and chart controls passed.');
