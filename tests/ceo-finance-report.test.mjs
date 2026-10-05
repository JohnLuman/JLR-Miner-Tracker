import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/ceo-finance-report.js',import.meta.url),'utf8');
const context={
  window:{},
  document:{getElementById:()=>null,addEventListener:()=>{}},
  console,Blob,URL,Date,Intl,Number,String,Map,Set,Math,
};
vm.createContext(context);
vm.runInContext(source,context);
const api=context.window.JlrCeoFinanceReport?._test;
assert.ok(api,'finance report test helpers are exposed');

assert.equal(api.classify({amount:100,refType:'corporation_tax_npc_bounties'}).category,'Taxes');
assert.equal(api.classify({amount:100,refType:'player_donation'}).category,'Donations');
assert.equal(api.classify({amount:-100,description:'SRP reimbursement for doctrine loss'}).category,'SRP Payouts');
assert.equal(api.classify({amount:-100,description:'Fuel blocks for Upwell structure'}).category,'Structures / Fuel');
assert.equal(api.classify({amount:-100,description:'mystery payment'}).uncategorized,true);

const aggregate=api.aggregate([
  {amount:100,refType:'player_donation'},
  {amount:50,refType:'player_donation'},
  {amount:-40,description:'SRP reimbursement'},
  {amount:-10,description:'SRP reimbursement'},
],'income');
assert.equal(aggregate.length,1);
assert.equal(aggregate[0].name,'Donations');
assert.equal(aggregate[0].value,150);

const snapshot={
  walletAccess:{available:true},
  finance:{
    totalBalance:1000,
    months:[
      {month:'2026-10',income:150,expenses:50,net:100},
      {month:'2026-09',income:350,expenses:150,net:200},
      {month:'2026-08',income:200,expenses:150,net:50},
    ],
  },
};
assert.deepEqual(
  JSON.parse(JSON.stringify(api.reconstructBalances(snapshot,'2026-09'))),
  {opening:700,closing:900,estimated:true},
);
const mom=api.monthComparison(snapshot,'2026-09');
assert.equal(mom.previous.month,'2026-08');
assert.equal(mom.income,75);
assert.equal(mom.expenses,0);
assert.equal(mom.net,300);
assert.match(api.filterLabel({search:'fuel',division:'2',direction:'out'}),/fuel/);
assert.match(api.filterLabel({search:'fuel',division:'2',direction:'out'}),/division 2/);
assert.match(api.filterLabel({search:'fuel',division:'2',direction:'out'}),/money out/);

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
assert.match(app,/CEO COMMAND \/\/ CORP FINANCE REPORT/);
assert.match(app,/JlrCeoFinanceReport\?\.setData/);
assert.doesNotMatch(app,/id="ceoIncomePie"/,'legacy monthly income pie is removed');
assert.match(app,/EXPORT PDF/);
assert.match(app,/EXPORT CSV/);
assert.match(app,/PRINT REPORT/);
assert.match(source,/createElement\('iframe'\)/,'print report uses an in-page print frame');
assert.doesNotMatch(source,/window\.open\(/,'print report no longer depends on popup windows');
assert.match(source,/FINAL NUMBERS \+ POINTS/,'print report is the concise summary format');
assert.match(source,/Total Current Points/,'print report includes loyalty point totals');
assert.match(source,/members\?\.finance/,'print report reads current member loyalty balances');
const printBlock=source.slice(source.indexOf('  function printReport(){'),source.indexOf('  function moveMonth(delta){'));
assert.doesNotMatch(printBlock,/Filtered Ledger|Income Breakdown|Expense Breakdown|Division/,'print report omits wallet-detail breakdowns');

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/pageSize:url\.searchParams\.get\('pageSize'\)/,'CEO journal report endpoint accepts bounded page size');
assert.match(server,/requireCeoViewer\(req,res\)/,'finance journal remains behind the existing CEO access guard');

console.log('CEO corporation finance report, categorization, reconstructed balances, exports and authorization assertions passed.');
