/* Read-only field detail, fed by the same state snapshots as the board. */
(() => {
  const stamp=value=>Date.parse(value||'');
  const recent=(value,now,minutes)=>Number.isFinite(stamp(value))&&now>=stamp(value)&&now-stamp(value)<minutes*60000;
  const age=(value,now)=>!Number.isFinite(stamp(value))?'Unknown':now-stamp(value)<60000?'Just now':now-stamp(value)<3600000?Math.floor((now-stamp(value))/60000)+'m ago':Math.floor((now-stamp(value))/3600000)+'h ago';
  const volume=value=>Math.round(value).toLocaleString()+' m³';
  function countdown(value,now){
    if(!Number.isFinite(stamp(value)))return 'Not recorded';
    if(stamp(value)<=now)return 'Timer finished · scan to confirm reset';
    let s=Math.ceil((stamp(value)-now)/1000);
    return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')+' until respawn';
  }
  function build(snapshot,now=Date.now()){
    const {state,entry,scanHint,nearest}=snapshot||{};
    if(!state||state.fieldAccess?.allowed===false||!entry)return null;
    const {system,kind,key}=entry,row=(kind==='t3'?entry.d:entry.row)||{},field=entry.f||{};
    const rows=row.rows||[row],scan=state.scans?.[system]||{};
    const scanAt=kind==='a0'?row.scan?.lastCheckedAt:scan.lastScanAt;
    const ledger=kind==='t3'?scan.ledger:null;
    const single=snapshot.systemEntryCount===1;
    const miningAt=state.miningActivity?.[key]||(single?state.miningActivity?.[system]:null);
    const loss=state.playerLosses?.[system];
    const lossRecent=recent(loss?.at,now,30),miningRecent=recent(miningAt,now,45);
    const details=[],activity=[];
    const add=(label,value)=>details.push([label,String(value)]);
    let type='',status='Unknown';
    if(kind==='t3'){
      type='T3 · '+(row.ore||'Ore field');
      status=({ready:'Ready',picked:'Picked',cleared:'Cleared'})[field.status]||'Unknown';
      if(field.cherryPicked)status+=' · Cherry picked';
    }else if(kind==='map'){
      type='T'+row.tier+' · '+rows.map(r=>r.ore==='Awaiting scan'?r.mineral:r.ore).join(' / ');
      status=rows.every(r=>r.status==='cleared')?'Cleared':rows.some(r=>r.status==='cleared')?'Partially cleared':rows.some(r=>r.status==='picked')?'Picked':'Ready';
    }else if(kind==='ice'){
      const total=Math.max(1,Number(row.iceBelts)||1),seen=scan.ice?Math.min(total,Math.max(0,Number(scan.ice.seen)||0)):null;
      type='Ice · '+total+' field'+(total===1?'':'s');
      status=seen===null?'Unconfirmed':seen+' up · '+(total-seen)+' down / cleared';
    }else{
      type='A0 · Rare asteroids';
      status=row.scan?.superseded?'Previous site':scanHint?.stale?'Scan due':row.scan?.detected?'Site active':'No site detected';
    }
    add('Field state',status);
    add(scan.source==='clear-report'&&kind!=='a0'?'Last clear report':'Last scan',age(scanAt,now)+(Number.isFinite(stamp(scanAt))?' · '+new Date(scanAt).toISOString().replace('T',' ').slice(0,19)+' UTC':''));
    if(field.updatedAt)add('Field updated',age(field.updatedAt,now));
    add('Mining',miningRecent?(lossRecent?'Recent activity · player loss reported':'Recent field-matched activity'):'No recent confirmed activity');
    add('Miners present','Unknown · ledger activity does not confirm presence');
    if(kind==='t3'&&ledger){
      const verified=ledger.baselineDetected&&ledger.baselineAt&&ledger.verifiedFromScanAt===ledger.baselineAt;
      const cap=Number(ledger.siteM3),mined=Number(ledger.verifiedM3SinceScan);
      if(verified&&cap>0&&Number.isFinite(mined))add('Reported progress',volume(Math.max(0,mined))+' / '+volume(cap)+' · '+Math.min(100,Math.max(0,Math.round(mined/cap*100)))+'% of estimated cap');
      else add('Progress','Awaiting a confirmed current-site baseline');
    }else if(kind==='map'){
      for(const r of rows)if(Number(r.siteM3)>0)add(rows.length>1?r.ore+' progress':'Reported progress',volume(Math.max(0,Number(r.minedM3)||0))+' / '+volume(Number(r.siteM3))+' estimated');
    }
    const timers=kind==='t3'?[{...field,ore:row.ore}]:kind==='map'?rows:[];
    const active=timers.filter(r=>r.timerEndsAt);
    if(active.length)for(const r of active)add(active.length>1?r.ore+' reset':'Reset',countdown(r.timerEndsAt,now));
    else add('Reset',kind==='ice'||kind==='a0'?'No timer recorded':'No active timer');
    add('Scan status',scanHint?.stale||ledger?.needsScan||ledger?.likelyDepleted?'Scan needed':'Scan reminder current');
    if(nearest?.system===system)add('Nearest scan',Number(nearest.jumps||0)+' jumps from current travel toon');
    if(row.distanceLy!=null&&Number.isFinite(Number(row.distanceLy)))add('From C-N4OD',Number(row.distanceLy).toFixed(2)+' LY');
    if(lossRecent)activity.push({at:loss.at,text:'Player loss in this system · '+age(loss.at,now)+' (reports may be delayed)',alert:true});
    if(miningAt)activity.push({at:miningAt,text:'Field-matched mining ledger update · '+age(miningAt,now)});
    if(field.autoReopenedAt)activity.push({at:field.autoReopenedAt,text:'Field reopened from ESI evidence · '+age(field.autoReopenedAt,now)});
    if(field.autoClearedAt)activity.push({at:field.autoClearedAt,text:'Estimated field cap reached · '+age(field.autoClearedAt,now)});
    for(const note of field.notes||[])activity.push({at:note.createdAt,text:note.text+' · '+age(note.createdAt,now)});
    activity.sort((a,b)=>Number(Boolean(b.alert))-Number(Boolean(a.alert))||(stamp(b.at)||0)-(stamp(a.at)||0));
    return {system,type,details,activity:activity.slice(0,3)};
  }
  let dialog=null,getSnapshot=null,interval=null,origin=null,lastState=null,receivedAt=0,serverAt=0,lastContent='',dispose=null;
  function element(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;}
  function close(){dialog?.close();dispose?.();}
  function observe(state){if(state!==lastState){lastState=state;serverAt=stamp(state?.serverNow);receivedAt=performance.now();}}
  function update(){
    if(!dialog?.open||!getSnapshot)return;
    const snapshot=getSnapshot();
    observe(snapshot?.state);
    const now=Number.isFinite(serverAt)?serverAt+Math.max(0,performance.now()-receivedAt):Date.now();
    const model=build(snapshot,now);
    if(!model){close();return;}
    const connection=dialog.querySelector('.field-status-live');
    connection.textContent=snapshot.connected?'Live updates':'Reconnecting · data may be stale';
    connection.dataset.live=String(Boolean(snapshot.connected));
    const content=JSON.stringify(model);
    if(content===lastContent)return;
    lastContent=content;
    dialog.querySelector('h2').textContent=model.system;
    dialog.querySelector('.field-status-type').textContent=model.type;
    const list=dialog.querySelector('dl');list.replaceChildren();
    for(const [label,value] of model.details){list.append(element('dt',label),element('dd',value));}
    const feed=dialog.querySelector('.field-status-activity');feed.replaceChildren();
    for(const event of model.activity)feed.append(element('p',event.text,event.alert?'field-status-alert':''));
    feed.hidden=!model.activity.length;
  }
  function open(read,trigger){
    if(dialog)close();
    getSnapshot=read;origin=trigger;lastContent='';
    dialog=element('dialog',null,'field-status-dialog');
    dialog.setAttribute('aria-labelledby','fieldStatusTitle');
    const header=element('header'),copy=element('div'),title=element('h2');title.id='fieldStatusTitle';
    copy.append(title,element('p',null,'field-status-type'));
    const dismiss=element('button','Close','board-tool');dismiss.type='button';dismiss.autofocus=true;dismiss.addEventListener('click',close);
    header.append(copy,dismiss);
    const live=element('p',null,'field-status-live');live.setAttribute('role','status');
    dialog.append(header,live,element('dl'),element('section',null,'field-status-activity'));
    const snapshot=read();
    if(snapshot?.controls){const controls=element('button','Field controls','board-tool');controls.type='button';controls.addEventListener('click',()=>{const action=getSnapshot()?.controls;close();action?.();});dialog.append(controls);}
    const current=dialog;
    const cleanup=()=>{
      if(dialog!==current)return;
      clearInterval(interval);interval=null;dialog.remove();dialog=null;getSnapshot=null;dispose=null;
      const target=origin?.isConnected?origin:[...document.querySelectorAll('[data-board-key]')].find(card=>card.dataset.boardKey===origin?.dataset.boardKey);
      target?.focus();origin=null;
    };
    dispose=cleanup;
    dialog.addEventListener('close',cleanup,{once:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    document.body.append(dialog);dialog.showModal();update();
    if(dialog?.open)interval=setInterval(update,1000);
  }
  window.JlrFieldStatus={build,open,update,close,observe};
})();
