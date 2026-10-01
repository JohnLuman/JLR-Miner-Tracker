import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('..',import.meta.url));
const output=resolve(process.env.THEME_SNAPSHOT_DIR||join(root,'artifacts/theme-screenshots'));
const styles=await readFile(join(root,'public/styles.css'),'utf8');
const themes=await readFile(join(root,'public/themes.css'),'utf8');
const names=['void','citadel','industrial','serpentis','blood','angel','edencom','aurora','neon','glacier','solar'];
const widths=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}];
const markup=`<!doctype html><html data-theme="void"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <main class="app compact">
    <header class="topbar glass"><div class="brand-line"><span class="brand-mark">JLR</span><h1>TRACKER</h1></div><span class="status-pill">● DATA LIVE</span></header>
    <nav class="nav-dropdown-bar"><button class="nav-menu-trigger app-tab active">FIELDS</button><button class="nav-menu-trigger app-tab">APPRAISAL</button><button class="nav-menu-trigger app-tab">ADAM</button></nav>
    <section class="kpis information-kpis operations-summary-bar"><article class="kpi summary-cell"><span>APP PAYOUT</span><strong>4.2B ISK</strong><small>Today</small></article><article class="kpi summary-cell"><span>FLEET RATE</span><strong>2.8M m³/hr</strong><small>Measured</small></article><article class="kpi summary-cell"><span>SCAN DUE</span><strong>3 fields</strong><small>Attention</small></article></section>
    <section class="glass board-panel"><div class="section-title"><strong>FIELD TRACKER</strong></div><div class="field-board node-grid"><article class="system-node" data-status="ready"><span class="sys-name">K-8SQS</span><span class="sys-ore">Arkonor</span><span class="sys-state">READY</span></article><article class="system-node" data-status="picked"><span class="sys-name">Y-2ANO</span><span class="sys-ore">Bistot</span><span class="sys-state">PICKED</span></article><article class="system-node" data-status="cleared"><span class="sys-name">PNQY-Y</span><span class="sys-ore">Crokite</span><span class="sys-state">CLEARED</span></article></div></section>
    <section class="glass hit-panel"><div class="section-title"><strong>NEXT TARGETS</strong></div><div class="hit-order"><button class="target-card green"><span class="target-rank"><strong>1</strong></span><span class="target-main"><strong>K-8SQS</strong><small>Ready to mine</small></span></button><button class="target-card yellow"><span class="target-rank"><strong>2</strong></span><span class="target-main"><strong>Y-2ANO</strong><small>Scan recommended</small></span></button></div></section>
    <section class="glass appraisal-panel"><div class="section-title"><strong>APPRAISAL</strong></div><div class="appraisal-summary"><article><span>JITA VALUE</span><strong>812M ISK</strong></article><article><span>LOCAL VALUE</span><strong>874M ISK</strong></article></div></section>
  </main></body></html>`;

await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const hashes=new Set();
const accents=new Set();
try{
  for(const size of widths){
    const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,reducedMotion:'reduce'});
    await page.route('https://**',route=>route.abort());
    await page.setContent(markup);
    await page.addStyleTag({content:styles});
    await page.addStyleTag({content:themes});
    for(const theme of names){
      await page.evaluate(name=>{document.documentElement.dataset.theme=name},theme);
      const values=await page.evaluate(()=>{
        const css=selector=>getComputedStyle(document.querySelector(selector));
        const pseudo=(selector,part)=>getComputedStyle(document.querySelector(selector),part);
        return{
          accent:getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim(),
          overflow:document.documentElement.scrollWidth-window.innerWidth,
          titleStripe:pseudo('.board-panel .section-title','::after').backgroundImage,
          titleRadius:css('.board-panel .section-title').borderRadius,
          ready:css('.system-node[data-status="ready"]').borderColor,
          picked:css('.system-node[data-status="picked"]').borderColor,
          cleared:css('.system-node[data-status="cleared"]').borderColor,
          cardBlur:css('.board-panel').backdropFilter,
          targetBlur:css('.target-card').backdropFilter,
          beforeMotion:pseudo('body','::before').animationName,
          afterMotion:pseudo('body','::after').animationName,
        };
      });
      assert.ok(values.accent,theme+' missing accent');
      assert.ok(values.overflow<=1,theme+' overflows '+size.name+' by '+values.overflow+'px');
      assert.notEqual(values.ready,values.picked,theme+' ready and picked look alike');
      assert.notEqual(values.picked,values.cleared,theme+' picked and cleared look alike');
      assert.equal(values.beforeMotion,'none',theme+' animates a full screen layer');
      assert.equal(values.afterMotion,'none',theme+' animates a full screen layer');
      if(theme==='industrial'){
        assert.match(values.titleStripe,/repeating-linear-gradient/, 'Industrial hazard stripe is missing');
        assert.equal(values.titleRadius,'2px','Industrial should retain squared service bay geometry');
      }
      if(theme==='aurora'||theme==='glacier'){
        assert.equal(values.cardBlur,'none',theme+' repeated glass panels should not blur the backdrop');
        assert.equal(values.targetBlur,'none',theme+' target cards should not blur the backdrop');
      }
      const png=await page.screenshot({animations:'disabled',fullPage:true});
      const hash=createHash('sha256').update(png).digest('hex');
      assert.ok(!hashes.has(hash),theme+' '+size.name+' renders identically to another theme');
      hashes.add(hash);
      if(size.name==='desktop')accents.add(values.accent);
      await writeFile(join(output,theme+'-'+size.name+'.png'),png);
    }
    await page.close();
  }
  assert.equal(accents.size,names.length,'theme palettes must remain distinct');
  console.log('Theme screenshots and visual assertions passed for '+names.length+' themes at desktop and mobile sizes: '+output);
}finally{
  await browser.close();
}
