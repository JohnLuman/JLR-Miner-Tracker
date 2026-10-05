(() => {
  const snapshots = new Map();
  const pulses = new Map();
  const sounded = new Map();
  let initialized = false;
  const duration = 15000;
  function observe(state) {
    const current = new Map();
    for (const [system, field] of Object.entries(state.fields || {})) {
      current.set('t3:' + system, JSON.stringify([field.updatedAt, field.status, field.autoReopenedAt, field.cherryPicked, state.scans?.[system]?.lastScanAt]));
    }
    for (const kind of ['ice', 'a0']) {
      for (const row of state.source?.[kind === 'ice' ? 'iceFields' : 'a0Fields'] || []) {
        current.set(kind + ':' + row.system, JSON.stringify([state.scans?.[row.system]?.lastScanAt, row.scan?.lastCheckedAt]));
      }
    }
    const now = Date.now();
    for (const [key, signature] of current) {
      if (initialized && snapshots.get(key) !== signature) pulses.set(key, now);
      snapshots.set(key, signature);
    }
    for (const key of snapshots.keys()) if (!current.has(key)) snapshots.delete(key);
    for (const [key, started] of pulses) if (now - started >= duration) { pulses.delete(key); sounded.delete(key); }
    initialized = true;
  }
  function paint(board, notify) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let playSound = false;
    for (const card of board.querySelectorAll('.system-node')) {
      const kind = card.classList.contains('ice-system-node') ? 'ice' : card.classList.contains('a0-system-node') ? 'a0' : 't3';
      const started = pulses.get(kind + ':' + card.dataset.system);
      if (started == null || Date.now() - started >= duration) continue;
      const key = kind + ':' + card.dataset.system;
      if (sounded.get(key) !== started) { sounded.set(key, started); playSound = true; }
      if (reducedMotion || !card.animate) continue;
      const color = kind === 'ice' ? '#72d8ff' : kind === 'a0' ? '#bc7bff' : card.dataset.status === 'cleared' ? '#ff596b' : card.dataset.status === 'picked' ? '#ffd45c' : '#59ed98';
      const animation = card.animate([
        { boxShadow: 'inset 0 0 0 0 transparent', offset: 0 },
        { boxShadow: 'inset 0 0 0 3px ' + color + ', 0 0 14px ' + color, offset: 0.35 },
        { boxShadow: 'inset 0 0 0 0 transparent', offset: 1 },
      ], { duration: 2500, iterations: 6, easing: 'ease-in-out' });
      animation.currentTime = Date.now() - started;
    }
    if (playSound) notify?.();
  }
  window.JlrFieldUpdateFeedback = { observe, paint };
})();
