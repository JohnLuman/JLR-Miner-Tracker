// A0 active-site selection follows the corporation's single-site tracking rule.
// Retain the most recent positive confirmation even after a negative scan so
// that clearing the current site cannot resurrect an older historical report.
export function latestA0Site(reports = {}) {
  const confirmations = Object.entries(reports).map(([system, report]) => ({
    system,
    report,
    at: Date.parse(report?.lastDetectedAt || (report?.detected ? report.lastCheckedAt : '') || ''),
  })).filter(row => Number.isFinite(row.at))
    .sort((a, b) => b.at - a.at || a.system.localeCompare(b.system));
  const latest = confirmations[0];
  return latest ? { system: latest.system, active: Boolean(latest.report.detected), confirmedAt: new Date(latest.at).toISOString() } : null;
}

export function preserveA0ConfirmationHistory(reports = {}) {
  for (const report of Object.values(reports)) {
    if (report?.detected && !report.lastDetectedAt && Number.isFinite(Date.parse(report.lastCheckedAt || ''))) report.lastDetectedAt = report.lastCheckedAt;
  }
  return reports;
}
