const ORE_ALIASES = {
  Kylixium: ['kylixium'],
  Ueganite: ['ueganite'],
  Griemeer: ['griemeer'],
  Nocxite: ['nocxite', 'noxite'],
  Hezorime: ['hezorime', 'hezormine'],
  Mordinium: ['mordinium', 'mordunium'],
};

function cleanLine(value) {
  return String(value || '').normalize('NFKC').replace(/\u00a0/g, ' ').trim();
}

function looksLikeScannerRow(line) {
  const columns = line.split('\t').map(cleanLine).filter(Boolean);
  const lower = line.toLowerCase();
  if (columns.length >= 3 && !lower.includes('signal strength') && !lower.includes('distance')) return true;
  return /\b(cosmic\s+(?:anomaly|signature)|ore\s+site)\b/i.test(line)
    || /\b\d+(?:\.\d+)?\s*%\b/.test(line)
    || /\b\d+(?:\.\d+)?\s*(?:m|km|au)\b/i.test(line);
}

export function expectedDepositNames(oreName) {
  const canonical = String(oreName || '').trim();
  const aliases = ORE_ALIASES[canonical] || [canonical.toLowerCase()];
  return aliases.filter(Boolean).map(alias => `${alias} deposit`);
}

export function parseProbeScan(text, oreName) {
  const raw = String(text || '').slice(0, 100_000);
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const scannerRows = lines.filter(looksLikeScannerRow);
  const aliases = ORE_ALIASES[String(oreName || '').trim()] || [String(oreName || '').trim().toLowerCase()];
  const matches = lines.filter(line => {
    const lower = line.toLowerCase();
    return aliases.some(alias => alias && lower.includes(alias));
  });

  return {
    valid: scannerRows.length > 0,
    lineCount: lines.length,
    scannerRowCount: scannerRows.length,
    detected: matches.length > 0,
    matches: matches.slice(0, 8),
    expectedNames: expectedDepositNames(oreName),
  };
}


export function parseA0Scan(text) {
  const raw = String(text || '').slice(0, 100_000);
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const scannerRows = lines.filter(looksLikeScannerRow);
  const matches = lines.filter(line => /\b(?:nullsec\s+blue\s+a0\s+rare\s+asteroids|blue\s+a0\s+rare\s+asteroids|a0\s+rare\s+asteroids)\b/i.test(line));
  return {
    valid: scannerRows.length > 0,
    lineCount: lines.length,
    scannerRowCount: scannerRows.length,
    detected: matches.length > 0,
    matches: matches.slice(0, 8),
    siteName: matches.length ? 'Nullsec Blue A0 Rare Asteroids' : null,
  };
}


export function parseIceScan(text) {
  const raw = String(text || '').slice(0, 100_000);
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const scannerRows = lines.filter(looksLikeScannerRow);
  const matches = scannerRows.filter(line => {
    const lower = line.toLowerCase();
    return lower.includes('ice') && /\b(field|belt|site)\b/.test(lower);
  });
  const uniqueMatches = [...new Set(matches.map(line => line.toLowerCase()))];
  return {
    valid: scannerRows.length > 0,
    lineCount: lines.length,
    scannerRowCount: scannerRows.length,
    detected: uniqueMatches.length > 0,
    detectedCount: uniqueMatches.length,
    matches: matches.slice(0, 12),
  };
}
