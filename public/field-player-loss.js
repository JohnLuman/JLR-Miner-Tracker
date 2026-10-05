(() => {
function drawCombat(canvas){const c=canvas.getContext("2d");c.scale(3,3);
 const poly=(p,fill,stroke)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.8;c.stroke()}};
 const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h)};
 // Familiar twin-outrigger mining barge, now under fire.
 c.save();c.translate(19,30);
 poly([[8,30],[28,24],[67,29],[86,39],[67,52],[24,51],[8,43]],'#38404a','#8e98a0');
 poly([[28,29],[58,29],[69,36],[58,45],[28,44]],'#b98949','#e0b77a');
 for(const y of [8,56]){
  poly([[8,y+3],[23,y-3],[61,y-3],[82,y+4],[90,y+10],[78,y+17],[18,y+15],[7,y+10]],'#4b5158','#929b9f');
  poly([[20,y],[60,y],[76,y+4],[72,y+10],[20,y+10]],'#b9823f','#d9aa68');
  for(let i=0;i<4;i++)rect(23+i*11,y+2,8,6,i%2?'#956c37':'#c2914c');
  rect(9,y+6,6,3,'#86c8d5');poly([[76,y+2],[85,y+6],[87,y+10],[78,y+12],[73,y+8]],'#7e898e','#afbabd');
 }
 poly([[46,24],[51,18],[63,20],[69,28]],'#46545c','#92a2a5');rect(54,21,9,3,'#97c5d2');c.restore();
 // Three original angular raiders, facing inward toward the miner.
 function raider(x,y,s){c.save();c.translate(x,y);c.scale(s,s);poly([[-28,0],[-8,-7],[6,-19],[13,-17],[9,-5],[24,-5],[29,0],[24,5],[9,5],[13,17],[6,19],[-8,7]],'#565867','#aaa4b0');poly([[-25,0],[0,-4],[13,0],[0,4]],'#bfc1c4');poly([[-6,-7],[7,-15],[5,-6]],'#8f3d47');poly([[-6,7],[7,15],[5,6]],'#8f3d47');rect(22,-3,6,6,'#e38769');rect(-1,-2,5,4,'#ffad8e');c.restore()}
 raider(214,32,.8);raider(239,68,.9);raider(206,106,.72);

}
 const observed=new Set(),initialized=new WeakSet();
 let receivedAt=performance.now(),lastState=null;
 const lifetime=30*60*1000;
 function recent(row,at){const age=at-Date.parse(row?.at||'');return Number.isFinite(age)&&age>=0&&age<lifetime}
 function pause(icon){icon.dataset.paused=String(document.hidden||icon.dataset.visible!=='true')}
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.dataset.visible=String(entry.isIntersecting);pause(entry.target)})):null;
 function refresh(){
  for(const icon of observed)if(!icon.isConnected){observer?.unobserve(icon);observed.delete(icon)}
  for(const icon of document.querySelectorAll('#fieldBoard .field-player-loss')){
   if(!initialized.has(icon)){
    icon.innerHTML='<span class="jh-scene"><canvas width="840" height="390" aria-hidden="true"></canvas><span class="jh-fire" aria-hidden="true"><i></i><i></i><i></i><b></b></span><span class="jh-debris" aria-hidden="true"><i></i><i></i><i></i></span></span><span class="jh-alert">RECENT PLAYER LOSS</span><span class="jh-age-text"></span>';
    drawCombat(icon.querySelector('canvas'));
    const sources=[[192,32],[214,68],[186,106]],target=[95,66];
    icon.querySelectorAll('.jh-fire i').forEach((beam,i)=>{const [sx,sy]=sources[i],[ex,ey]=target;beam.style.left=sx/280*100+'%';beam.style.top=sy/130*100+'%';beam.style.width=Math.hypot(ex-sx,ey-sy)/280*100+'%';beam.style.transform='rotate('+Math.atan2(ey-sy,ex-sx)+'rad)'});
    icon.dataset.visible=String(!observer);observer?.observe(icon);observed.add(icon);initialized.add(icon);
   }
   pause(icon);
  }
 }
 function paint(board,state){
  if(state!==lastState){receivedAt=performance.now();lastState=state}
  const sampled=Date.parse(state.serverNow),at=Number.isFinite(sampled)?sampled+Math.max(0,performance.now()-receivedAt):Date.now();
  for(const card of board.querySelectorAll('.system-node')){
   const row=state.playerLosses?.[card.dataset.system];let icon=card.querySelector('.field-player-loss');
   if(state.fieldAccess?.allowed===false||!recent(row,at)){icon?.remove();continue}
   if(!icon){icon=document.createElement('span');icon.className='field-player-loss';icon.setAttribute('role','img');card.append(icon)}
   const age=Math.floor((at-Date.parse(row.at))/60000),label=age?age+' MIN AGO':'JUST NOW';
   icon.dataset.ageLabel=label+' · THIS SYSTEM';
   icon.setAttribute('aria-label','Recent player loss in this system, '+label.toLowerCase());
   icon.title='Player loss reported by zKillboard at '+row.at+'. Reports may be delayed; this illustration does not identify the victim as a miner or indicate ongoing combat.';
  }
  refresh();
  for(const icon of document.querySelectorAll('#fieldBoard .field-player-loss')){
   const text=icon.querySelector('.jh-age-text');if(text)text.textContent=icon.dataset.ageLabel;
  }
 }
 document.addEventListener('visibilitychange',()=>observed.forEach(pause));
 window.JlrFieldPlayerLoss={paint,recent};

})();
