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
assert.match(text,/2 rocks could not be valued/);
assert.match(text,/Ueganite II-Grade 1\.59 km/);

const fallbackSample='Kylixium\t100\t1,000 m3\t-\t1 km';
const fallback=parseOreSurvey(fallbackSample,{
  pricePerM3ForName:name=>name==='Kylixium'?250:null,
});
assert.equal(fallback.valid,true);
assert.equal(fallback.rowCount,1);
assert.equal(fallback.unpricedRowCount,0);
assert.equal(fallback.estimatedRowCount,1);
assert.equal(fallback.estimatedValueISK,250000);
assert.equal(fallback.pricedValueISK,250000);
assert.equal(fallback.groups[0].estimatedRows,1);
assert.match(oreSurveySummaryText(fallback),/estimated from JLR pricing/);

const refinedSample=[
  'Kylixium\t100\t1,000 m3\t999,999,999.00 ISK\t1 km',
  'Unknownium\t100\t500 m3\t123,000.00 ISK\t2 km',
].join('\n');
const refined=parseOreSurvey(refinedSample,{
  pricePerM3ForName:name=>name==='Kylixium'?250:null,
  replaceReportedValues:true,
});
assert.equal(refined.valid,true);
assert.equal(refined.pricingBasis,'jlr-refined');
assert.equal(refined.rowCount,2);
assert.equal(refined.pricedRowCount,1);
assert.equal(refined.unpricedRowCount,1);
assert.equal(refined.pricedValueISK,250000);
assert.equal(refined.estimatedRowCount,1);
assert.equal(refined.nearest[0].reportedValueISK,999999999);
assert.equal(refined.nearest[0].valueBasis,'jlr-refined');
assert.match(oreSurveySummaryText(refined),/refined value/);
assert.match(oreSurveySummaryText(refined),/Max-refine mineral value at current Jita buy prices/);
assert.match(oreSurveySummaryText(refined),/Unvalued: Unknownium x1 \(500 m³\)/);

const payout=parseOreSurvey('Kylixium\t100\t1,000 m3\t999,999,999.00 ISK\t1 km',{
  pricePerM3ForName:name=>name==='Kylixium'?237.5:null,
  replaceReportedValues:true,
  pricingBasis:'jlr-95-refined',
});
assert.equal(payout.pricingBasis,'jlr-95-refined');
assert.equal(payout.pricedValueISK,237500);
assert.equal(payout.nearest[0].valueBasis,'jlr-95-refined');
assert.match(oreSurveySummaryText(payout),/95% JBV payout value/);
assert.match(oreSurveySummaryText(payout),/95% of max-refine mineral value/);

assert.equal(parseOreSurvey('Ueganite II-Grade').valid,false);
assert.equal(parseOreSurvey('random clipboard text').valid,false);

console.log('Ore survey parser regression passed');
