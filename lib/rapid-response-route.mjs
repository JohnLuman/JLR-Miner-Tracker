function finiteNumber(value, fallback = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function routeKey(route) {
  const ids = Array.isArray(route?.systemIds) ? route.systemIds.map(Number).filter(Number.isFinite) : [];
  const wormholes = Array.isArray(route?.wormholes)
    ? route.wormholes.map(row => String(row?.id || `${row?.sourceId || ''}:${row?.targetId || ''}`))
    : [];
  if (ids.length || wormholes.length) return `${ids.join('>')}|${wormholes.join(',')}`;
  return String(route?.key || '');
}

function primaryWormholeKey(route) {
  const first = Array.isArray(route?.wormholes) ? route.wormholes[0] : null;
  if (!first) return 'gate-only';
  return String(first.id || `${first.sourceId || ''}:${first.targetId || ''}`);
}

function compareRoutes(a, b) {
  return finiteNumber(a?.transitions) - finiteNumber(b?.transitions)
    || finiteNumber(a?.riskPenalty, 0) - finiteNumber(b?.riskPenalty, 0)
    || finiteNumber(a?.gateJumps) - finiteNumber(b?.gateJumps)
    || finiteNumber(a?.wormholeCount, 0) - finiteNumber(b?.wormholeCount, 0)
    || routeKey(a).localeCompare(routeKey(b));
}

export function chooseRapidResponseRoutes(candidates, maxRoutes = 2) {
  const max = Math.max(1, Math.min(2, Number(maxRoutes) || 2));
  const deduped = new Map();

  for (const route of Array.isArray(candidates) ? candidates : []) {
    if (!route || !Number.isFinite(Number(route.transitions))) continue;
    const key = routeKey(route);
    const current = deduped.get(key);
    if (!current || compareRoutes(route, current) < 0) deduped.set(key, route);
  }

  const ordered = [...deduped.values()].sort(compareRoutes);
  if (!ordered.length) return [];

  const picked = [ordered[0]];
  if (max === 1 || ordered.length === 1) return picked;

  const firstWh = primaryWormholeKey(ordered[0]);
  const independent = ordered.find((route, index) => index > 0 && primaryWormholeKey(route) !== firstWh);
  picked.push(independent || ordered[1]);
  return picked;
}

export function wandererRiskPenalty(connection = {}) {
  const mass = Number(connection.mass_status ?? connection.massStatus);
  const time = Number(connection.time_status ?? connection.timeStatus);
  const locked = Boolean(connection.locked);
  let penalty = 0;
  if (mass === 1) penalty += 1;
  else if (mass >= 2) penalty += 4;
  if (time === 1) penalty += 5;
  else if (time === 2 || time === 3) penalty += 2;
  if (locked) penalty += 1;
  return penalty;
}

export function wandererWarnings(connection = {}) {
  const mass = Number(connection.mass_status ?? connection.massStatus);
  const time = Number(connection.time_status ?? connection.timeStatus);
  const warnings = [];
  if (mass === 1) warnings.push('mass reduced');
  else if (mass >= 2) warnings.push('mass critical');
  if (time === 1) warnings.push('about 1h or less');
  else if (time === 2) warnings.push('about 4h or less');
  else if (time === 3) warnings.push('about 4.5h or less');
  if (connection.locked) warnings.push('locked');
  return warnings;
}
