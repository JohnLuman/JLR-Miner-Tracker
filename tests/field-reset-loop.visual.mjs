import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=name=>readFile(new URL('../public/'+name,import.meta.url),'utf8');
const output=process.env.FIELD_VISUAL_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html data-theme="void"><body class="jlr-rail-controls"><main class="app compact"><div id="fieldBoard" class="field-board node-grid board-size-large">'+
  [['map-field-node tier-2','cleared','KCT-0A'],['','cleared','T3-RESET'],['','ready','ALERT'],['','picked','PICKED']].map(([cls,status,name])=>`<div class="system-node ${cls}" data-status="${status}" data-system="${name}"><span class="sys-name">${name}</span><span class="sys-ore ${status==='cleared'?'cleared':''}">${status==='cleared'?'CLEARED • 01:30:32':status}</span><span class="sys-state">3.01 LY</span><span class="sys-evidence ${name==='ALERT'?'danger':''}">${name==='ALERT'?'DANGER':'6.69M / 6.69M m³'}</span></div>`).join('')+'</div></main></body></html>');
 for(const name of ['styles.css','themes.css','connected-rail.css','field-player-loss.css'])await page.addStyleTag({content:await read(name)});
 await page.addScriptTag({content:await read('field-player-loss.js')});
 for(const theme of ['', 'void','citadel','industrial','serpentis','blood','angel','edencom','aurora','neon','glacier','solar']){
  await page.evaluate(theme=>{if(theme)document.documentElement.dataset.theme=theme;else delete document.documentElement.dataset.theme},theme);
  const values=await page.evaluate(()=>{
   const css=s=>getComputedStyle(document.querySelector(s));
   return {reset:css('[data-system="KCT-0A"] .sys-state').color,shadow:css('[data-system="KCT-0A"] .sys-state').textShadow,border:css('[data-system="KCT-0A"]').borderTopColor,alert:css('.sys-evidence.danger').color,semantic:css('[data-system="T3-RESET"]').getPropertyValue('--semantic-status').trim()};
  });
  assert.equal(values.shadow,'none',theme+' reset has no alert glow');
  assert.equal(values.alert,'rgb(255, 138, 148)',theme+' genuine danger remains red');
  assert.notEqual(values.reset,values.alert);
  assert.equal(values.border,'rgb(167, 139, 250)',theme+' reset card keeps purple border');
  if(theme)assert.equal(values.semantic,'#a78bfa');
 }
 await page.evaluate(()=>{
  document.documentElement.dataset.theme='void';
  const now=new Date().toISOString();
  window.JlrFieldPlayerLoss.paint(document.querySelector('#fieldBoard'),{serverNow:now,fieldAccess:{allowed:true},playerLosses:{ALERT:{at:now}}});
 });
 await page.waitForFunction(()=>document.querySelector('.field-player-loss').dataset.paused==='false');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await page.locator('.field-player-loss').getAttribute('data-paused'),'true');
 assert.ok(await page.evaluate(()=>document.querySelector('.field-player-loss').getAnimations({subtree:true}).every(a=>a.playState==='paused')));
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
 const continuity=await page.evaluate(()=>{
  const icon=document.querySelector('.field-player-loss'),animations=icon.getAnimations({subtree:true});
  const details=animations.map(a=>{
   a.pause();const frames=a.effect.getKeyframes(),first=frames[0],last=frames.at(-1);
   for(const t of [0,16,900,1800,3000,3400,3599,3600]){a.currentTime=t;}
   return {name:a.animationName,count:frames.length,first:{transform:first.transform,opacity:first.opacity},last:{transform:last.transform,opacity:last.opacity},properties:[...new Set(frames.flatMap(f=>Object.keys(f)))]};
  });
  animations.forEach(a=>a.currentTime=0);
  window.loopAnimations=animations;
  return details;
 });
 assert.equal(continuity.length,7,'three shots, three fragments, one impact');
 for(const animation of continuity){
  assert.deepEqual(animation.first,animation.last,animation.name+' matching seam');
  assert.ok(animation.count>=(animation.name==='jlr-hostile-impact'?7:12));
  assert.ok(animation.properties.every(p=>['offset','computedOffset','easing','composite','transform','opacity'].includes(p)),'compositor properties only');
 }
 const first=await page.locator('.field-player-loss').screenshot();
 await page.evaluate(()=>window.loopAnimations.forEach(a=>a.currentTime=3600));
 const last=await page.locator('.field-player-loss').screenshot();
 assert.ok(first.equals(last),'rendered first and next-loop frames are identical');
 await page.evaluate(()=>window.loopAnimations.forEach(a=>a.currentTime=1400));
 const middle=await page.locator('.field-player-loss').screenshot();
 assert.ok(!first.equals(middle),'animation visibly progresses between endpoints');
 for(const width of [960,390,320]){
  await page.setViewportSize({width,height:640});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.setViewportSize({width:960,height:640});
 if(output)await page.screenshot({path:resolve(output,'reset-and-combat.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.evaluate(()=>document.querySelector('.field-player-loss').getAnimations({subtree:true}).length),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: reset and danger colors in 11 themes + unthemed; 7 smooth effects; pixel-identical loop boundary; 3 widths; hidden pause and reduced motion.');
}finally{await browser.close()}
