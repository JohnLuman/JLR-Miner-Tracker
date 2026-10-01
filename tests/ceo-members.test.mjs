import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../public/ceo-members.js',import.meta.url),'utf8'),context);
const {select,formatDate}=context.window.JlrCeoMembers;
const at=Date.parse('2026-10-01T00:00:00Z');
const rows=[
  {characterId:1,name:'Alpha',logonDate:'2026-09-30T00:00:00Z',startDate:'2026-06-01T00:00:00Z',loyalty:{balance:0}},
  {characterId:2,name:'Beta',logonDate:'2026-08-01T00:00:00Z',startDate:'2026-09-01T00:00:00Z',loyalty:{balance:50}},
  {characterId:3,name:'Gamma',logonDate:null,startDate:null,loyalty:{balance:-10}},
  {characterId:4,name:'Delta',logonDate:'2026-10-02T00:00:00Z',startDate:'2026-08-01T00:00:00Z',loyalty:{balance:10}},
];
assert.equal(select(rows,{query:'ALPHA'})[0].characterId,1);
assert.equal(select(rows,{query:'3'})[0].name,'Gamma');
assert.equal(select(rows,{activity:'recent',at}).length,1,'Future timestamps must not count as recent activity');
assert.equal(select(rows,{activity:'older',at})[0].name,'Beta');
assert.equal(select(rows,{activity:'unknown',at})[0].name,'Gamma');
assert.equal(select(rows,{sort:'joined'})[0].name,'Beta');
assert.equal(select(rows,{sort:'loyalty'})[0].name,'Beta');
assert.equal(select(rows,{sort:'login'}).at(-1).name,'Gamma','Missing dates sort after known dates');
assert.equal(formatDate('invalid'),'Not reported');
assert.equal(formatDate(null),'Not reported');
assert.equal(rows[0].name,'Alpha','Sorting leaves the original roster unchanged');

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=app.indexOf('  function renderCeoFinance(){');
const end=app.indexOf('    async function adjustCeoLoyalty()',start);
const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',style:{},classList:{toggle(){}}});return elements.get(id);};
const ui={...context,$,ceoFinanceData:{errors:[{section:'wallets'},{section:'membertracking'}],walletAccess:{available:false},members:{count:4,finance:rows},roleHealth:{requirements:[]}},ceoFinanceLoading:false,ceoCommandStatus:{connected:true},ceoSelectedMonth:'',ceoLoyaltyBusy:false,esc:String,ceoMoney:n=>n+' ISK',ceoPieStyle:()=>'',ceoLegend:()=>''};
vm.createContext(ui);vm.runInContext(app.slice(start,end),ui);ui.renderCeoFinance();
assert.match($('ceoMemberFinanceRows').innerHTML,/Tracking unavailable/);
assert.match($('ceoMemberFinanceRows').innerHTML,/Unavailable/);
assert.match($('ceoMemberFinanceRows').innerHTML,/JOINED CORPORATION/);
$('ceoMemberSearch').value='Beta';ui.renderCeoFinance();
assert.match($('ceoMemberResultCount').textContent,/1 of 4/);
assert.doesNotMatch($('ceoMemberFinanceRows').innerHTML,/Alpha/);
console.log('CEO member search, sorting, login filters and unavailable-data rendering passed.');
