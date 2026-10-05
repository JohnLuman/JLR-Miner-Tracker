(() => {
  const lifetime=45*60*1000;
  function recent(stamp,at){
    const age=at-Date.parse(stamp);
    return Number.isFinite(age)&&age>=0&&age<lifetime;
  }
  function paint(board,state){
    const sampled=Date.parse(state.serverNow);
    const at=Number.isFinite(sampled)?sampled+Math.max(0,performance.now()-receivedAt):Date.now();
    const cards=[...board.querySelectorAll('.system-node')];
    const perSystem=new Map();
    for(const card of cards){
      const system=String(card.dataset.system||'');
      perSystem.set(system,(perSystem.get(system)||0)+1);
    }
    for(const card of cards){
      const system=String(card.dataset.system||'');
      const boardKey=String(card.dataset.boardKey||'');
      const exact=boardKey?state.miningActivity?.[boardKey]:null;
      const legacy=perSystem.get(system)===1?state.miningActivity?.[system]:null;
      const active=state.fieldAccess?.allowed!==false&&recent(exact||legacy,at)&&!window.JlrFieldPlayerLoss?.recent(state.playerLosses?.[system],at);
      const existing=card.querySelector('.mining-activity-icon');
      if(!active){existing?.remove();continue;}
      if(existing)continue;
      const icon=document.createElement('span');
      icon.className='mining-activity-icon';
      icon.title='Recent mining matched to this field from linked-toon ESI ledger ore activity within 45 minutes.';
      icon.setAttribute('role','img');icon.setAttribute('aria-label','Recent mining matched to this field');
      icon.innerHTML='<canvas width="200" height="200" aria-hidden="true"></canvas>';
      card.append(icon);
    }
  }
  let receivedAt=performance.now(),lastState=null;
  window.JlrFieldMiningActivity={recent,paint(board,state){if(state!==lastState){receivedAt=performance.now();lastState=state;}paint(board,state);window.JlrMiningScene?.refresh();}};
})();
