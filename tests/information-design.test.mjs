import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
const trackerCss=fs.readFileSync(new URL('../public/tracker.css',import.meta.url),'utf8');
const trackerLoader=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(index,/class="kpis information-kpis"/,'top summary uses the decision-first KPI template');
assert.match(index,/class="kpi kpi-primary api-kpi app-payout-kpi"/,'app payout is a primary KPI');
assert.match(index,/class="kpi kpi-primary fleet-target-kpi"/,'fleet target is a primary KPI');
assert.match(index,/MY TOONS PAYOUT • TODAY/,'personal payout is a primary KPI');
assert.match(index,/class="kpi kpi-secondary"/,'secondary metrics remain available');
assert.match(styles,/\.app\.compact \.information-kpis \.kpi-secondary\{display:none\}/,'Compact mode hides secondary summary metrics');
assert.match(styles,/\.app\.expanded \.information-kpis \.kpi-secondary\{display:block\}/,'Expanded mode restores secondary summary metrics');
assert.match(index,/app-tab-group-label[^>]*>OPS</,'navigation has an Operations group');
assert.match(index,/app-tab-group-label[^>]*>RESOURCES</,'navigation has a Resources group');
assert.match(index,/app-tab-group-label[^>]*>INTEL</,'navigation has an Intel group');
assert.match(index,/app-tab-group-label[^>]*>SYSTEM</,'navigation has a System group');

assert.match(index,/id="fleetInsight"/,'Fleet Performance has a decision-first live insight');
assert.match(app,/LIVE RATE IS ABOVE THE SELECTED FLEET TARGET/,'Fleet insight interprets live rate versus target');
assert.match(app,/fleetInsightMeter/,'Fleet insight uses a compact target-comparison meter');
assert.match(styles,/\.fleet-insight-meter/,'Fleet insight meter is styled');

assert.match(app,/class="ore-mix-bar"/,'Ore Mix uses horizontal comparison bars');
assert.doesNotMatch(app,/ore-mix-composition/,'Ore Mix no longer relies on a composition strip');
assert.match(styles,/\.information-ore-row/,'ranked ore comparison rows are styled');

assert.match(tracker,/TOP SIGNAL/,'Hot Zones leads with the strongest selected signal');
assert.match(tracker,/tracker-intel-valuebar/,'Hot Zones rows include comparable horizontal signal bars');
assert.match(trackerCss,/\.tracker-intel-insight/,'Hot Zones insight treatment is styled');

assert.match(app,/appLedgerCoverageMeter/,'app ledger coverage is visualized');
assert.match(app,/myLedgerCoverageMeter/,'personal ledger coverage is visualized');
assert.match(app,/fleetUptimeMeter/,'fleet target exposes the uptime assumption visually');

assert.equal(pkg.version,'2.9.138');
assert.ok(index.includes('/styles.css?v=2.9.138'),'main information-design CSS is cache-busted');
assert.ok(index.includes('/tracker.css?v=2.9.138'),'Tracker information-design CSS is cache-busted');
assert.ok(index.includes('/app.js?v=2.9.138'),'dashboard JS is cache-busted');
assert.ok(index.includes('/tracker.js?v=2.9.138'),'Tracker loader is cache-busted');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.9\.137/,'Tracker core is cache-busted');

assert.match(styles,/\.app\.compact\{width:min\(1120px,calc\(100vw - 12px\)\);max-width:1120px\}/,'Compact app keeps a bounded design width');
assert.match(styles,/\.app\.expanded\{width:min\(1600px,calc\(100vw - 12px\)\);max-width:1600px\}/,'Expanded app keeps a bounded design width');
assert.match(styles,/grid-template-columns:repeat\(auto-fill,minmax\(250px,340px\)\)/,'Compact target cards are capped instead of stretched');
assert.match(styles,/\.fleet-live-card\{width:100%;max-width:1000px/,'live chart workspace is capped to a useful reading width');
assert.match(styles,/\.market-end-label/,'market chart uses direct end labels');
assert.match(app,/const ticks=3/,'market chart uses restrained grid density');
assert.doesNotMatch(app,/function areaPaths\(\)/,'market chart no longer shades the area between series');
assert.match(app,/class="fleet-latest-label"/,'live fleet chart labels the latest value directly');
assert.doesNotMatch(app,/class="fleet-activity-area"/,'live fleet chart no longer uses decorative area fill');
assert.match(app,/fleet-history-bar'\+\(i===bestIndex\?' best':'\'\)\+\(i===todayIndex\?' today':'\'\)/,'daily chart emphasizes best day and today');

console.log('Information design regression tests passed.');
