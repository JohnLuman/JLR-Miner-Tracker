// Read-only archive for links created by the retired build planner.
const STATUSES = new Set(['planning','needs-mats','ready','building','done']);

export function migrateLegacyBuildShares(state){
  const older=state?.forge?.shares;
  const current=state?.appraisals?.legacyBuildShares;
  return {
    ...(older&&typeof older==='object'&&!Array.isArray(older)?older:{}),
    ...(current&&typeof current==='object'&&!Array.isArray(current)?current:{}),
  };
}

export function archivedBuildSharePublic(row){
  if(!row)return null;
  return {
    id:String(row.id||''),token:String(row.token||''),title:String(row.title||'JLR Build'),
    status:STATUSES.has(String(row.status))?String(row.status):'planning',
    notes:String(row.notes||''),owner:{name:String(row.owner?.name||'JLR Pilot')},
    createdAt:row.createdAt||null,updatedAt:row.updatedAt||null,
    plan:row.plan||{items:[],materials:[],summary:{}},
    archived:true,
  };
}
