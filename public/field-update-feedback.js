(() => {
  const snapshots = new Map();
  const pulses = new Map();
  const sounded = new Map();
  const running = new WeakMap();
  let initialized = false;
  const duration = 15000;
  function observe(state) {
    if(state.fieldAccess?.allowed===false){snapshots.clear();pulses.clear();sounded.clear();initialized=false;return;}
    const current = new Map();
    for (const [system, field] of Object.entries(state.fields || {})) {
      current.set('t3:' + system, JSON.stringify([field.updatedAt, field.status, field.autoReopenedAt, field.cherryPicked, state.scans?.[system]?.lastScanAt]));
    }
    for (const kind of ['ice', 'a0']) {
      for (const row of state.source?.[kind === 'ice' ? 'iceFields' : 'a0Fields'] || []) {
        current.set(kind + ':' + row.system, JSON.stringify([state.scans?.[row.system]?.lastScanAt, row.scan?.lastCheckedAt]));
      }
    }
    // Use the board's exact identity: T2 minerals share one card per system.
    // T3 map rows already represented by a live T3 card are not separate cards.
    const liveT3=new Set((state.source?.systems||[]).map(row=>row.system+'|'+row.ore));
    const groups=new Map();
    for(const row of state.source?.mapFields||[]){
      if(Number(row.tier)===3&&liveT3.has(row.system+'|'+row.ore))continue;
      const id=Number(row.tier)===2?'t2|'+row.system:row.id||[row.system,row.mineral,row.tier].join('|');
      const key='map:'+id;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(JSON.stringify([row.id,row.ore,row.status,row.minedM3,row.siteM3,row.timerEndsAt,row.cycleStartedAt,row.needsScan,row.scanReminderStartedAt,state.scans?.[row.system]?.lastScanAt]));
    }
    for(const [key,rows] of groups)current.set(key,JSON.stringify(rows.sort()));
    const now = Date.now();
    for (const [key, signature] of current) {
      if (initialized && snapshots.get(key) !== signature) pulses.set(key, now);
      snapshots.set(key, signature);
    }
    for (const key of snapshots.keys()) if (!current.has(key)) {snapshots.delete(key);pulses.delete(key);sounded.delete(key);}
    for (const [key, started] of pulses) if (now - started >= duration) { pulses.delete(key); sounded.delete(key); }
    initialized = true;
  }
  function paint(board, notify) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let playSound = false;
    for (const card of board.querySelectorAll('.system-node')) {
      const kind = card.classList.contains('map-field-node') ? 'map' : card.classList.contains('ice-system-node') ? 'ice' : card.classList.contains('a0-system-node') ? 'a0' : 't3';
      const key = card.dataset.boardKey || kind + ':' + card.dataset.system;
      const started = pulses.get(key);
      const previous=running.get(card);
      if (started == null || Date.now() - started >= duration) {previous?.animation.cancel?.();running.delete(card);continue;}
      if (sounded.get(key) !== started) { sounded.set(key, started); playSound = true; }
      if (reducedMotion || !card.animate) {previous?.animation.cancel?.();running.delete(card);continue;}
      if(previous?.started===started)continue;
      previous?.animation.cancel?.();
      const color = kind === 'ice' ? '#72d8ff' : kind === 'a0' ? '#bc7bff' : card.dataset.status === 'cleared' ? '#ff596b' : kind === 'map' ? '#ffb45c' : card.dataset.status === 'picked' ? '#ffd45c' : '#59ed98';
      const animation = card.animate([
        { boxShadow: 'inset 0 0 0 0 transparent', offset: 0 },
        { boxShadow: 'inset 0 0 0 3px ' + color + ', 0 0 14px ' + color, offset: 0.35 },
        { boxShadow: 'inset 0 0 0 0 transparent', offset: 1 },
      ], { duration: 2500, iterations: 6, easing: 'ease-in-out' });
      animation.currentTime = Date.now() - started;
      running.set(card,{started,animation});
    }
    if (playSound) notify?.();
  }
  window.JlrFieldUpdateFeedback = { observe, paint };
})();
