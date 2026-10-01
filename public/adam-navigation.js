(() => {
  function recommendation(response, characterId, at = Date.now()) {
    if (!['nearest-system', 'nearest-system-current', 'nearest-system-error'].includes(response?.topic)) return null;
    return { target: response.closest || null, updatesOnly: Boolean(response.updatesOnly || response.topic === 'nearest-system-current'), text: String(response.text || ''), origin: response.location?.system || '', characterId: String(characterId || ''), at };
  }
  function select(answer, { characterId, location, scans = {}, at = Date.now() } = {}) {
    if (!answer || answer.characterId !== String(characterId || '') || at - answer.at >= 5 * 60_000) return null;
    if (location?.system && answer.origin && location.system !== answer.origin) return null;
    const target = answer.target;
    // The recommendation has been fulfilled once a newer scan is saved.
    if (answer.updatesOnly && target && Date.parse(scans[target.system]?.lastScanAt || '') >= answer.at) return null;
    return answer;
  }
  function followup(question, answer, options = {}) {
    const current = select(answer, options);
    const q = String(question || '').toLowerCase();
    if (!current?.target?.system || !/\b(?:there|that system|that one)\b/.test(q)) return question;
    if (!/\b(?:get|go|travel|route|way|directions|gates|jumps)\b/.test(q)) return question;
    return 'route to ' + current.target.system;
  }
  window.JlrAdamNavigation = { recommendation, select, followup };
})();
