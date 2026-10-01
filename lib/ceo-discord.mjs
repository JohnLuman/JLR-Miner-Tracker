const DAY=86400000;
export const discordId=value=>/^\d{15,22}$/.test(String(value||''));
const clean=value=>String(value||'').slice(0,100);
export function createDiscordActivity(store,{clock=Date.now}={}){
  store.days ||= {};store.links ||= {};store.startedAt ||= null;
  const active=new Map(),seen=new Set(),bots=new Set();let paused=true,dirty=false,afk=null;
  function identity(user,member){return clean(member?.nick||user?.global_name||user?.username||'Discord user '+user?.id);}
  function row(userId,at,name){
    const day=new Date(at).toISOString().slice(0,10);const bucket=store.days[day] ||= {};
    const value=bucket[userId] ||= {userId,name:name||'Discord user '+userId,messages:0,voiceSeconds:0,lastActiveAt:null};
    if(name)value.name=name;return value;
  }
  function prune(at){const cutoff=new Date(at-89*DAY).toISOString().slice(0,10);for(const day of Object.keys(store.days))if(day<cutoff){delete store.days[day];dirty=true;}}
  function flush(at=clock()){
    if(!paused)for(const [id,session] of active){
      let from=Math.max(session.since,at-90000);const until=Math.max(from,at);
      while(from<until){const end=Math.min(until,(Math.floor(from/DAY)+1)*DAY);const value=row(id,from,session.name);value.voiceSeconds+=(end-from)/1000;value.lastActiveAt=new Date(end).toISOString();from=end;dirty=true;}
      session.since=at;
    }
    prune(at);
  }
  function pause(at=clock()){flush(at);paused=true;}
  function resume(at=clock()){paused=false;for(const session of active.values())session.since=at;}
  function message(event,at=clock()){
    if(String(event.guild_id)!==String(store.guildId)||event.author?.bot||event.webhook_id||!discordId(event.author?.id)||!discordId(event.id)||seen.has(event.id))return;
    seen.add(event.id);if(seen.size>5000)seen.delete(seen.values().next().value);
    const value=row(event.author.id,at,identity(event.author,event.member));value.messages++;value.lastActiveAt=new Date(at).toISOString();dirty=true;
  }
  function voice(event,at=clock()){
    if(String(event.guild_id)!==String(store.guildId)||!discordId(event.user_id))return;
    flush(at);
    if(event.member?.user?.bot)bots.add(event.user_id);
    if(!event.channel_id||event.channel_id===afk||bots.has(event.user_id)){active.delete(event.user_id);return;}
    const previous=active.get(event.user_id);
    active.set(event.user_id,{channelId:event.channel_id,since:at,name:event.member?.user?identity(event.member.user,event.member):previous?.name||'Discord user '+event.user_id});
  }
  function seed(guild,at=clock()){
    if(String(guild.id)!==String(store.guildId))return;
    flush(at);active.clear();afk=guild.afk_channel_id||null;store.guildName=clean(guild.name);store.startedAt ||= new Date(at).toISOString();dirty=true;
    const members=new Map((guild.members||[]).map(member=>[member.user?.id,member]));
    for(const member of members.values())if(member.user?.bot)bots.add(member.user.id);
    resume(at);
    for(const state of guild.voice_states||[])voice({...state,guild_id:guild.id,member:state.member||members.get(state.user_id)},at);
  }
  function updateGuild(guild,at=clock()){if(String(guild.id)!==String(store.guildId))return;flush(at);afk=guild.afk_channel_id||null;store.guildName=clean(guild.name);for(const [id,session] of active)if(session.channelId===afk)active.delete(id);dirty=true;}
  function snapshot({days=30,query='',sort='messages',at=clock()}={}){
    flush(at);const span=[7,30,90].includes(Number(days))?Number(days):30;
    const cutoff=new Date(at-(span-1)*DAY).toISOString().slice(0,10),today=new Date(at).toISOString().slice(0,10),all=new Map();
    for(const day of Object.keys(store.days).sort())if(day>=cutoff&&day<=today)for(const saved of Object.values(store.days[day])){
      let value=all.get(saved.userId);if(!value){value={userId:saved.userId,name:saved.name,messages:0,voiceSeconds:0,lastActiveAt:null,characterId:store.links[saved.userId]?.characterId||null,characterName:store.links[saved.userId]?.characterName||null};all.set(saved.userId,value);}
      value.name=saved.name;value.messages+=Number(saved.messages)||0;value.voiceSeconds+=Number(saved.voiceSeconds)||0;if(saved.lastActiveAt&&(!value.lastActiveAt||saved.lastActiveAt>value.lastActiveAt))value.lastActiveAt=saved.lastActiveAt;
    }
    const q=String(query).trim().toLowerCase();const records=[...all.values()].filter(value=>!q||[value.name,value.userId,value.characterName,value.characterId].join(' ').toLowerCase().includes(q)).sort((a,b)=>sort==='voice'?b.voiceSeconds-a.voiceSeconds||a.name.localeCompare(b.name):sort==='name'?a.name.localeCompare(b.name):b.messages-a.messages||a.name.localeCompare(b.name));
    return {days:span,periodStart:cutoff,periodEnd:today,startedAt:store.startedAt,totals:{users:all.size,messages:[...all.values()].reduce((sum,row)=>sum+row.messages,0),voiceSeconds:[...all.values()].reduce((sum,row)=>sum+row.voiceSeconds,0)},records,voicePresent:paused?0:active.size};
  }
  return {message,voice,seed,updateGuild,pause,resume,flush,snapshot,consumeDirty(){const value=dirty;dirty=false;return value;}};
}
