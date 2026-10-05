import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('public/app.js');
const binding=app.slice(app.indexOf('  let fieldStatusConnected='),app.indexOf('  function mapFieldBoardNode('));
const sse=app.slice(app.indexOf('  function connectSse(){'),app.indexOf("  document.addEventListener('change',async event=>"));
const browser=await chromium.launch({headless:true,...(process.env.FIELD_STATUS_BROWSER?{executablePath:process.env.FIELD_STATUS_BROWSER}:{})});
try{
const page=await browser.newPage({viewport:{width:1000,height:850}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.setContent('<html data-theme="void"><body><main class="app"><section class="glass board-panel"><h1>FIELD TRACKER</h1><div id="fieldBoard" class="field-board node-grid"></div><span id="liveBadge"></span></section></main></body></html>');
for(const path of ['public/styles.css','public/themes.css','public/field-status.css'])await page.addStyleTag({content:read(path)});
await page.addScriptTag({content:read('public/field-status.js')});
await page.addScriptTag({content:`
  const now=Date.now(),iso=delta=>new Date(now+delta).toISOString();
  let state={serverNow:iso(0),fieldAccess:{allowed:true},scans:{'CHA2-Q':{lastScanAt:iso(-180000)}},miningActivity:{},playerLosses:{},fields:{'CHA2-Q':{status:'ready'}}};
  let eventSource=null,boardArrangeMode=false,boardSuppressClickUntil=0,boardDragKey='';
  const scoutNearestScan={system:'CHA2-Q',jumps:2};
  const $=id=>document.getElementById(id),favoriteBoardKeys=()=>new Set(),moveBoardItem=()=>{},chooseSystem=()=>{};
  const boardScanLine=()=>({stale:false}),mapScanReminderLine=()=>({stale:true});
  const openMapFieldControls=()=>{window.controlsOpened=true};
  const boardEntries=()=>['t3','ice','map','a0'].map(kind=>({kind,key:kind+':CHA2-Q',system:'CHA2-Q',f:state.fields['CHA2-Q'],d:{ore:'Bistot',distanceLy:2.4},row:{ore:'Arkonor',tier:2,iceBelts:2,scan:{detected:true,lastCheckedAt:iso(-60000)}}}));
  const scheduleStateRender=()=>{},refreshMe=async()=>{},refreshFleetPerformanceSnapshot=async()=>{};
  window.EventSource=class {constructor(){this.listeners={};window.stream=this}addEventListener(name,fn){this.listeners[name]=fn}close(){}};
  ${binding}
  ${sse}
  for(const entry of boardEntries()){
    const card=document.createElement('div');card.className='system-node';card.dataset.boardKey=entry.key;card.dataset.system=entry.system;card.dataset.status='ready';
    card.innerHTML='<button class="favorite-toggle">☆</button><span class="sys-name">CHA2-Q</span><span class="sys-ore">'+entry.kind.toUpperCase()+'</span>';
    card.querySelector('button').onclick=()=>window.favoriteClicked=true;
    attachBoardDrag(card,entry.key);$('fieldBoard').append(card);
  }
  connectSse();
  window.push=patch=>{state={...state,...patch,serverNow:new Date().toISOString()};stream.listeners.state({data:JSON.stringify(state)})};
  push({});
`});
const cards=page.locator('.system-node'),modal=page.locator('.field-status-dialog');
const before=await cards.first().boundingBox();
await cards.first().locator('.favorite-toggle').click();assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>favoriteClicked),true);
await cards.first().locator('.sys-name').click();assert.equal(await modal.count(),1);
assert.match(await modal.innerText(),/Live updates/);
await page.evaluate(()=>{window.originalDialog=document.querySelector('dialog');push({miningActivity:{'t3:CHA2-Q':new Date().toISOString()},fields:{'CHA2-Q':{status:'cleared',timerEndsAt:new Date(Date.now()+1500).toISOString()}},playerLosses:{'CHA2-Q':{at:new Date().toISOString()}}})});
assert.match(await modal.innerText(),/Recent activity · player loss reported/);assert.match(await modal.innerText(),/Cleared/);
assert.equal(await page.evaluate(()=>originalDialog===document.querySelector('dialog')),true);
assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Close');
await page.waitForFunction(()=>document.querySelector('dialog')?.textContent.includes('Timer finished'),{},{timeout:5000});
await page.evaluate(()=>stream.onerror());assert.match(await modal.innerText(),/data may be stale/);
await page.evaluate(()=>push({}));assert.match(await modal.innerText(),/Live updates/);
await page.evaluate(()=>push({fields:{'CHA2-Q':{status:'picked',notes:[{text:'<img src=x onerror=alert(1)>',createdAt:new Date().toISOString()}]}}}));
assert.equal(await modal.locator('img').count(),0);assert.match(await modal.innerText(),/<img/);
await page.keyboard.press('Escape');assert.equal(await modal.count(),0);
assert.equal(await page.evaluate(()=>document.activeElement.dataset.boardKey),'t3:CHA2-Q');
assert.deepEqual(await cards.first().boundingBox(),before,'opening must not change board layout');
for(let i=0;i<4;i++){await cards.nth(i).focus();await page.keyboard.press('Enter');assert.equal(await modal.count(),1);await page.keyboard.press('Escape');}
await cards.nth(2).click();await modal.getByText('Field controls',{exact:true}).click();assert.equal(await page.evaluate(()=>controlsOpened),true);assert.equal(await modal.count(),0);
await cards.first().click();await page.evaluate(()=>push({fieldAccess:{allowed:false}}));assert.equal(await modal.count(),0);
await page.evaluate(()=>{push({fieldAccess:{allowed:true},fields:{'CHA2-Q':{status:'picked'}},scans:{'CHA2-Q':{lastScanAt:new Date().toISOString(),ledger:{baselineDetected:true,baselineAt:'2026-10-05T00:00:00Z',verifiedFromScanAt:'2026-10-05T00:00:00Z',verifiedM3SinceScan:250000,siteM3:1000000}}}})});
await cards.first().click();
const output=process.env.FIELD_STATUS_SCREENSHOTS;
if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:output+'/JLR-status-desktop.png'});}
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth),true);
if(output)await page.screenshot({path:output+'/JLR-status-mobile.png'});
await page.keyboard.press('Escape');
await page.evaluate(()=>{boardArrangeMode=true});await cards.first().click();assert.equal(await modal.count(),0);
assert.deepEqual(errors,[]);
console.log('Browser: all card types, live SSE updates, timer ticks, loss/reconnect, safe text, keyboard/Escape/focus, access revocation, preserved controls/layout and mobile width passed.');
}finally{await browser.close();}
