import assert from 'node:assert/strict';
import { parseProbeScan, parseIceScan, parseWormholeGasScan } from '../lib/probe-scan.mjs';

const present = [
  'ID\tGroup\tType\tName\tSignal Strength\tDistance',
  'ABC-123\tCosmic Anomaly\tOre Site\tLarge Kylixium Deposit\t100.0%\t4.32 AU',
  'DEF-456\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t8.10 AU',
].join('\n');
const detected = parseProbeScan(present, 'Kylixium');
assert.equal(detected.valid, true);
assert.equal(detected.detected, true);
assert.equal(detected.scannerRowCount, 2);

const missing = parseProbeScan(
  'ABC-123\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t8.10 AU',
  'Kylixium',
);
assert.equal(missing.valid, true);
assert.equal(missing.detected, false);

assert.equal(
  parseProbeScan('ABC-123\tCosmic Anomaly\tOre Site\tLarge Mordunium Deposit\t100.0%\t2 AU', 'Mordinium').detected,
  true,
);
assert.equal(
  parseProbeScan('ABC-123\tCosmic Anomaly\tOre Site\tLarge Hezormine Deposit\t100.0%\t2 AU', 'Hezorime').detected,
  true,
);
assert.equal(
  parseProbeScan('ABC-123\tCosmic Anomaly\tOre Site\tLarge Griemeer Deposit\t100.0%\t2 AU', 'Griemeer').detected,
  true,
);
assert.equal(parseProbeScan('random clipboard text', 'Kylixium').valid, false);
assert.equal(parseProbeScan('ID\tGroup\tType\tName\tSignal Strength\tDistance', 'Kylixium').valid, false);

const iceCoverage = parseIceScan([
  'AAA-111\tCosmic Anomaly\tOre Site\tIce Field\t100.0%\t1.0 AU',
  'BBB-222\tCosmic Anomaly\tOre Site\tLarge Ice Field\t100.0%\t2.0 AU',
  'CCC-333\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t3.0 AU',
].join('\n'));
assert.equal(iceCoverage.valid, true);
assert.equal(iceCoverage.detectedCount, 2);
assert.equal(parseIceScan('CCC-333\tCosmic Anomaly\tCombat Site\tForsaken Hub\t100.0%\t3.0 AU').detectedCount, 0);

const wormholeGas = parseWormholeGasScan([
  'AAA-111\tCosmic Signature\tGas Site\tOrdinary Perimeter Reservoir\t100.0%\t2.0 AU',
  'BBB-222\tCosmic Signature\tGas Site\tInstrumental Core Reservoir\t100.0%\t4.0 AU',
  'CCC-333\tCosmic Signature\tRelic Site\tForgotten Core Data Field\t100.0%\t6.0 AU',
].join('\n'));
assert.equal(wormholeGas.valid, true);
assert.equal(wormholeGas.detectedCount, 2);
assert.equal(wormholeGas.sites[0].signatureId, 'AAA-111');
assert.equal(wormholeGas.sites[0].siteName, 'Ordinary Perimeter Reservoir');
assert.equal(parseWormholeGasScan('CCC-333\tCosmic Signature\tRelic Site\tForgotten Core Data Field\t100.0%\t6.0 AU').detectedCount, 0);

console.log('Probe Scanner parser regression passed');
