(() => {
 function draw(card){
  const canvas=card.querySelector('canvas'),c=canvas.getContext('2d');c.setTransform(2,0,0,2,0,0);
  const kind=card.dataset.kind,accent=card.style.getPropertyValue('--ore');
  function poly(points,fill,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.65;c.stroke()}}
  function line(x,y,xx,yy,color,w=1){c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=color;c.lineWidth=w;c.stroke()}
  function rect(x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h)}
  const halo=c.createRadialGradient(205,76,2,205,76,60);halo.addColorStop(0,accent+'17');halo.addColorStop(1,accent+'00');c.fillStyle=halo;c.fillRect(145,16,120,120);
  // An original, stylized industrial barge: central cargo hull and twin strip-miner arms.
  c.save();c.translate(17,34);
  poly([[8,36],[20,26],[43,21],[66,27],[82,36],[82,46],[65,53],[30,54],[10,45]],'#232a32','#727b84');
  poly([[17,32],[37,26],[67,31],[77,36],[63,44],[31,44],[17,40]],'#6e6659','#a2987f');
  poly([[32,29],[61,30],[67,35],[60,40],[31,39]],'#c18b43','#e1b16a');
  poly([[33,39],[60,40],[63,47],[32,47]],'#775027');
  for(let i=0;i<3;i++){line(36+i*9,30,36+i*9,38,'#674d32',1.2);rect(36+i*9,42,5,3,'#ab7c3d')}
  poly([[48,25],[51,19],[63,20],[70,28]],'#37434d','#8c9a9c');
  poly([[53,20],[62,21],[65,24],[54,24]],'#90c4cd');
  // Parallel outriggers, orange armour plates and machined recesses.
  for(const y of [9,57]){
   poly([[10,y+1],[21,y-3],[64,y-3],[83,y+3],[91,y+10],[80,y+17],[20,y+16],[7,y+10]],'#434b52','#8b9292');
   poly([[20,y],[62,y],[77,y+4],[74,y+10],[20,y+10]],'#b67c37','#d4a05b');
   poly([[20,y+10],[74,y+10],[80,y+14],[20,y+14]],'#65513a');
   for(let j=0;j<4;j++){rect(24+j*11,y+2,8,6,j%2?'#946a34':'#c38b46');line(26+j*11,y+2,26+j*11,y+8,'#d0a264',.8)}
   rect(8,y+5,9,5,'#121f28');rect(8,y+6,3,3,'#80cee0');
   poly([[76,y+2],[84,y+5],[88,y+9],[80,y+12],[73,y+9]],'#68747a','#afbdbe');
   rect(82,y+5,5,3,'#a6edc3');
  }
  line(29,26,30,24,'#bcb69e',2);line(39,51,39,57,'#737c83',3);
  line(63,15,60,27,'#727c84',4);line(66,48,64,58,'#727c84',4);
  for(const [x,y] of [[26,14],[65,17],[26,62],[65,65],[22,37]])rect(x,y,1.5,1.5,'#e5d8a8');
  c.restore();
  if(kind==='ice'){
   poly([[183,42],[211,27],[234,41],[244,79],[225,110],[195,104],[178,78]],'#2d617d','#9ed9e3');
   poly([[183,42],[211,27],[213,65],[178,78]],'#84c6d7');
   poly([[211,27],[234,41],[213,65]],'#bbe4e9');
   poly([[213,65],[234,41],[244,79],[225,110]],'#447e9b');
   poly([[178,78],[213,65],[195,104]],'#548eac');
   poly([[213,65],[225,110],[195,104]],'#1b4e70');
   line(193,46,196,72,'#d6f1ee',1.2);line(217,38,224,57,'#d6f1ee');line(224,77,230,84,'#82bdce');
  }else{
   const pts=[[183,49],[200,35],[222,34],[242,54],[247,80],[235,101],[211,112],[190,102],[179,79]],center=[211,75];
   const shades=kind==='a0'?['#798276','#a2aa93','#788373','#596858','#414d46','#626e62','#869180','#596458','#6c7668']:kind==='t2'?['#847052','#b39a6b','#8b7552','#685639','#493f30','#796344','#9b835d','#594a36','#7b684c']:['#766581','#a38eb0','#786587','#52445f','#3d3249','#655270','#877194','#52435e','#786583'];
   pts.forEach((p,i)=>poly([p,pts[(i+1)%pts.length],center],shades[i],'#171921'));
   poly([[195,50],[207,43],[220,45],[214,60],[202,65]],kind==='a0'?'#bac1a3':'#9d91a6');
   poly([[220,81],[234,76],[236,90],[224,99],[215,95]],'#343a3b');
   for(const [x,y,s] of [[186,67,4],[229,49,3],[199,92,5],[216,103,3],[232,66,4]]){
    poly([[x,y],[x+s+2,y-2],[x+s,y+s],[x-2,y+s-1]],'#30333a');
    line(x-1,y-1,x+s,y-3,'#c0b7bc',.7);
   }
   c.save();c.globalAlpha=.85;line(201,37,207,57,accent,3);line(207,57,218,67,accent,2.3);line(218,67,214,78,accent,1.6);line(222,97,211,89,accent,2.5);c.restore();
   if(kind==='a0')for(const [x,y] of [[200,50],[220,75],[200,92]]){
    poly([[x,y],[x+4,y-10],[x+9,y-4],[x+7,y+6]],'#c6d4ab','#e5ebc9');poly([[x+4,y-10],[x+9,y-4],[x+7,y+6],[x+4,y+1]],'#809873');
   }
  }
  // Sparse, fixed fragments avoid particle simulation work.
  for(const [x,y,r] of [[186,113,2],[247,40,2.3],[250,102,1.6],[171,91,1.4]]){poly([[x-r,y],[x,y-r],[x+r,y+1],[x,y+r]],'#778080')}
 }
 const observed=new Set(),initialized=new WeakSet();
 const palette={t3:'#bd92ff',t2:'#edbd68',ice:'#8de5f5',a0:'#91e0b1'};
 function kindFor(card){return card.classList.contains('ice-system-node')?'ice':card.classList.contains('a0-system-node')?'a0':card.classList.contains('tier-2')?'t2':'t3'}
 function pause(icon){icon.dataset.paused=String(document.hidden||icon.dataset.visible!=='true')}
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  entries.forEach(entry=>{entry.target.dataset.visible=String(entry.isIntersecting);pause(entry.target)});
 }):null;
 function refresh(){
  for(const icon of observed)if(!icon.isConnected){observer?.unobserve(icon);observed.delete(icon)}
  for(const icon of document.querySelectorAll('#fieldBoard .mining-activity-icon')){
   if(!initialized.has(icon)){
    const kind=kindFor(icon.closest('.system-node'));icon.dataset.kind=kind;icon.style.setProperty('--ore',palette[kind]);
    const canvas=icon.querySelector('canvas');canvas.width=560;canvas.height=300;
    const scene=document.createElement('span');scene.className='jlr-mining-art';scene.append(canvas);icon.append(scene);
    draw(icon);
    const beams=document.createElement('span');beams.className='jlr-mining-beams';beams.setAttribute('aria-hidden','true');scene.append(beams);
    const targets=kind==='ice'?[[180.5,65],[183.5,88]]:[[181.5,65],[183,87]];
    [[104,49.5],[104,97.5]].forEach(([sx,sy],i)=>{
     const [ex,ey]=targets[i],beam=document.createElement('i'),impact=document.createElement('b');
     beam.style.left=(sx/280*100)+'%';beam.style.top=(sy/150*100)+'%';beam.style.width=(Math.hypot(ex-sx,ey-sy)/280*100)+'%';beam.style.transform='translateY(-50%) rotate('+Math.atan2(ey-sy,ex-sx)+'rad)';
     impact.style.left=(ex/280*100)+'%';impact.style.top=(ey/150*100)+'%';beams.append(beam,impact);
    });
    const label=document.createElement('span');label.className='jlr-mining-label';label.textContent='RECENT MINING';icon.append(label);
    icon.dataset.visible=String(!observer);pause(icon);observer?.observe(icon);observed.add(icon);initialized.add(icon);
   }
   pause(icon);
  }
 }
 document.addEventListener('visibilitychange',()=>observed.forEach(pause));
 window.JlrMiningScene={refresh,kindFor};

})();
