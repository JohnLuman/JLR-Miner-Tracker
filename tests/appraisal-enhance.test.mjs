import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const live=fs.readFileSync(new URL('../public/appraisal-enhance.js',import.meta.url),'utf8');
const liveCss=fs.readFileSync(new URL('../public/appraisal-enhance.css',import.meta.url),'utf8');
const shareHtml=fs.readFileSync(new URL('../public/appraisal-share.html',import.meta.url),'utf8');
const share=fs.readFileSync(new URL('../public/appraisal-share-enhance.js',import.meta.url),'utf8');
const shareCss=fs.readFileSync(new URL('../public/appraisal-share-enhance.css',import.meta.url),'utf8');

assert.match(index,/appraisal-enhance\.js\?v=1/);
assert.match(index,/appraisal-enhance\.css\?v=1/);
assert.match(live,/PAYOUT %/);
assert.match(live,/COPY SUMMARY/);
assert.match(live,/COPY TABLE/);
assert.match(live,/data-jlr-copy/);
assert.match(live,/searchParams\.set\('p'/,'share link carries the payout percentage');
assert.match(live,/\/api\/appraisal\/share/);
assert.match(live,/navigator\.clipboard\.writeText/);
assert.match(liveCss,/jlr-appraisal-payout-bar/);

assert.match(shareHtml,/appraisal-share-enhance\.js\?v=1/);
assert.match(shareHtml,/appraisal-share-enhance\.css\?v=1/);
assert.match(share,/PAYOUT TOTAL/);
assert.match(share,/COPY SUMMARY/);
assert.match(share,/COPY TABLE/);
assert.match(share,/data-share-copy/);
assert.match(shareCss,/share-payout-kpi/);

console.log('JLR Appraisal enhancement tests passed.');