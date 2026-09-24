import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

const renderAll=app.match(/function renderAll\(\)\{[^\n]+\}/)?.[0]||'';
assert.ok(renderAll,'renderAll function should exist');
assert.doesNotMatch(renderAll,/renderDoctrineMarket\(/,'global app/SSE renders must not rebuild Doctrine Market');

assert.match(app,/function doctrineScrollSnapshot\(/,'Doctrine Market captures table scroll state');
assert.match(app,/tableTop:Math\.max\(0,Number\(table\?\.scrollTop\)\|\|0\)/,'table vertical scroll is captured');
assert.match(app,/tableLeft:Math\.max\(0,Number\(table\?\.scrollLeft\)\|\|0\)/,'table horizontal scroll is captured');
assert.match(app,/function restoreDoctrineScroll\(/,'Doctrine Market restores scroll state');
assert.match(app,/table\.scrollTop=snapshot\.tableTop/,'table vertical scroll is restored');
assert.match(app,/table\.scrollLeft=snapshot\.tableLeft/,'table horizontal scroll is restored');
assert.match(app,/renderDoctrineMarket\(\{preserveScroll\}\)/,'background Doctrine refresh renders with scroll preservation');
assert.match(app,/if\(!preserveScroll\)\{\s*renderDoctrineMarket\(\)/,'existing Doctrine data is not eagerly rebuilt at refresh start');
assert.match(app,/renderDoctrineMarket\(\{preserveScroll:true\}\)/,'shopping-list updates can preserve browsing position');

console.log('Doctrine Market scroll preservation tests passed.');
