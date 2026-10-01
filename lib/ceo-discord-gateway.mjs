export const DISCORD_ACTIVITY_INTENTS=1|128|512;
export function createDiscordGateway({token,guildId,onDispatch=()=>{},onStatus=()=>{},onPause=()=>{},onResume=()=>{},fetchImpl=fetch,Socket=WebSocket,timers={setTimeout,clearTimeout},random=Math.random}){
  let socket=null,stopped=false,heartbeat=null,reconnect=null,hello=null,seq=null,session=null,resumeUrl=null,gatewayUrl=null,acked=true,attempt=0,generation=0;
  const later=(work,ms)=>{const timer=timers.setTimeout(work,ms);timer?.unref?.();return timer;};
  const clear=()=>{for(const timer of [heartbeat,hello])if(timer)timers.clearTimeout(timer);heartbeat=hello=null;};
  function status(state,connected=false){onStatus({status:state,connected});}
  function send(op,d){if(socket?.readyState===1)socket.send(JSON.stringify({op,d}));}
  function retry(delay){if(stopped||reconnect)return;status('reconnecting');reconnect=later(()=>{reconnect=null;void connect();},delay??Math.min(300000,5000*2**Math.min(attempt++,6))+random()*1000);}
  function beat(interval){
    if(stopped)return;
    if(!acked){socket?.close(4000,'Heartbeat missed');return;}
    acked=false;send(1,seq);heartbeat=later(()=>beat(interval),interval);
  }
  async function connect(){
    if(stopped)return;const current=++generation;status('connecting');
    try{
      if(!gatewayUrl){
        const response=await fetchImpl('https://discord.com/api/v10/gateway/bot',{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(15000)});
        if(stopped||current!==generation)return;
        if([401,403].includes(response.status)){status('token-invalid');stopped=true;return;}
        if(response.status===429){const value=await response.json();retry(Math.max(5000,Number(value.retry_after)*1000||60000));return;}
        if(!response.ok)throw new Error('Gateway unavailable');
        const value=await response.json();
        if(value.session_start_limit?.remaining===0){retry(Math.max(60000,Number(value.session_start_limit.reset_after)||3600000));return;}
        const url=new URL(value.url);if(url.protocol!=='wss:'||!url.hostname.endsWith('.discord.gg'))throw new Error('Invalid gateway');gatewayUrl=url.toString();
      }
      if(stopped||current!==generation)return;
      const url=new URL(session&&resumeUrl?resumeUrl:gatewayUrl);url.searchParams.set('v','10');url.searchParams.set('encoding','json');
      socket=new Socket(url.toString());acked=true;
      hello=later(()=>socket?.close(4000,'Hello timeout'),30000);
      socket.addEventListener('message',event=>{
        if(stopped||current!==generation)return;
        let packet;try{packet=JSON.parse(String(event.data));}catch{return;}
        if(packet.op===10){
          if(heartbeat)timers.clearTimeout(heartbeat);heartbeat=null;
          if(hello)timers.clearTimeout(hello);hello=null;
          const interval=Number(packet.d?.heartbeat_interval);if(!(interval>=1000)){socket.close(4000,'Invalid heartbeat');return;}
          heartbeat=later(()=>beat(interval),interval*random());
          if(session){send(6,{token,session_id:session,seq});}else send(2,{token,intents:DISCORD_ACTIVITY_INTENTS,properties:{os:'linux',browser:'JLR activity',device:'JLR activity'}});
        }else if(packet.op===11){acked=true;}
        else if(packet.op===1){acked=false;send(1,seq);}
        else if(packet.op===7){socket.close(4000,'Reconnect');}
        else if(packet.op===9){if(!packet.d){session=resumeUrl=null;seq=null;}socket.close(4000,'Invalid session');}
        else if(packet.op===0){
          if(Number.isFinite(packet.s)&&seq!==null&&packet.s<=seq)return;
          if(Number.isFinite(packet.s))seq=packet.s;
          if(packet.t==='READY'){
            session=packet.d.session_id;try{const resume=new URL(packet.d.resume_gateway_url);resumeUrl=resume.protocol==='wss:'&&resume.hostname.endsWith('.discord.gg')?resume.toString():gatewayUrl;}catch{resumeUrl=gatewayUrl;}
            attempt=0;status('connected',true);onResume();
          }else if(packet.t==='RESUMED'){attempt=0;status('connected',true);onResume();}
          if(packet.t==='READY'||packet.t==='RESUMED'||String(packet.d?.guild_id||packet.d?.id)===String(guildId))onDispatch(packet.t,packet.d);
        }
      });
      socket.addEventListener('close',event=>{
        if(stopped||current!==generation)return;clear();onPause();
        if([4004,4010,4011,4012,4013,4014].includes(event.code)){stopped=true;status(event.code===4004?'token-invalid':'gateway-configuration-error');return;}
        if([4007,4009].includes(event.code)){session=resumeUrl=null;seq=null;}
        retry();
      });
      socket.addEventListener('error',()=>{if(!stopped&&current===generation){status('connection-error');socket.close(4000,'Connection error');}});
    }catch{if(!stopped&&current===generation){clear();onPause();retry();}}
  }
  return {start(){void connect();},stop(){stopped=true;generation++;clear();if(reconnect)timers.clearTimeout(reconnect);reconnect=null;onPause();socket?.close(1000,'Stopped');status('disabled');}};
}
