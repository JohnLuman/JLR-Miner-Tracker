import assert from 'node:assert/strict';
import { parseProbeScan } from '../lib/probe-scan.mjs';

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
assert.equal(parseProbeScan('random clipboard text', 'Kylixium').valid, false);
assert.equal(parseProbeScan('ID\tGroup\tType\tName\tSignal Strength\tDistance', 'Kylixium').valid, false);

console.log('Probe Scanner parser regression passed');
