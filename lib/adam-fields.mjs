import { actionableLedgerScanWarning } from './brain-location.mjs';

const compact = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function resolveAdamSystem(question, names) {
  const unique = [...new Set(names.filter(Boolean))];
  const tokens = String(question || '').toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g) || [];
  const exact = unique.filter(name => tokens.includes(name.toUpperCase()));
  if (exact.length) return { system: exact.length === 1 ? exact[0] : null, candidates: exact, explicit: true };
  const matches = unique.filter(name => tokens.some(token => {
    const key = compact(token), full = compact(name);
    // Numeric EVE prefixes such as B170/B17 are useful shorthand. Avoid
    // matching ordinary words and require a unique match before choosing.
    return key.length >= 3 && /\d/.test(key) && full.startsWith(key);
  }));
  return { system: matches.length === 1 ? matches[0] : null, candidates: matches, explicit: matches.length > 0 };
}

export function answerAdamFieldQuestion({ question, names, fields = {}, scans = {}, context = {}, at = Date.now() }) {
  const q = String(question || '').toLowerCase().replace(/\b(?:udpate|upate|updaet)\b/g, 'update');
  const scanQuestion = /\b(?:scan|scanned|scanning|update|updated|updating|refresh|fresh|stale|due|recorded|saved)\b/.test(q);
  const confirmation = /\b(?:did (?:it|that) work|did (?:it|that) go through|already did|just did|worked|registered)\b/.test(q);
  if (!scanQuestion && !confirmation) return null;
  const resolved = resolveAdamSystem(question, names);
  if (resolved.candidates.length > 1) return { handled: true, topic: 'field-clarify', text: 'Which system do you mean: ' + resolved.candidates.join(', ') + '? Please use its full name.' };
  const lastAction = [...(context.recentActions || [])].reverse().find(row => row.kind === 'scan-updated' && at - Number(row.at) >= 0 && at - Number(row.at) <= 30 * 60_000);
  const contextual = confirmation || /\b(?:this|that|selected|current|it|already|just)\b/.test(q) || /^(?:needs? (?:an? )?update|scan status|last scan|did.*save)/.test(q);
  const system = resolved.system || (contextual ? (confirmation || /\b(?:already|just)\b/.test(q) ? lastAction?.system : null) || context.selectedSystem : null);
  if (!system || !names.includes(system)) return null;
  const scan = scans[system];
  const timestamp = Date.parse(scan?.lastScanAt || '');
  if (!Number.isFinite(timestamp) || timestamp > at + 60_000) return { handled: true, topic: 'field-scan', focusSystem: system, text: system + ': I do not have a valid saved scan timestamp yet. A button click or pasted text alone does not confirm an update was saved.' };
  const minutes = Math.max(0, Math.floor((at - timestamp) / 60_000));
  const age = minutes < 1 ? 'just now' : minutes < 60 ? minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago' : Math.floor(minutes / 60) + ' hours ' + minutes % 60 + ' minutes ago';
  const ledgerDue = actionableLedgerScanWarning(scan, { at });
  const expired = at - timestamp >= 12 * 60 * 60_000;
  const due = expired || ledgerDue;
  const source = scan.source === 'clear-report' ? 'clear report' : 'scan';
  const parts = [system + ': ' + (due ? 'Yes, another update is due.' : 'No, it does not need another scan right now.'), 'The latest ' + source + ' was saved ' + age + ' (' + scan.lastScanAt + ').'];
  if (expired) parts.push('That is outside the 12-hour scan window.');
  else if (ledgerDue) parts.push('Mining or respawn evidence after that scan now calls for another check; the one-hour repeat-scan cooldown has passed.');
  else parts.push('The saved update is current' + (minutes < 60 ? ', and I will not request a repeat scan inside the one-hour cooldown.' : '.'));
  const field = fields[system];
  if (field) parts.push('The T3 field is marked ' + ({ ready: 'mineable', picked: 'picked', cleared: 'cleared / respawning' }[field.status] || field.status) + '; scan freshness and field condition are separate.');
  if (scan.t3) parts.push(scan.t3.detected ? 'The last scan detected the T3 site.' : 'The last scan did not detect the T3 site.');
  if (scan.ice) parts.push('Ice fields seen: ' + scan.ice.seen + ' of ' + scan.ice.expected + '.');
  return { handled: true, topic: 'field-scan', focusSystem: system, text: parts.join(' '), lastScanAt: scan.lastScanAt, needsScan: due };
}
