import assert from 'node:assert/strict';
import { parseOreSurvey, oreSurveySummaryText } from '../lib/ore-survey.mjs';

const sample = [
  'Arkonor\t28,193\t451,088 m3\t87,100,000.00 ISK\t3,603 m',
  'Arkonor\t29,543\t472,688 m3\t91,200,000.00 ISK\t13 km',
  'Arkonor II-Grade\t14,482\t231,712 m3\t38,800,000.00 ISK\t24 km',
  'Ducinium II-Grade\t5,990\t95,840 m3\t-\t8,024 m',
  'Ueganite II-Grade',
  'Ueganite II-Grade\t97,501\t487,505 m3\t49,900,000.00 ISK\t1,594 m',
  'Ueganite III-Grade',
  'Ueganite III-Grade\t55,077\t275,385 m3\t-\t36 km',
].join('\n');

const parsed=parseOreSurvey(sample);
assert.equal(parsed.valid,true);
assert.equal(parsed.rowCount,6);
assert.equal(parsed.unpricedRowCount,2);
assert.equal(parsed.totalVolumeM3,2014218);
assert.equal(parsed.pricedValueISK,267000000);
assert.equal(parsed.groups[0].name,'Arkonor');
assert.equal(parsed.groups[0].rocks,2);
assert.equal(parsed.nearest[0].name,'Ueganite II-Grade');
assert.equal(parsed.nearest[0].distanceMeters,1594);

const text=oreSurveySummaryText(parsed);
assert.match(text,/Ore survey read: 6 rocks/);
assert.match(text,/2 rocks have no ISK value/);
assert.match(text,/Ueganite II-Grade 1\.59 km/);

assert.equal(parseOreSurvey('Ueganite II-Grade').valid,false);
assert.equal(parseOreSurvey('random clipboard text').valid,false);

console.log('Ore survey parser regression passed');
