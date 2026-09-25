const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();

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
