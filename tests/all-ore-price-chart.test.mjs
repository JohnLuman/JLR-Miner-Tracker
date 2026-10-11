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
assert.equal(change.lines[1].points.at(-1).value,-10,'higher priced ore falls 10%');
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
assert.equal(processOre(longer,'365','jita','price',new Set(),today).granularity,'month');
assert.equal(processOre(inputs,'90','jita','price',new Set(),today).granularity,'week');
const aggregate=processOre(inputs,'30','jita','price',new Set(),today);
assert.equal(aggregate.lines[0].color!==aggregate.lines[1].color,true,'separate line colors');
assert.match(html,/id="allOrePriceChart"/,'combined chart has dedicated panel');
assert.match(html,/id="allOreLegend"/,'legend contains per-ore line switches');
assert.match(html,/data-all-ore-market="jita"/,'Jita market selection available');
assert.match(html,/data-all-ore-market="cn"/,'C-N market selection available');
assert.match(html,/data-all-ore-mode="change"/,'relative percentage comparisons available');
assert.match(html,/id="allOreShowAll"/,'all ores can be restored');
assert.match(html,/id="allOreHideAll"/,'all ore lines can be temporarily hidden');
assert.match(app,/renderAllOrePriceChart\(trendOres\)/,'combined chart renders on the Fleet Performance panel');
assert.match(app,/marketTrendView\(ore.points/,'combined chart uses existing adaptive 30D/90D/1Y trend engine');
assert.match(css,/\.all-ore-line-svg/,'combined line chart has layout');
console.log('All-ore price trend lines, normalization, market switching and filtering passed.');
