const PROMPT_FIXES=new Map(Object.entries({
  wat:'what',wats:'what',wht:'what',wut:'what',
  dose:'does',dos:'does',
  halp:'help',hlep:'help',
  explane:'explain',expalin:'explain',
  capabilites:'capabilities',capabilties:'capabilities',
  comand:'commands',comands:'commands',
  abot:'about',
}));
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()
  .split(' ').map(token=>PROMPT_FIXES.get(token)||token).join(' ');

export function explicitAdamHelpQuestion(question){
  const q=normalize(question).replace(/^(?:adam|tracker)\s+/,'');
  return /^(?:help|help me|what can you do|what do you do|how can you help(?: me)?|what can i ask(?: you)?|what should i ask(?: you)?|capabilities|commands)$/.test(q);
}

export function adamOverviewQuestion(question){
  return /^(?:what is|what does|how does|explain|describe|tell me about|overview of|help me understand)\b/.test(normalize(question));
}

export function adamUnknownText({currentTab='',selectedSystem=''}={}){
  const system=currentTab==='fields'&&selectedSystem?' for '+selectedSystem:'';
  return 'I can’t verify that'+system+' from the information JLR currently has.';
}
