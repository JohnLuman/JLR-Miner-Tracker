(() => {
  const lifetime=45*60*1000;
  function recent(stamp,at){
    const age=at-Date.parse(stamp);
    return Number.isFinite(age)&&age>=0&&age<lifetime;
  }
  function paint(board,state){
    const sampled=Date.parse(state.serverNow);
    const at=Number.isFinite(sampled)?sampled+Math.max(0,performance.now()-receivedAt):Date.now();
    for(const card of board.querySelectorAll('.system-node')){
      const active=state.fieldAccess?.allowed!==false&&recent(state.miningActivity?.[card.dataset.system],at);
      const existing=card.querySelector('.mining-activity-icon');
      if(!active){existing?.remove();continue;}
      if(existing)continue;
      const icon=document.createElement('span');
      icon.className='mining-activity-icon';
      icon.title='Recent mining in this system • new linked-toon ledger activity within 45 minutes. ESI updates are delayed; this does not identify a specific field.';
      icon.setAttribute('role','img');icon.setAttribute('aria-label','Recent mining in this system');
      icon.innerHTML='<canvas width="200" height="200" aria-hidden="true"></canvas>';
      card.append(icon);
    }
  }
  let receivedAt=performance.now(),lastState=null;
  window.JlrFieldMiningActivity={recent,paint(board,state){if(state!==lastState){receivedAt=performance.now();lastState=state;}paint(board,state);window.JlrMiningScene?.refresh();}};
})();
