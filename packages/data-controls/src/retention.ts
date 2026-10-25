const day=24*60*60*1000;
export const RETENTION_DEFAULTS = Object.freeze({
  clipboardHistory:{maxAgeMs:7*day,maxUnpinnedItems:1000,maxBytes:100*1024*1024},
  workflowRuns:{maxAgeMs:30*day,maxUnpinnedItems:10_000,maxBytes:null},
  workflowDebug:{maxAgeMs:day,maxUnpinnedItems:null,maxBytes:50*1024*1024},
  toolDiagnostics:{maxAgeMs:30*day,maxUnpinnedItems:null,maxBytes:100*1024*1024},
  applicationLogs:{maxAgeMs:14*day,maxUnpinnedItems:null,maxBytes:20*1024*1024},
});
export interface RetentionItem {id:string;createdAt:string;sizeBytes:number;pinned:boolean}
export interface RetentionPolicy {maxAgeMs:number|null;maxUnpinnedItems:number|null;maxBytes:number|null}
/** Pure planning only: adapters must recheck pin/revision eligibility when they
 * delete. Pinned items are never silently evicted to satisfy a total budget. */
export function planRetention(items:readonly RetentionItem[],policy:RetentionPolicy,now:number):{removeIds:string[];retainedBytes:number;pinnedBudgetExhausted:boolean} {
  if(Object.keys(policy).length!==3 || !['maxAgeMs','maxUnpinnedItems','maxBytes'].every(key=>Object.hasOwn(policy,key)) || items.length>100_000 || !Number.isSafeInteger(now) || now<0 || Object.values(policy).some(value=>value!==null && (!Number.isSafeInteger(value) || value<0)))throw new Error('Invalid retention request.');
  const ids=new Set<string>();
  for(const item of items) {
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(item.id) || ids.has(item.id) || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes<0 || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.pinned!=='boolean')throw new Error('Invalid retention inventory.');
    ids.add(item.id);
  }
  const eligible=items.filter(item=>!item.pinned).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  let bytes=items.reduce((sum,item)=>sum+item.sizeBytes,0);if(!Number.isSafeInteger(bytes))throw new Error('Invalid retention inventory.');
  let unpinned=eligible.length;const removeIds:string[]=[];
  for(const item of eligible) {
    const expired=policy.maxAgeMs!==null && Date.parse(item.createdAt)<now-policy.maxAgeMs;
    if(expired || (policy.maxUnpinnedItems!==null && unpinned>policy.maxUnpinnedItems) || (policy.maxBytes!==null && bytes>policy.maxBytes)) {removeIds.push(item.id);bytes-=item.sizeBytes;unpinned--;}
  }
  const pinnedBytes=items.filter(item=>item.pinned).reduce((sum,item)=>sum+item.sizeBytes,0);
  return {removeIds,retainedBytes:bytes,pinnedBudgetExhausted:policy.maxBytes!==null && pinnedBytes>=policy.maxBytes};
}
