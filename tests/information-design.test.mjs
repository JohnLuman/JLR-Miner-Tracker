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
assert.match(index,/class="kpi kpi-secondary fleet-target-kpi"/,'fleet target is a compact secondary KPI');
assert.match(index,/class="market-payout-pair"/,'Jita and C-N payout cards are bound into one grid group');
assert.match(fix=>fix,/.*/);
assert.match(index,/MY TOONS PAYOUT • EVE DAY/,'personal payout is a primary KPI');
assert.match(index,/class="kpi kpi-secondary"/,'secondary metrics remain available');
assert.match(styles,/v2\.9\.143 — balanced operations summary/,'top summary uses the balanced 2-row layout');
assert.match(styles,/\.information-kpis\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);max-width:1040px/,'summary is capped and uses four equal columns');
assert.match(styles,/\.information-kpis>\.market-payout-pair\{grid-column:span 2;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Jita and C-N are locked side-by-side in the payout pair');
assert.match(index,/appLedgerCoverageBadge/,'app ledger coverage is a compact badge');
assert.match(index,/myLedgerCoverageBadge/,'personal ledger coverage is a compact badge');
assert.match(index,/app-tab-group-label[^>]*>OPS</,'navigation has an Operations group');
assert.match(index,/app-tab-group-label[^>]*>RESOURCES</,'navigation has a Resources group');
assert.match(index,/app-tab-group-label[^>]*>INTEL</,'navigation has an Intel group');
assert.match(index,/app-tab-group-label[^>]*>SYSTEM</,'navigation has a System group');
assert.match(index,/id="donateTop"/,'global Donate control is present in the app header');
assert.match(index,/paypal\.com\/ncp\/payment\/J7UYHR2RJFS6N/,'global Donate control uses the configured PayPal destination');
assert.match(app,/jlr-donate-banner-feedback/,'Feedback hub contains the full Donate banner');
assert.match(styles,/\.jlr-donate-banner\{--donate-accent:var\(--theme-accent/,'Donate banner inherits the active dashboard theme');
assert.match(styles,/\.donate-top-link/,'global Donate control has a compact themed treatment');

assert.match(index,/id="fleetInsight"/,'Fleet Performance has a decision-first live insight');
assert.match(app,/LIVE RATE IS ABOVE THE SELECTED FLEET TARGET/,'Fleet insight interprets live rate versus target');
assert.match(app,/fleetInsightMeter/,'Fleet insight uses a compact target-comparison meter');
assert.match(styles,/\.fleet-insight-meter/,'Fleet insight meter is styled');

assert.doesNotMatch(app,/class="ore-mix-bar"/,'Ore Mix no longer uses ambiguous top-relative bars');
assert.match(app,/ore-mix-composition/,'Ore Mix uses one proportional composition strip');
assert.match(styles,/\.ore-mix-compact-list/,'Ore Mix keeps exact values in a compact list');

assert.match(tracker,/const topMetric=top\?trackerIntelMetric/,'Hot Zones only promotes a top signal when the selected metric is non-zero');
assert.doesNotMatch(tracker,/tracker-intel-valuebar/,'Hot Zones no longer stretches proportional bars across the card');
assert.match(tracker,/tracker-intel-stat tracker-intel-selected/,'Hot Zones uses compact numeric signal cells');
assert.match(trackerCss,/\.tracker-intel-insight/,'Hot Zones insight treatment is styled');
assert.match(tracker,/trackerOverviewHtml\(losses,status,sourceUrl\)/,'Tracker pairs Hot Zones with recent Heavy Fighter losses');
assert.match(trackerCss,/\.tracker-overview-grid\{display:grid;grid-template-columns:/,'paired Tracker intel uses a restrained two-column layout');
assert.match(trackerCss,/\.fighter-loss-alarm-overlay/,'Heavy Fighter loss alarm has a dedicated visual overlay');
assert.match(index,/id="scoutGlobalAlert"/,'Scout update requests are visible outside the Scout tab');
assert.doesNotMatch(app,/NO MICROPHONE REQUIRED/,'Scout omits redundant microphone copy');
assert.match(app,/id="scoutCharacterSelect"/,'Scout has a travel-toon selector');
assert.match(app,/CLOSEST FIELD UPDATES/,'Scout exposes closest Field Tracker update targets');

assert.match(app,/appLedgerCoverageBadge/,'app ledger sync state is rendered as a badge');
assert.match(app,/myLedgerCoverageBadge/,'personal ledger sync state is rendered as a badge');
assert.match(app,/outside tracked fields/,'ledger diagnostics distinguish payout rows from field attribution');
assert.match(app,/fleetUptimeMeter/,'fleet target exposes the uptime assumption visually');

assert.equal(pkg.version,'2.9.143');
assert.ok(index.includes('/styles.css?v=2.9.143'),'main information-design CSS is cache-busted');
assert.ok(index.includes('/tracker.css?v=2.9.143'),'Tracker information-design CSS is cache-busted');
assert.ok(index.includes('/app.js?v=2.9.143'),'dashboard JS is cache-busted');
assert.ok(index.includes('/tracker.js?v=2.9.143'),'Tracker loader is cache-busted');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.9\.143/,'Tracker core is cache-busted');

assert.match(styles,/\.app\.compact\{width:min\(1120px,calc\(100vw - 12px\)\);max-width:1120px\}/,'Compact app keeps a bounded design width');
assert.match(styles,/\.app\.expanded\{width:min\(1600px,calc\(100vw - 12px\)\);max-width:1600px\}/,'Expanded app keeps a bounded design width');
assert.match(styles,/grid-template-columns:repeat\(auto-fill,minmax\(250px,340px\)\)/,'Compact target cards are capped instead of stretched');
assert.match(styles,/\.fleet-live-card,\.fleet-trend-card\{grid-column:auto;width:100%;max-width:none/,'Live Activity and Ore Value Trend share the same two-column workspace');
assert.match(styles,/\.fleet-perf-list\.compact\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Fleet Performance uses a compact two-column miner list');
assert.match(styles,/\.fleet-performance-summary-line/,'Fleet Performance uses a compact numeric actual-vs-target summary');
assert.match(index,/class="fleet-command-card fleet-trend-card"/,'Ore Value Trend is next to Live Activity Rate');
assert.match(app,/class="fleet-perf-row compact"/,'per-miner performance no longer uses giant progress bars');
assert.doesNotMatch(app,/fleet-share-track/,'per-miner performance removes decorative share bars');
assert.match(styles,/\.market-end-label/,'market chart uses direct end labels');
assert.match(app,/const ticks=3/,'market chart uses restrained grid density');
assert.doesNotMatch(app,/function areaPaths\(\)/,'market chart no longer shades the area between series');
assert.match(app,/class="fleet-latest-label"/,'live fleet chart labels the latest value directly');
assert.doesNotMatch(app,/class="fleet-activity-area"/,'live fleet chart no longer uses decorative area fill');
assert.match(app,/fleet-history-bar'\+\(i===bestIndex\?' best':'\'\)\+\(i===todayIndex\?' today':'\'\)/,'daily chart emphasizes best day and today');

assert.match(app,/doctrine-nyx-buyback/,'Doctrine includes the Nyx Buyback promo tile');
assert.match(app,/discord\.com\/channels\/1275408985171820585\/1465988346185515078/,'Nyx Buyback tile opens the configured Discord channel');
assert.match(styles,/Doctrine Nyx Buyback promo/,'Nyx Buyback promo is styled for the Doctrine side column');

console.log('Information design regression tests passed.');
