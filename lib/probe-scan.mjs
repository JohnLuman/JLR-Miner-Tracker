const WORMHOLE_GAS_SITE_NAMES = [
  'Barren Perimeter Reservoir',
  'Token Perimeter Reservoir',
  'Minor Perimeter Reservoir',
  'Ordinary Perimeter Reservoir',
  'Sizeable Perimeter Reservoir',
  'Bountiful Frontier Reservoir',
  'Vast Frontier Reservoir',
  'Instrumental Core Reservoir',
  'Vital Core Reservoir',
];

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


export function parseWormholeGasScan(text) {
  const raw = String(text || '').slice(0, 100_000);
  const lines = raw.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const scannerRows = lines.filter(looksLikeScannerRow);
  const matches = [];

  for (const line of scannerRows) {
    const lower = line.toLowerCase();
    const siteName = WORMHOLE_GAS_SITE_NAMES.find(name => lower.includes(name.toLowerCase()));
    if (!siteName) continue;
    const columns = line.split('\t').map(cleanLine).filter(Boolean);
    const signatureId = (columns.find(value => /^[a-z0-9]{3}-\d{3}$/i.test(value)) || '').toUpperCase() || null;
    matches.push({ signatureId, siteName, line });
  }

  const unique = new Map();
  for (const row of matches) {
    const key = row.signatureId ? `${row.signatureId}:${row.siteName}` : row.siteName;
    if (!unique.has(key)) unique.set(key, row);
  }
  const sites = [...unique.values()];

  return {
    valid: scannerRows.length > 0,
    lineCount: lines.length,
    scannerRowCount: scannerRows.length,
    detected: sites.length > 0,
    detectedCount: sites.length,
    sites,
    siteNames: [...new Set(sites.map(site => site.siteName))],
  };
}
