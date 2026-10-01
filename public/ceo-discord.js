(() => {
  'use strict';
  let data=null,error='',busy=false,serial=0,timer,page=0,members=[],inviteUrl=null;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>Number(value||0).toLocaleString();
  function setMembers(rows){members=rows||[];const select=$('ceoDiscordMember');if(!select)return;const chosen=select.value;select.innerHTML='<option value="">Choose EVE member…</option>'+members.map(row=>'<option value="'+esc(row.characterId)+'">'+esc(row.name)+'</option>').join('');select.value=chosen;}
  function render(){
    const host=$('ceoDiscordRecords');if(!host)return;
    const status=$('ceoDiscordStatus');if(status)status.textContent=data?(data.connection.connected?'COLLECTING ACTIVITY':String(data.connection.status).replaceAll('-',' ').toUpperCase())+(data.guildName?' • '+data.guildName:''):'Checking Discord setup…';
    const warning=$('ceoDiscordWarning');if(warning){warning.classList.toggle('hidden',!error);warning.textContent=error;}
    for(const id of ['ceoDiscordConnect','ceoDiscordPause','ceoDiscordRefresh','ceoDiscordLink','ceoDiscordUnlink'])if($(id))$(id).disabled=busy;
    if($('ceoDiscordPause'))$('ceoDiscordPause').classList.toggle('hidden',!data?.enabled);
    if($('ceoDiscordConnect'))$('ceoDiscordConnect').textContent=busy?'WORKING…':data?.configured?'CONNECT / UPDATE BOT':'CONNECT BOT';
    if(!data){host.innerHTML='<div class="visual-empty">'+(error?'Discord activity is unavailable.':'Discord setup has not loaded.')+'</div>';if($('ceoDiscordSummary'))$('ceoDiscordSummary').innerHTML='';return;}
    if($('ceoDiscordGuild')&&!$('ceoDiscordGuild').value)$('ceoDiscordGuild').value=data.guildId||'';
    const invite=$('ceoDiscordInvite');if(invite){const install=data.inviteUrl||inviteUrl;invite.classList.toggle('hidden',!install);if(install)invite.href=install;}
    if($('ceoDiscordNote'))$('ceoDiscordNote').textContent=data.note+' '+(data.startedAt?'Tracking started '+new Date(data.startedAt).toLocaleString()+'.':'No history is backfilled before connection.');
    if($('ceoDiscordSummary'))$('ceoDiscordSummary').innerHTML=[['ACTIVE DISCORD ACCOUNTS',number(data.totals.users)],['MESSAGES',number(data.totals.messages)],['VOICE-CHANNEL HOURS',(data.totals.voiceSeconds/3600).toFixed(1)],['IN VOICE NOW',number(data.voicePresent)]].map(([label,value])=>'<div><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('');
    const select=$('ceoDiscordUser');if(select){const chosen=select.value;select.innerHTML='<option value="">Choose observed Discord account…</option>'+data.records.map(row=>'<option value="'+esc(row.userId)+'">'+esc(row.name)+' • '+esc(row.userId)+'</option>').join('');select.value=chosen;}
    const pages=Math.max(1,Math.ceil(data.records.length/50));page=Math.min(page,pages-1);
    if($('ceoDiscordCount'))$('ceoDiscordCount').textContent=data.records.length+' matching accounts • '+(data.periodStart?data.periodStart+' to '+data.periodEnd+' UTC':'No collection period yet')+' • page '+(page+1)+' of '+pages;
    if($('ceoDiscordPrev'))$('ceoDiscordPrev').disabled=page===0;if($('ceoDiscordNext'))$('ceoDiscordNext').disabled=page>=pages-1;
    host.innerHTML=data.records.slice(page*50,(page+1)*50).map(row=>'<details class="ceo-discord-record"><summary><strong>'+esc(row.name)+'</strong><span>'+number(row.messages)+' messages</span><span>'+(row.voiceSeconds/3600).toFixed(2)+' voice hours</span></summary><div><p>Discord ID '+esc(row.userId)+' • EVE member: '+esc(row.characterName||'Not linked')+'</p><p>Last observed activity: '+esc(row.lastActiveAt?new Date(row.lastActiveAt).toLocaleString():'Not reported')+'</p></div></details>').join('')||'<div class="visual-empty">'+(data.configured?'No observed activity matches this period or search.':'Connect a dedicated Discord bot below to begin counting activity.')+'</div>';
  }
  async function request(url,options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const payload=await response.json();
    if(!response.ok){if([401,403].includes(response.status))data=null;if(payload.inviteUrl){inviteUrl=payload.inviteUrl;const invite=$('ceoDiscordInvite');if(invite){invite.href=payload.inviteUrl;invite.classList.remove('hidden');}}throw new Error(payload.message||payload.error||'Discord request failed.');}
    return payload;
  }
  async function load(){
    if(!$('ceoDiscordRecords')||busy)return;const current=++serial;
    const params=new URLSearchParams({days:$('ceoDiscordDays')?.value||'30',query:$('ceoDiscordSearch')?.value||'',sort:$('ceoDiscordSort')?.value||'messages'});
    try{const next=await request('/api/ceo/discord?'+params);if(current!==serial)return;data=next;error='';}
    catch(cause){if(current===serial)error=String(cause.message||cause);}
    finally{if(current===serial)render();}
  }
  async function configure(enabled){
    if(busy)return;busy=true;serial++;error='';render();
    try{data=await request('/api/ceo/discord/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,guildId:$('ceoDiscordGuild')?.value||'',token:enabled?$('ceoDiscordToken')?.value||'':''})});}
    catch(cause){error=String(cause.message||cause);}
    finally{if($('ceoDiscordToken'))$('ceoDiscordToken').value='';busy=false;render();}
  }
  async function link(unlink=false){
    if(busy)return;const userId=$('ceoDiscordUser')?.value,characterId=unlink?null:$('ceoDiscordMember')?.value;
    if(!userId||!unlink&&!characterId){error='Choose a Discord account and an EVE member.';render();return;}
    busy=true;serial++;error='';render();
    try{await request('/api/ceo/discord/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,characterId})});}
    catch(cause){error=String(cause.message||cause);}
    finally{busy=false;if(error)render();else void load();}
  }
  document.addEventListener('click',event=>{
    const has=id=>event.target?.closest?.('#'+id);
    if(has('ceoDiscordConnect'))void configure(true);else if(has('ceoDiscordPause'))void configure(false);else if(has('ceoDiscordRefresh'))void load();else if(has('ceoDiscordLink'))void link();else if(has('ceoDiscordUnlink'))void link(true);else if(has('ceoDiscordPrev')){page=Math.max(0,page-1);render();}else if(has('ceoDiscordNext')){page++;render();}
  });
  document.addEventListener('input',event=>{if(event.target?.id==='ceoDiscordSearch'){clearTimeout(timer);page=0;timer=setTimeout(()=>void load(),300);}});
  document.addEventListener('change',event=>{if(['ceoDiscordDays','ceoDiscordSort'].includes(event.target?.id)){page=0;void load();}});
  setInterval(()=>{if(document.querySelector('#ceoCommandPanel.active')&&!busy)void load();},60000);
  window.JlrCeoDiscord={load,setMembers,configure,link};
})();
