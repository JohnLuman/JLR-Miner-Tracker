import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { journalPage } from '../lib/ceo-journal.mjs';
const rows=Array.from({length:105},(_,i)=>({refId:String(i),date:i<100?'2026-09-30T00:00:00Z':'2026-08-30T00:00:00Z',division:i%2+1,amount:i%2?-10:20,balance:100,refType:'player_donation',reason:'Fleet payout',firstPartyId:99,secondPartyId:88,secret:'must not leak'}));
const result=journalPage(rows);
assert.equal(result.records.length,50);assert.equal(result.total,105);assert.equal(result.pages,3);
assert.equal(result.totals.income,1060);assert.equal(result.totals.expenses,520);assert.equal(result.totals.net,540);
assert.equal(result.records[0].secret,undefined);
assert.equal(journalPage(rows,{month:'2026-08'}).total,5);
assert.equal(journalPage(rows,{division:'2',direction:'out'}).total,52);
assert.equal(journalPage(rows,{query:'PLAYER DONATION'}).total,105);
assert.equal(journalPage(rows,{query:'99'}).total,105);
assert.equal(journalPage(rows,{query:'nonexistent'}).total,0);
assert.equal(journalPage(rows,{page:999}).page,3);
assert.equal(journalPage(rows,{pageSize:999}).pageSize,100);
assert.equal(journalPage([{date:'invalid'},...rows]).retained,105);
assert.equal(journalPage([]).pages,1);
assert.equal(journalPage([{...rows[0],amount:0}],{direction:'zero'}).total,1);
assert.equal(rows[0].refId,'0','Queries leave saved records unchanged');

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
// Exercise the actual ESI ingestion path, rather than only normalized fixtures.
const ingestContext={state:{ceoAdmin:{financeJournal:{}}}};
vm.createContext(ingestContext);
const ingestStart=source.indexOf('function ceoRememberFinanceJournal(');
const ingestEnd=source.indexOf('function ceoFinanceSummary(',ingestStart);
vm.runInContext(source.slice(ingestStart,ingestEnd),ingestContext);
const recentDate=new Date().toISOString();
const esiRows=[
  {id:1234567890,date:recentDate,_division:1,amount:200,balance:1000,ref_type:'player_donation',first_party_id:99,second_party_id:88},
  {id:1234567891,date:recentDate,_division:2,amount:-50,balance:950,ref_type:'corporation_account_withdrawal',first_party_id:88,second_party_id:99},
];
ingestContext.ceoRememberFinanceJournal(esiRows);
ingestContext.ceoRememberFinanceJournal(esiRows);
const retained=Object.values(ingestContext.state.ceoAdmin.financeJournal);
assert.equal(retained.length,2,'ESI id entries are retained and repeated pulls do not duplicate them');
assert.equal(retained[0].refId,'1234567890');
assert.equal(retained[1].division,2);
const ingestedPage=journalPage(retained,{month:recentDate.slice(0,7)});
assert.equal(ingestedPage.total,2);
assert.equal(ingestedPage.totals.income,200);
assert.equal(ingestedPage.totals.expenses,50);
assert.equal(ingestedPage.totals.net,150);
const summaryEnd=source.indexOf('function ceoRoleList(',ingestEnd);
vm.runInContext(source.slice(ingestEnd,summaryEnd),ingestContext);
assert.equal(ingestContext.ceoFinanceSummary([],{},retained).months[0].net,150,'Raw ESI entries populate monthly income totals');
ingestContext.ceoRememberFinanceJournal([{ref_id:1234567892,date:recentDate,_division:3,amount:25}]);
assert.equal(Object.keys(ingestContext.state.ceoAdmin.financeJournal).length,3,'Legacy reference field remains supported');
const start=source.indexOf("  if(req.method==='GET'&&url.pathname==='/api/ceo/journal'){");
const end=source.indexOf('\n  if(',start+5);assert.ok(start>0);
for(const allowed of [false,true]){
  let calls=0,payload;
  const context={req:{method:'GET'},res:{},url:new URL('https://example.test/api/ceo/journal?division=2&direction=out'),requireCeoViewer:()=>allowed,state:{ceoAdmin:{scopes:[],financeJournal:Object.fromEntries(rows.map(row=>[row.refId,row]))}},CEO_WALLET_SCOPE:'wallet',journalPage:(...args)=>{calls++;return journalPage(...args);},json:(res,status,data)=>payload={status,data}};
  vm.createContext(context);await vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',context);
  assert.equal(calls,allowed?1:0,'Access guard runs before reading private journal');
  if(allowed){assert.equal(payload.data.total,52);assert.equal(payload.data.walletGranted,false);assert.equal(payload.data.pull,null);}
}

const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',classList:{toggle(){}}});return elements.get(id);};
const pending=[];
const browser={window:{},URLSearchParams,document:{getElementById:$,addEventListener(){}},fetch:url=>new Promise(resolve=>pending.push({url,resolve})),setTimeout,clearTimeout};
vm.createContext(browser);vm.runInContext(fs.readFileSync(new URL('../public/ceo-journal.js',import.meta.url),'utf8'),browser);
const view={...result,walletGranted:false,pull:null};
let task=browser.window.JlrCeoJournal.load();pending.shift().resolve({ok:true,json:async()=>view});await task;
assert.match($('ceoJournalWarning').textContent,/wallet permission/);
assert.match($('ceoJournalCount').textContent,/105 matching entries/);
assert.equal($('ceoJournalPrev').disabled,true);assert.equal($('ceoJournalNext').disabled,false);
const stale=browser.window.JlrCeoJournal.load();$('ceoJournalSearch').value='latest';const latest=browser.window.JlrCeoJournal.load();
const first=pending.shift(),second=pending.shift();
second.resolve({ok:true,json:async()=>({...view,total:1,records:[{...rows[0],reason:'<script>latest</script>'}],pull:{available:false,updatedAt:'2026-09-30T00:00:00Z',truncated:true,error:'ESI unavailable'}})});await latest;
first.resolve({ok:true,json:async()=>({...view,total:999})});await stale;
assert.match($('ceoJournalCount').textContent,/1 matching entries/,'Late response must not overwrite latest query');
assert.match($('ceoJournalRecords').innerHTML,/&lt;script&gt;/);assert.doesNotMatch($('ceoJournalRecords').innerHTML,/<script>/);
assert.match($('ceoJournalWarning').textContent,/page limit/);assert.match($('ceoJournalStamp').textContent,/last successful pull/);
task=browser.window.JlrCeoJournal.load();pending.shift().resolve({ok:false,status:500});await task;
assert.match($('ceoJournalWarning').textContent,/could not be loaded/);assert.match($('ceoJournalCount').textContent,/previous results/);
console.log('CEO journal filters, totals, bounded pagination, private access, escaping and request ordering passed.');

task=browser.window.JlrCeoJournal.load();pending.shift().resolve({ok:false,status:403});await task;
assert.doesNotMatch($('ceoJournalRecords').innerHTML,/latest/,'Restricted session clears private records');
assert.match($('ceoJournalWarning').textContent,/restricted/);
let stamp='2026-09-30T00:00:00Z',fail=false,pulls=0;
const financeContext={ceoFinanceCache:{at:0,data:null,promise:null},CEO_FINANCE_CACHE_MS:300000,CEO_FINANCE_BASELINE:{available:false,months:[]},CEO_WALLET_SCOPE:'wallet',CEO_LEGACY_WALLET_SCOPE:'legacy',state:{ceoAdmin:{scopes:['wallet'],financeJournal:{}}},now:()=>stamp,save:async()=>{},ceoAccessToken:async()=>({access:'private',admin:{corporationId:1,characterId:2,scopes:financeContext.state.ceoAdmin.scopes}}),esiGet:async()=>({data:[]}),ceoPagedGet:async url=>{pulls++;const division=Number(url.match(/wallets\/(\d+)/)[1]);if(fail&&division===2)throw new Error('ESI denied');return {rows:[],pagesFetched:20,reportedPages:division===1?21:20,truncated:division===1};},ceoRememberFinanceJournal:()=>{},resolveUniverseNames:async()=>new Map(),ceoMemberFinanceRows:()=>[],ceoFinanceSummary:()=>({}),ceoRoleHealth:()=>({})};
vm.createContext(financeContext);
const tryStart=source.indexOf('async function ceoTry('),tryEnd=source.indexOf('function ceoRememberFinanceJournal(',tryStart);
vm.runInContext(source.slice(tryStart,tryEnd),financeContext);
const financeStart=source.indexOf('async function ceoFinanceSnapshot('),financeEnd=source.indexOf('let ceoStructuresCache=',financeStart);
vm.runInContext(source.slice(financeStart,financeEnd),financeContext);
await financeContext.ceoFinanceSnapshot({force:true});
assert.equal(financeContext.state.ceoAdmin.walletJournalPull.truncated,true);
assert.equal(financeContext.state.ceoAdmin.walletJournalPull.divisions.length,7);
assert.equal(financeContext.state.ceoAdmin.walletJournalPull.updatedAt,stamp);
stamp='2026-10-01T00:00:00Z';fail=true;
await financeContext.ceoFinanceSnapshot({force:true});
assert.equal(financeContext.state.ceoAdmin.walletJournalPull.available,false);
assert.equal(financeContext.state.ceoAdmin.walletJournalPull.updatedAt,'2026-09-30T00:00:00Z','Failed pull preserves successful timestamp');
assert.match(financeContext.state.ceoAdmin.walletJournalPull.error,/ESI denied/);
const oldPulls=pulls;financeContext.state.ceoAdmin.scopes=[];
await financeContext.ceoFinanceSnapshot({force:true});
assert.equal(pulls,oldPulls,'Missing wallet scope must not call journal endpoints');
console.log('Journal pull coverage, partial failure timestamps and missing-scope handling passed.');

const exactRows=[
  {...rows[0],refId:'99',firstPartyId:199,secondPartyId:888},
  {...rows[0],refId:'2',firstPartyId:99,secondPartyId:88},
  {...rows[0],refId:'3',firstPartyId:88,secondPartyId:99},
  {...rows[0],refId:'4',firstPartyId:99,secondPartyId:99},
];
const exact=journalPage(exactRows,{party:'99'});
assert.equal(exact.total,3,'Party filter matches either exact ID, excluding text and partial ID matches');
assert.equal(exact.totals.income,60,'An entry with member in both parties counts once');
assert.equal(journalPage(exactRows,{party:'not-an-id'}).total,0);
assert.equal(journalPage(exactRows,{party:'99',division:'2'}).total,0);
$('ceoJournalParty').value='99';browser.window.JlrCeoJournal.setMembers([{characterId:99,name:'<Member>'},{characterId:88,name:'Beta'}]);
assert.match($('ceoJournalParty').innerHTML,/&lt;Member&gt;/);
assert.equal($('ceoJournalParty').value,'99');
for(const id of ['ceoJournalSearch','ceoJournalMonth','ceoJournalDivision','ceoJournalDirection'])$(id).value='old-filter';
task=browser.window.JlrCeoJournal.viewMember(99);
const memberRequest=pending.shift();const memberUrl=new URL(memberRequest.url,'https://example.test');
assert.equal(memberUrl.searchParams.get('party'),'99');assert.equal(memberUrl.searchParams.get('page'),'1');
assert.equal(memberUrl.searchParams.get('query'),'');assert.equal(memberUrl.searchParams.get('month'),'');
memberRequest.resolve({ok:true,json:async()=>({...view,...exact})});await task;
assert.match($('ceoJournalCount').textContent,/3 matching entries/);
const pendingCount=pending.length;browser.window.JlrCeoJournal.viewMember('<bad>');assert.equal(pending.length,pendingCount);
task=browser.window.JlrCeoJournal.viewMember(99,'2026-09');
const monthlyRequest=pending.shift();
assert.equal(new URL(monthlyRequest.url,'https://example.test').searchParams.get('month'),'2026-09','Member drilldown carries the chosen month');
monthlyRequest.resolve({ok:true,json:async()=>view});await task;
console.log('Member wallet drilldown exact identity matching, reset filters and totals passed.');
