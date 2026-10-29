// Pure, fail-closed master-data candidate checks. This module never writes data.
// Server must recheck identity, family permission, visibility, duplicates and idempotency atomically.
export const normalizeMasterName=value=>typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('th-TH').replace(/[\s._()\u200b-\u200d-]+/g,'').replace(/^(?:โรงพยาบาล|รพ)/,'').trim():'';
export function findExistingMaster({kind,name,organizationId,records=[]}={}){
 const key=normalizeMasterName(name);if(!key)return [];
 if(!['organization','unit','clinician'].includes(kind))return [];
 return records.filter(r=>r&&r.deleted_at==null&&(kind==='organization'||r.organization_id===organizationId)&&[r.name,r.display_name,r.branch_name,r.code,r.external_code].some(s=>normalizeMasterName(s)===key));
}
export function validateMasterCandidate({kind,name,organizationId,unitId,records=[]}={}){
 if(!['organization','unit','clinician'].includes(kind)||typeof name!=='string'||name.trim().length<2||name.trim().length>160||/[\u0000-\u001f]/.test(name))return {ok:false,error:'invalid_master_candidate'};
 if(kind!=='organization'&&!/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(organizationId||''))return {ok:false,error:'organization_required'};
 if(kind==='clinician'&&unitId!=null&&unitId!==''&&!/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(unitId))return {ok:false,error:'invalid_service_unit'};
 const duplicates=findExistingMaster({kind,name,organizationId,records});
 return duplicates.length?{ok:false,error:'duplicate_candidate',matches:duplicates.map(x=>({id:x.id,name:x.display_name||x.name}))}:{ok:true,name:name.trim(),kind,organizationId:kind==='organization'?null:organizationId,unitId:kind==='clinician'?(unitId||null):null};
}
