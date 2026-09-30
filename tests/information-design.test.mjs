import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const themes=fs.readFileSync(new URL('../public/themes.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tracker=fs.readFileSync(new URL('../public/tracker-core.js',import.meta.url),'utf8');
const trackerCss=fs.readFileSync(new URL('../public/tracker.css',import.meta.url),'utf8');
const trackerLoader=fs.readFileSync(new URL('../public/tracker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.match(index,/class="kpis information-kpis operations-summary-bar"/,'top metrics are presented as one summary bar');
assert.match(index,/class="kpi summary-cell summary-cell-payout api-kpi app-payout-kpi"/,'app payout leads the one-line summary');
assert.match(index,/class="kpi summary-cell fleet-target-kpi"/,'fleet target remains a compact summary metric');
assert.match(index,/>MY TOONS<\/span>/,'personal payout stays in the top summary');
assert.match(index,/>JITA \/ HR<\/span>[\s\S]*>C-N \/ HR<\/span>/,'Jita and C-N remain adjacent in the summary flow');
assert.match(styles,/v2\.9\.144 — one-line decision summary/,'top summary uses the one-line decision bar');
assert.match(styles,/\.operations-summary-bar\{display:grid;grid-template-columns:/,'all six summary metrics share one horizontal grid');
assert.match(styles,/repeat\(6,minmax\(105px,1fr\)\)/,'summary compresses evenly before mobile overflow');
assert.doesNotMatch(index,/market-payout-pair/,'summary no longer needs a nested market row');
assert.match(index,/appLedgerCoverageBadge/,'app ledger coverage is a compact badge');
assert.match(index,/myLedgerCoverageBadge/,'personal ledger coverage is a compact badge');
assert.match(index,/data-nav-group="ops"[\s\S]*?<strong>OPS<\/strong>/,'navigation has an Operations group');
assert.match(index,/data-nav-group="resources"[\s\S]*?<strong>RESOURCES<\/strong>/,'navigation has a Resources group');
assert.match(index,/data-nav-group="intel"[\s\S]*?<strong>INTEL<\/strong>/,'navigation has an Intel group');
assert.match(index,/data-nav-group="system"[\s\S]*?<strong>SYSTEM<\/strong>/,'navigation has a System group');
assert.match(index,/id="donateTop"/,'global Donate control is present in the app header');
assert.match(index,/paypal\.com\/ncp\/payment\/J7UYHR2RJFS6N/,'global Donate control uses the configured PayPal destination');
assert.match(app,/jlr-donate-banner-feedback/,'Feedback hub contains the full Donate banner');
assert.match(styles,/\.jlr-donate-banner\{--donate-accent:var\(--theme-accent/,'Donate banner inherits the active dashboard theme');
assert.match(styles,/\.donate-top-link/,'global Donate control has a compact themed treatment');
assert.match(index,/value="neon"[^>]*>NEON GRID<\/option>/,'Neon Grid theme is available');
assert.match(index,/value="glacier"[^>]*>GLACIER<\/option>/,'Glacier theme is available');
assert.match(index,/value="solar"[^>]*>SOLAR FLARE<\/option>/,'Solar Flare theme is available');
assert.match(index,/value="industrial"[^>]*>INDUSTRIAL<\/option>/,'legacy Forge theme is renamed Industrial');
assert.match(styles,/\.nav-menu\[open\]\{z-index:120\}/,'open dropdown is raised above neighboring nav groups');
assert.match(index,/id="themeSelectIcon"/,'theme selector shows the selected EVE image');
assert.match(index,/data-theme-icon="neon"/,'theme choices use original JLR glyph identifiers');
assert.match(styles,/\.theme-menu-image/,'theme picker renders original glyph thumbnails');
assert.match(app,/function themeIconMarkup/,'theme selector glyphs are generated locally');
assert.doesNotMatch(index,/images\.evetech\.net\/types\//,'theme selector does not depend on EVE ship or ore art');
assert.match(index,/themes\.css\?v=2\.10\.11/,'dedicated consolidated theme stylesheet is cache-busted');
for(const theme of ['void','citadel','industrial','serpentis','blood','angel','edencom','aurora','neon','glacier','solar']){
  assert.equal((themes.match(new RegExp('^html\\[data-theme="'+theme+'"\\]\\{','gm'))||[]).length,1,theme+' has one palette definition');
}
assert.match(themes,/html\[data-theme="industrial"\] \.section-title::after\{[^}]*repeating-linear-gradient/s,'Industrial retains the hazard stripe');
assert.match(themes,/html\[data-theme="aurora"\] body::before/,'Aurora has its luminous atmosphere');
assert.match(themes,/html\[data-theme="glacier"\] \.glass/,'Glacier has its crystal panels');
assert.match(themes,/html\[data-theme="solar"\] body::before/,'Solar has its radiant treatment');
assert.match(themes,/--semantic-status:var\(--green\)/,'semantic status color remains independent of the theme');
assert.doesNotMatch(themes,/animation:jlr-(aurora-drift|aurora-orbs|solar-rays|serpentis-sweep|edencom-sweep|neon-vertical-scan)/,'full-screen theme layers remain static');
assert.doesNotMatch(themes,/html\[data-theme="(aurora|glacier)"\] \.glass\{[^}]*backdrop-filter/s,'repeated glass cards avoid backdrop blur');

assert.match(index,/id="fleetInsight"/,'Fleet Performance has a decision-first live insight');
assert.match(app,/Sampled rate met the fitted target/,'Fleet insight interprets sampled rate versus target');
assert.match(app,/fleetInsightMeter/,'Fleet insight uses a compact target-comparison meter');
assert.match(styles,/\.fleet-insight-meter/,'Fleet insight meter is styled');
assert.match(index,/id="fleetTodayAvgRate"/,'Fleet Performance exposes today’s average sampled m³/hr');
assert.match(app,/todayRateSamples\.reduce/,'today average rate is calculated from the current EVE-day sample dataset');
assert.match(app,/fleet-average-line/,'sampled-rate graph renders a daily average reference line');
assert.match(app,/bindFleetChartInteractions/,'both fleet graphs expose interactive hover and click behavior');
assert.match(app,/data-fleet-chart-date/,'fleet graphs link matching dates across charts');
assert.match(styles,/\.fleet-chart-tooltip/,'fleet graph hover/click details use a dedicated tooltip');
assert.match(styles,/\.fleet-chart-linked/,'linked dates are visually emphasized across both graphs');
assert.match(index,/data-rate-metric="efficiency"/,'sampled-rate graph can switch to efficiency percent');
assert.match(app,/fleetRateMetric/,'fleet efficiency graph mode is persisted');
assert.match(app,/% OF TARGET/,'efficiency mode normalizes sampled output against the fitted fleet target');
assert.match(index,/id="fleetDayProgressChart"/,'Fleet Performance includes cumulative EVE-day progress');
assert.match(app,/function fleetDayProgressSeries/,'EVE-day progress is derived from retained interval m3 samples');
assert.match(app,/fleet-progress-today/,'day-progress chart renders today');
assert.match(app,/fleet-progress-yesterday/,'day-progress chart renders yesterday');
assert.match(styles,/\.fleet-progress-today/,'today progress series has dedicated chart styling');
assert.match(styles,/\.fleet-progress-yesterday/,'yesterday progress series has dedicated chart styling');

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
assert.match(tracker,/const ALERT_MAX_AGE_MS=60\*1000/,'Heavy Fighter alert window is capped at 60 seconds');
assert.match(tracker,/Date\.parse\(String\(row\?\.receivedAt\|\|''\)\)/,'Heavy Fighter alert freshness is based on JLR receive time');
assert.match(tracker,/filter\(isAlertFresh\)/,'polling cannot alarm on historical losses that merely look unseen');
assert.match(index,/id="scoutGlobalAlert"/,'Scout update requests are visible outside the Scout tab');
assert.doesNotMatch(app,/NO MICROPHONE REQUIRED/,'Scout omits redundant microphone copy');
assert.match(app,/id="scoutCharacterSelect"/,'Scout has a travel-toon selector');
assert.match(app,/id="scoutTargetList"/,'Scout exposes closest Field Tracker update targets');

assert.match(app,/appLedgerCoverageBadge/,'app ledger sync state is rendered as a badge');
assert.match(app,/myLedgerCoverageBadge/,'personal ledger sync state is rendered as a badge');
assert.match(app,/outside tracked fields/,'ledger diagnostics distinguish payout rows from field attribution');
assert.match(app,/fleetUptimeMeter/,'fleet target exposes the uptime assumption visually');

assert.equal(pkg.version,'2.10.11');
assert.ok(index.includes('/styles.css?v=2.10.11'),'main information-design CSS is cache-busted');
assert.ok(index.includes('/tracker.css?v=2.10.11'),'Tracker information-design CSS is cache-busted');
assert.ok(index.includes('/app.js?v=2.10.11'),'dashboard JS is cache-busted');
assert.ok(index.includes('/tracker.js?v=2.10.11'),'Tracker loader is cache-busted');
assert.match(trackerLoader,/tracker-core\.js\?v=2\.10\.11/,'Tracker core is cache-busted');

assert.match(styles,/\.app\.compact\{width:min\(1120px,calc\(100vw - 12px\)\);max-width:1120px\}/,'Compact app keeps a bounded design width');
assert.match(styles,/\.app\.expanded\{width:min\(1600px,calc\(100vw - 12px\)\);max-width:1600px\}/,'Expanded app keeps a bounded design width');
assert.match(styles,/grid-template-columns:repeat\(auto-fill,minmax\(250px,340px\)\)/,'Compact target cards are capped instead of stretched');
assert.match(styles,/\.fleet-miner-card,\.fleet-ore-card\{grid-column:1\/-1;width:100%;max-width:none/,'Miner comparison and ore mix get full-width review space');
assert.match(styles,/\.fleet-perf-list\.compact\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Fleet Performance uses a compact two-column miner list');
assert.match(styles,/\.fleet-performance-summary-line/,'Fleet Performance uses a compact numeric actual-vs-target summary');
assert.match(index,/class="fleet-command-card fleet-miner-card"/,'Miner comparison lives inside the main Fleet Performance review');
assert.match(index,/ORE VALUE ANALYTICS/,'Ore market context is separated from fleet execution review');
assert.match(app,/class="fleet-perf-row compact"/,'per-miner performance no longer uses giant progress bars');
assert.doesNotMatch(app,/fleet-share-track/,'per-miner performance removes decorative share bars');
assert.match(index,/id="adamQuickToggle"/,'Ask Adam is available outside the Adam tab');
assert.match(index,/id="adamQuickPanel"/,'global Adam panel is present');
assert.match(index,/adam-quick-conversation/,'global Adam uses a conversation layout');
assert.match(styles,/app-tab\.adam-current/,'Adam shows a calm current state after an update clears');
assert.match(styles,/adam-nearest-mining/,'nearest mining system has a dedicated readable card');

assert.match(index,/id="toonLinkedCount"/,'Toons tab has a linked-character summary');
assert.match(app,/toon-state-'\+stateKey/,'Toons tab renders explicit per-character data states');
assert.match(styles,/v2\.9\.144-system-pass1/,'system-wide UI pass is styled');
assert.match(trackerCss,/tracker-hourly-badge/,'Tracker region selector shows its hourly refresh cadence');
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
