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

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const balanceStart=server.indexOf('function ceoLoyaltyBalance(');
const balanceEnd=server.indexOf('function ceoMemberFinanceRows(',balanceStart);
const adjustments=Array.from({length:15},(_,i)=>({points:i-7,note:'Reason '+i,createdAt:'2026-09-30T00:00:00Z',createdBy:'Cam',privateField:'hidden'}));
const ledgerContext={state:{ceoAdmin:{loyaltyLedger:{1:{balance:25,adjustments}}}}};
vm.createContext(ledgerContext);vm.runInContext(server.slice(balanceStart,balanceEnd),ledgerContext);
const balance=ledgerContext.ceoLoyaltyBalance(1);
assert.equal(balance.history.length,10);
assert.equal(balance.history[0].note,'Reason 14');
assert.equal(balance.adjustmentCount,15);
assert.equal(balance.history[0].privateField,undefined);
assert.equal(adjustments[0].note,'Reason 0','Reading history does not mutate persisted records');
assert.equal(ledgerContext.ceoLoyaltyBalance(2).history.length,0);
const historyHtml=context.window.JlrCeoMembers.loyaltyHistory({adjustmentCount:1,history:[{points:-5,note:'<script>unsafe</script>',createdBy:'<img>',createdAt:null}]});
assert.match(historyHtml,/-5 pts/);
assert.match(historyHtml,/&lt;script&gt;/);
assert.doesNotMatch(historyHtml,/<script>|<img>/);
assert.match(historyHtml,/Latest 1 of 1 retained/);
assert.match(context.window.JlrCeoMembers.loyaltyHistory({}),/No recorded adjustments/);
rows[0].loyalty={...balance};$('ceoMemberSearch').value='Alpha';ui.renderCeoFinance();
assert.match($('ceoMemberFinanceRows').innerHTML,/LOYALTY ADJUSTMENT HISTORY/);
assert.match($('ceoMemberFinanceRows').innerHTML,/Reason 14/);
console.log('CEO loyalty history ordering, limits, escaping and member rendering passed.');

assert.match($('ceoMemberFinanceRows').innerHTML,/data-ceo-member-journal="1"/);
assert.match($('ceoMemberFinanceRows').innerHTML,/corporation wallet direction/);

const monthlyStart=server.indexOf('function ceoMemberFinanceRows('),monthlyEnd=server.indexOf('async function ceoFinanceSnapshot(',monthlyStart);
const monthlyContext={ceoLoyaltyBalance:()=>({balance:0})};vm.createContext(monthlyContext);
vm.runInContext(server.slice(monthlyStart,monthlyEnd),monthlyContext);
const monthlyRows=monthlyContext.ceoMemberFinanceRows([1,2],new Map([[1,'Alpha'],[2,'Beta']]),[
  {date:'2026-09-30T00:00:00Z',amount:100,firstPartyId:1,secondPartyId:1},
  {date:'2026-10-01T00:00:00Z',amount:-30,firstPartyId:1,secondPartyId:88},
],[]);
assert.equal(monthlyRows[0].months['2026-09'].journalEntries,1,'Member appearing in both parties is counted once');
assert.equal(monthlyRows[0].months['2026-09'].corpWalletIn,100);
assert.equal(monthlyRows[0].months['2026-10'].corpWalletOut,30);
assert.equal(monthlyRows[0].corpWalletNet,70);
ui.ceoFinanceData={finance:{months:[{month:'2026-10'}]},members:{finance:monthlyRows},walletAccess:{available:true},errors:[]};
$('ceoMemberMonth').value='2026-10';$('ceoMemberSearch').value='Alpha';ui.renderCeoFinance();
assert.match($('ceoMemberFinanceRows').innerHTML,/30 ISK/);
assert.doesNotMatch($('ceoMemberFinanceRows').innerHTML,/100 ISK/);
assert.match($('ceoMemberFinanceRows').innerHTML,/data-ceo-member-month="2026-10"/);
assert.equal(select([{name:'A',corpWalletIn:1},{name:'B',corpWalletIn:20}],{sort:'deposits'})[0].name,'B');
console.log('Monthly member wallet totals, sorting and exact drilldown passed.');
