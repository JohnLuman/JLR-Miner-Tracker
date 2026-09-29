import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const live=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
const liveCss=fs.readFileSync(new URL('../public/appraisal-enhance.css',import.meta.url),'utf8');
const shareHtml=fs.readFileSync(new URL('../public/appraisal-share.html',import.meta.url),'utf8');
const share=fs.readFileSync(new URL('../public/appraisal-share-enhance.js',import.meta.url),'utf8');
const shareCss=fs.readFileSync(new URL('../public/appraisal-share-enhance.css',import.meta.url),'utf8');

assert.match(index,/appraisal-enhance\.js\?v=4/);
assert.match(index,/appraisal-enhance\.css\?v=4/);
assert.match(live,/PAYOUT %/);
assert.match(live,/JLR NATIVE VALUE MODIFIER/);
assert.match(live,/COPY SUMMARY/);
assert.match(live,/COPY TABLE/);
assert.match(live,/data-jlr-copy/);
assert.match(live,/searchParams\.set\('p'/,'share link carries the payout percentage');
assert.match(live,/\/api\/appraisal\/share/);
assert.match(live,/navigator\.clipboard\.writeText/);
assert.match(liveCss,/jlr-appraisal-payout-bar/);
assert.match(live,/SUPPORT MARKET INTEL/,'Appraisal renders Support intel');
assert.match(live,/COMPRESSION/,'Appraisal renders compression comparison');
assert.match(live,/LIQUIDITY \+ HISTORY/,'Appraisal renders market-history and liquidity context');
assert.match(live,/\/api\/appraisal\/intel/,'Appraisal loads Support intel from the main service');
assert.match(liveCss,/jlr-appraisal-intel/,'Support intel has dedicated presentation');
assert.match(live,/DECISION ENGINE/,'Appraisal compares raw compressed and refine options');
assert.match(live,/LIQUIDITY \+ HISTORY/,'Appraisal exposes liquidity context');
assert.match(live,/JLR SHARED CACHE/,'Appraisal identifies shared snapshot pricing');
assert.match(liveCss,/jlr-appraisal-freshness/,'Appraisal styles freshness status');

assert.match(shareHtml,/appraisal-share-enhance\.js\?v=2/);
assert.match(shareHtml,/appraisal-share-enhance\.css\?v=1/);
assert.match(share,/PAYOUT TOTAL/);
assert.match(share,/COPY SUMMARY/);
assert.match(share,/COPY TABLE/);
assert.match(share,/data-share-copy/);
assert.match(shareCss,/share-payout-kpi/);

console.log('JLR Appraisal enhancement tests passed.');