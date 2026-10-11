import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const viewStart=app.indexOf('  function marketTrendView(');
const viewEnd=app.indexOf('  function marketTrendRangeLabel(',viewStart);
assert.ok(viewStart>0&&viewEnd>viewStart,'marketTrendView found');
const marketTrendView=new Function(app.slice(viewStart,viewEnd)+'\nreturn marketTrendView;')();
const sourceStart=app.indexOf('  const ALL_ORE_LINE_COLORS=');
const sourceEnd=app.indexOf('  function renderAllOrePriceChart(',sourceStart);
assert.ok(sourceStart>0&&sourceEnd>sourceStart,'combined ore data processor is available');
const processOre=new Function('marketTrendView','allOreHidden','marketTrendDays','allOrePriceMarket','allOrePriceMode',
  app.slice(sourceStart,sourceEnd)+'\nreturn allOreTrendSeries;'
)(marketTrendView,new Set(),'30','jita','price');
const inputs=[
  {name:'Low value ore',points:[
    {date:'2026-09-20',jita:100,cn:75},
    {date:'2026-10-10',jita:150,cn:90},
  ]},
  {name:'High value ore',points:[
    {date:'2026-09-20',jita:1000,cn:800},
    {date:'2026-10-10',jita:900,cn:700},
  ]},
  {name:'Unpriced ore',points:[
    {date:'2026-10-10',jita:null,cn:null},
  ]},
];
const today='2026-10-10';
const jita=processOre(inputs,'30','jita','price',new Set(),today);
assert.equal(jita.lines.length,3,'every tracked ore gets a legend entry');
assert.equal(jita.availableLines,2,'unpriced ores are not presented as priced series');
assert.equal(jita.activeLines,2,'all priced ores visible by default');
assert.deepEqual(jita.lines[0].points.filter(p=>p.price!==null).map(p=>p.price),[100,150]);
assert.equal(jita.lines[2].pricedCount,0);
assert.equal(jita.lines[2].points[0].price,null,'missing price stays missing, not zero');
const cn=processOre(inputs,'30','cn','price',new Set(),today);
assert.deepEqual(cn.lines[0].points.filter(p=>p.price!==null).map(p=>p.price),[75,90],'C-N basis is independent of Jita');
const change=processOre(inputs,'30','jita','change',new Set(),today);
assert.equal(change.lines[0].points[0].value,0,'relative change starts from first observed price');
assert.equal(change.lines[0].points.at(-1).value,50,'lower priced ore rises 50%');
assert.ok(Math.abs(change.lines[1].points.at(-1).value+10)<1e-9,'higher priced ore falls 10%');
const hidden=processOre(inputs,'30','jita','price',new Set(['Low value ore']),today);
assert.equal(hidden.activeLines,1);
assert.equal(hidden.lines[0].visible,false);
assert.equal(hidden.lines[1].visible,true);
const allHidden=processOre(inputs,'30','jita','price',new Set(['Low value ore','High value ore']),today);
assert.equal(allHidden.activeLines,0);
const longer=[
  {name:'Lunar ore',points:[
    {date:'2026-01-10',jita:20,cn:30},
    {date:'2026-10-10',jita:30,cn:35},
  ]},
];
assert.equal(processOre(longer,'30','jita','price',new Set(),today).lines[0].pricedCount,1);
assert.equal(processOre(longer,'all','jita','price',new Set(),today).lines[0].pricedCount,2);
assert.equal(processOre(longer,'365','jita','price',new Set(),today).granularity,'day','do not average sparse years into misleading monthly flat lines');
assert.equal(processOre(inputs,'90','jita','price',new Set(),today).granularity,'day','90D shows actual daily observations when fewer than 35 dates recorded');
const dense=Array.from({length:60},(_,i)=>({
  date:new Date(Date.parse(today+'T00:00:00Z')-(59-i)*86400000).toISOString().slice(0,10),
  jita:100+i,cn:150+i,
}));
assert.equal(processOre([{name:'Dense',points:dense}],'90','jita','price',new Set(),today).granularity,'week',
  '90D uses weekly averages once 35+ valid observed dates exist');
assert.equal(processOre(inputs,'30','jita','price',new Set(),today).lines[0].changePct,50);
assert.equal(processOre([{name:'Flat',points:[{date:'2026-10-09',jita:100},{date:today,jita:100}]}],
  '30','jita','price',new Set(),today).lines[0].distinctPrices,1,'truly unchanged quotes identified explicitly');
const aggregate=processOre(inputs,'30','jita','price',new Set(),today);
assert.equal(aggregate.lines[0].color!==aggregate.lines[1].color,true,'separate line colors');
assert.match(html,/id="allOrePriceChart"/,'combined chart has dedicated panel');
assert.match(html,/id="allOreLegend"/,'legend contains per-ore line switches');
assert.ok(html.indexOf('id="allOreLegend"')<html.indexOf('id="allOrePriceChart"'),'named color legend comes before all-ore lines');
assert.match(html,/COLORED LINES = ORE TYPES/,'legend explains color meaning without threat-role confusion');
assert.match(html,/id="allOreDataNotice"/,'available data coverage and stale refresh warning shown');
assert.match(html,/refined mineral value per m³, not raw ore sell orders/i,'market metric accurately described');
assert.match(html,/data-all-ore-market="jita"/,'Jita market selection available');
assert.match(html,/data-all-ore-market="cn"/,'C-N market selection available');
assert.match(html,/data-all-ore-mode="change"/,'relative percentage comparisons available');
assert.match(html,/id="allOreShowAll"/,'all ores can be restored');
assert.match(html,/id="allOreHideAll"/,'all ore lines can be temporarily hidden');
assert.match(app,/renderAllOrePriceChart\(trendOres\)/,'combined chart renders on the Fleet Performance panel');
assert.match(app,/marketTrendView\(ore.points/,'combined chart uses existing adaptive 30D/90D/1Y trend engine');
assert.match(css,/\.all-ore-line-svg/,'combined line chart has layout');

// Visual regression: explicit SVG paint is essential because some cached themes
// style unrelated chart series differently; hover hit areas must never turn black.
const cssText=css;
assert.match(cssText,/\.fleet-trend-card \.all-ore-line-svg\{[\s\S]*?height:325px!important/,'full-height chart overrides old 205px performance rule');
assert.match(cssText,/\.all-ore-line-svg \.all-ore-point\{[\s\S]*?fill:transparent!important/,'hover targets stay transparent');
const rendererStart=app.indexOf('  function renderAllOrePriceChart(');
const rendererEnd=app.indexOf('  function updateSoundStatus()',rendererStart);
assert.ok(rendererStart>0&&rendererEnd>rendererStart);
const todayGenerated=new Date().toISOString().slice(0,10);
const priorDate=delta=>new Date(Date.parse(todayGenerated+'T00:00:00Z')-delta*86400000).toISOString().slice(0,10);
const sourceRows={
  Beryl:[{date:priorDate(21),jita:50,cn:60},{date:priorDate(14),jita:55,cn:65},
    {date:priorDate(7),jita:60,cn:70},{date:todayGenerated,jita:65,cn:75}],
  Garnet:[{date:priorDate(21),jita:100,cn:110},{date:priorDate(14),jita:105,cn:115},
    {date:priorDate(7),jita:110,cn:120},{date:todayGenerated,jita:115,cn:125}],
};
const nodes={
  allOrePriceChart:{clientWidth:1400,innerHTML:''},
  allOreLegend:{innerHTML:''},
  allOreTrendWindowLabel:{textContent:''},
  allOreLineCount:{textContent:''},
  allOreDataNotice:{textContent:'',classList:{toggle:()=>{}}},
};
const renderOre=new Function(String.fromCharCode(36),'document','allOreTrendSeries','marketHistoryPoints',
  'marketTrendDays','allOrePriceMarket','allOrePriceMode','chartDateLabel','esc','state',
  app.slice(rendererStart,rendererEnd)+'\nreturn renderAllOrePriceChart;'
)(
  key=>nodes[key]||null,
  {querySelectorAll:()=>[]},
  // Reuse actual data processing with empty hidden selection and 90D window.
  (ores)=>processOre(ores,'90','jita','price',new Set(),todayGenerated),
  (_bucket,key)=>sourceRows[key]||[],
  '90','jita','price',
  value=>value,
  value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  {market:{lastUpdatedAt:new Date().toISOString()}},
);
renderOre([{name:'Beryl'},{name:'Garnet'}]);
const markup=nodes.allOrePriceChart.innerHTML;
assert.match(markup,/viewBox="0 0 1400 325"/,'chart uses its visible width instead of a 960x310 chart compressed to 205px');
assert.match(markup,/fill="none" stroke="#72d6ff" stroke-width="2.8"/,'first ore line has explicit SVG color');
assert.match(markup,/fill="none" stroke="#ffc875" stroke-width="2.8"/,'second ore line is distinct and visible');
assert.match(markup,/fill="transparent" stroke="none" class="all-ore-point"/,'hover targets cannot appear as opaque black circles');
assert.match(markup,/r="3" fill="#72d6ff"/,'a single-price point has visible fill without theme styles');
const paths=[...markup.matchAll(/<path d="([^"]+)" fill="none" stroke="[^"]+" stroke-width="2.8"/g)];
assert.equal(paths.length,2);
assert.ok(paths.every(match=>!match[1].includes(' L ')),'weekly-spaced prices remain separate observations at low data coverage, not invented continuous flat lines');
assert.equal(nodes.allOreTrendWindowLabel.textContent.includes('collected since'),true);
assert.match(nodes.allOreDataNotice.textContent,/4 actual recorded pricing days/,'honest data coverage displayed');
assert.match(nodes.allOreDataNotice.textContent,/daily detail/,'sparse 90D uses daily point resolution');
assert.match(nodes.allOreLegend.innerHTML,/Beryl/, 'legend shows ore names and matching swatches');
assert.match(nodes.allOreLegend.innerHTML,/Garnet/, 'legend lists more than one ore');
const helperStart=app.indexOf('  function marketHistoryPoints(');
const helperEnd=app.indexOf('  function marketTrendView(',helperStart);
const getMarketHistory=new Function('state',app.slice(helperStart,helperEnd)+'\nreturn marketHistoryPoints;');
const yesterday=priorDate(1);
const staleHistory=getMarketHistory({market:{
  lastUpdatedAt:yesterday+'T10:00:00Z',
  history:{ore:{Beryl:[{date:yesterday,jita:100,cn:90}]}},
}})('ore','Beryl',100,90);
assert.equal(staleHistory.length,1,'stale yesterday value must never be redated as a fabricated today's observation');
const freshHistory=getMarketHistory({market:{
  lastUpdatedAt:todayGenerated+'T10:00:00Z',
  history:{ore:{Beryl:[{date:yesterday,jita:100,cn:90}]}},
}})('ore','Beryl',101,91);
assert.equal(freshHistory.length,2,'new daily observation only added if fresh market update actually completed today');

console.log('All-ore price trend lines, normalization, market switching and filtering passed.');
