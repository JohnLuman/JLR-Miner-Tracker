function cleanThreatCell(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^\s*[•●]\s*/, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function addCount(map, value, amount = 1) {
  const label = cleanThreatCell(value);
  if (!label) return;
  const key = label.toLowerCase();
  const current = map.get(key);
  map.set(key, { name: current?.name || label, count: (current?.count || 0) + amount });
}

function looksLikeDistance(value) {
  const text = cleanThreatCell(value).replace(/,/g, '');
  return text === '-' || /^\d+(?:\.\d+)?\s*(?:m|km|au)$/i.test(text);
}

function headerKind(columns) {
  const normalized = columns.map(value => value.toLowerCase());
  if (normalized.includes('type') && (normalized.includes('name') || normalized.includes('distance'))) return 'dscan';
  if (normalized[0] === 'character' || normalized.includes('corporation') || normalized.includes('alliance')) return 'local';
  if (normalized.includes('distance') || normalized[0] === 'name') return 'header';
  return null;
}

export function parseThreatPaste(text) {
  const characterNames = new Map();
  const shipTypeIds = new Map();
  const shipNames = new Map();
  const rawLines = String(text || '').replace(/\r/g, '').split(/\n+/);
  let pasteMode = null;

  for (const raw of rawLines) {
    const line = cleanThreatCell(raw);
    if (!line) continue;
    const columns = (line.includes('\t') ? line.split('\t') : line.split(/\s{3,}/))
      .map(cleanThreatCell)
      .filter(Boolean);
    if (!columns.length) continue;
    const kind = headerKind(columns);
    if (kind) {
      if (kind === 'dscan' || kind === 'local') pasteMode = kind;
      continue;
    }

    const last = columns.at(-1);
    // Once a D-scan header is encountered, keep parsing its rows as ships even
    // when EVE's Distance column is hidden/omitted. Otherwise a ship named for
    // its pilot can be incorrectly resolved as a Local character.
    const hasDistance = looksLikeDistance(last);
    const dscanRow = columns.length >= 2 && (hasDistance || pasteMode === 'dscan');
    if (dscanRow) {
      // Native D-scan copies normally end in Distance. Depending on client/view,
      // the row is Name/Type[/Distance] or Item ID/Name/Type[/Distance].
      const numericFirst = /^\d+$/.test(columns[0].replace(/,/g, ''));
      const typeName = hasDistance ? columns.at(-2) : columns.at(-1);
      if (typeName && !/^unknown$/i.test(typeName)) addCount(shipNames, typeName);
      // Some third-party exports use Type ID/Type/Distance. Keep the ID only
      // when it is in EVE's inventory-type range, not a large item/entity ID.
      if (numericFirst) {
        const typeId = Number(columns[0].replace(/,/g, ''));
        if (typeId > 0 && typeId < 100_000_000) {
          shipTypeIds.set(typeId, (shipTypeIds.get(typeId) || 0) + 1);
          if (typeName) shipNames.delete(typeName.toLowerCase());
        }
      }
      continue;
    }

    const entity = columns[0].replace(/,/g, '').trim();
    if (/^\d+$/.test(entity)) {
      const typeId = Number(entity);
      if (typeId > 0 && typeId < 100_000_000) shipTypeIds.set(typeId, (shipTypeIds.get(typeId) || 0) + 1);
      continue;
    }

    // Plain lines and Local-list rows start with the character name. Avoid
    // treating common clipboard headers as pilots.
    if (!/^(?:name|type|distance|local|channel|member)$/i.test(entity)) {
      characterNames.set(entity.toLowerCase(), entity);
    }
  }

  return {
    names: [...characterNames.values()],
    shipTypeIds,
    shipNames: [...shipNames.values()],
    rawLineCount: rawLines.filter(value => cleanThreatCell(value)).length,
  };
}

function labelMetric(payload, label) {
  const sources = [payload?.weeklyLabels, payload?.recentLabels, payload?.labels];
  for (const source of sources) {
    const row = source?.[label];
    if (row) return Number(row.shipsDestroyed) || 0;
  }
  return 0;
}

export function compactThreatStats(payload) {
  const weekly = payload?.rankings?.weekly?.all?.metrics || {};
  const recent = payload?.rankings?.recent?.all?.metrics || {};
  const destroyed = Number(payload?.shipsDestroyed) || 0;
  const lost = Number(payload?.shipsLost) || 0;
  const pointsDestroyed = Number(payload?.pointsDestroyed) || 0;
  const pointsLost = Number(payload?.pointsLost) || 0;
  let danger = Number(payload?.dangerRatio);
  if (!Number.isFinite(danger)) {
    const good = destroyed + pointsDestroyed;
    const bad = lost + pointsLost;
    danger = good + bad > 0 ? Math.floor(good / (good + bad) * 100) : 0;
  }
  const gangRatio = Number(payload?.gangRatio);
  const soloRatio = Number(payload?.soloRatio);
  return {
    shipsDestroyed: destroyed,
    shipsLost: lost,
    pointsDestroyed,
    pointsLost,
    dangerRatio: Math.max(0, Math.min(100, danger)),
    gangRatio: Number.isFinite(gangRatio) ? gangRatio : null,
    soloRatio: Number.isFinite(soloRatio) ? soloRatio : (Number.isFinite(gangRatio) ? Math.max(0, 100 - gangRatio) : null),
    avgGangSize: Number.isFinite(Number(payload?.avgGangSize)) ? Number(payload.avgGangSize) : null,
    soloKills: Number(payload?.soloKills) || 0,
    iskDestroyed: Number(payload?.iskDestroyed) || 0,
    iskLost: Number(payload?.iskLost) || 0,
    gankerCount: Number(payload?.gankerCount) || labelMetric(payload, 'ganked'),
    awoxCount: Number(payload?.awoxCount) || labelMetric(payload, 'awox'),
    allianceAwoxCount: Number(payload?.allianceAwoxCount) || labelMetric(payload, 'a:awox'),
    factionAwoxCount: Number(payload?.factionAwoxCount) || labelMetric(payload, 'f:awox'),
    fc: payload?.fc || null,
    bait: payload?.bait || null,
    cyno: payload?.cyno || null,
    activityTags: Array.isArray(payload?.activityTags) ? payload.activityTags.slice(0, 12) : [],
    recentShips: Array.isArray(payload?.recentShips) ? payload.recentShips.slice(0, 9) : [],
    topShips: Array.isArray(payload?.topShips) ? payload.topShips.slice(0, 9) : [],
    associates: Array.isArray(payload?.associates) ? payload.associates.slice(0, 10) : [],
    affiliates: Array.isArray(payload?.affiliates) ? payload.affiliates.slice(0, 10) : [],
    weekly: {
      shipsDestroyed: Number(weekly.shipsDestroyed) || 0,
      shipsLost: Number(weekly.shipsLost) || 0,
      pointsDestroyed: Number(weekly.pointsDestroyed) || 0,
      pointsLost: Number(weekly.pointsLost) || 0,
      iskDestroyed: Number(weekly.iskDestroyed) || 0,
      iskLost: Number(weekly.iskLost) || 0,
    },
    recent: {
      shipsDestroyed: Number(recent.shipsDestroyed) || 0,
      shipsLost: Number(recent.shipsLost) || 0,
      pointsDestroyed: Number(recent.pointsDestroyed) || 0,
      pointsLost: Number(recent.pointsLost) || 0,
      iskDestroyed: Number(recent.iskDestroyed) || 0,
      iskLost: Number(recent.iskLost) || 0,
    },
  };
}

export function threatActivityLabels(stats, shipNames = []) {
  const tags = [];
  const push = (label, kind = 'blue') => {
    if (label && !tags.some(item => item.label === label)) tags.push({ label, kind });
  };
  if (stats?.cyno) push('CYNO', 'purple');
  if (stats?.fc) push(`FC ${String(stats.fc.level || '').toUpperCase()}`.trim(), 'orange');
  if (stats?.bait) push(`BAIT ${String(stats.bait.level || '').toUpperCase()}`.trim(), 'orange');
  if (Number(stats?.gankerCount) >= 10) push('GANKER', 'red');
  if (Number(stats?.awoxCount) >= 1) push('AWOX', 'red');
  if (Number(stats?.allianceAwoxCount) >= 1) push('ALLIANCE AWOX', 'red');
  if (Number(stats?.factionAwoxCount) >= 1) push('FACTION AWOX', 'red');
  const solo = Number(stats?.soloRatio);
  if (Number.isFinite(solo) && solo >= 50 && Number(stats?.shipsDestroyed) >= 10) push('SOLO HUNTER', 'orange');
  if (Number(stats?.gangRatio) >= 85 && Number(stats?.shipsDestroyed) >= 10) push('FLEET REGULAR', 'blue');
  if (Number(stats?.weekly?.shipsDestroyed) >= 20) push('VERY ACTIVE', 'red');
  for (const item of Array.isArray(stats?.activityTags) ? stats.activityTags : []) {
    const label = String(item?.label || item?.name || item || '').trim().toUpperCase();
    if (label) push(label, /drop|capital|super|titan|blops|cyno/i.test(label) ? 'red' : 'blue');
  }
  const combined = shipNames.join(' ');
  if (/Avatar|Erebus|Ragnarok|Leviathan|Komodo|Molok|Vanquisher/i.test(combined)) push('TITAN', 'red');
  if (/Aeon|Nyx|Hel|Wyvern|Vendetta|Revenant/i.test(combined)) push('SUPER', 'red');
  if (/Redeemer|Widow|Panther|Sin|Marshal/i.test(combined)) push('BLOPS', 'red');
  if (/Sabre|Flycatcher|Eris|Heretic|Broadsword|Onyx|Phobos|Devoter/i.test(combined)) push('TACKLE', 'orange');
  return tags.slice(0, 10);
}

export function jlrThreatScore(stats, tags = []) {
  const danger = Math.max(0, Math.min(100, Number(stats?.dangerRatio) || 0));
  const weeklyKills = Number(stats?.weekly?.shipsDestroyed) || 0;
  const weeklyIsk = Number(stats?.weekly?.iskDestroyed) || 0;
  let score = danger * 0.72;
  score += Math.min(12, Math.log10(1 + weeklyKills) * 8);
  score += Math.min(7, Math.log10(1 + weeklyIsk / 1e9) * 3.5);
  const labels = tags.map(item => item.label);
  if (labels.some(label => /^CYNO/.test(label))) score += 7;
  if (labels.some(label => /^FC/.test(label))) score += 4;
  if (labels.some(label => /^BAIT/.test(label))) score += 3;
  if (labels.includes('TITAN') || labels.includes('SUPER')) score += 7;
  if (labels.includes('BLOPS')) score += 5;
  if (labels.includes('GANKER') || labels.includes('AWOX')) score += 4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function effectiveStanding(character, standingData) {
  if (!standingData) return null;
  const corporationId = Number(character?.corporation_id);
  const allianceId = Number(character?.alliance_id);
  if (standingData.memberCorporations?.has(corporationId)) return Infinity;
  if (standingData.memberAlliances?.has(allianceId)) return Infinity;

  // Match EVE/RIFT precedence: the most specific target wins first
  // (character, then corporation, then alliance). For each target, personal
  // contacts override corporation contacts, which override alliance contacts.
  const ownerScopes = ['character', 'corporation', 'alliance'];
  const targetIds = [Number(character?.id), corporationId, allianceId]
    .filter(Number.isFinite);
  for (const targetId of targetIds) {
    for (const scope of ownerScopes) {
      const standings = standingData.byOwner?.[scope];
      if (standings?.has(targetId)) return Number(standings.get(targetId));
    }
  }
  return null;
}

export function threatIgnoreReason(character, { ownIds = new Set(), standingData = null } = {}) {
  const id = Number(character?.id);
  if (ownIds.has(id)) return 'own';
  if (effectiveStanding(character, standingData) > 0) return 'positive';
  return null;
}
