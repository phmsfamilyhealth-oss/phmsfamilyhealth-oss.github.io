// PHMS v2.4: offline-only appointment draft packaging and checklist parser.
// NEVER grants permissions, uploads files, or writes patient data.
export function prepareDraftForReview(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false,errors:['invalid_payload']};
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const structured=raw.preparation_items;
  if(structured!==undefined&&(!Array.isArray(structured)||structured.some(x=>!x||typeof x.title!=='string'||!['pending','completed'].includes(x.status))))return {ok:false,errors:['invalid_preparation_items']};
  const checklist = structured?structured.map(x=>clean(x.title)):clean(raw.prep).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(checklist.some(x=>!x))return {ok:false,errors:['empty_checklist_item']};
  if(new Set(checklist.map(x=>x.toLocaleLowerCase('th-TH'))).size!==checklist.length)return {ok:false,errors:['duplicate_checklist_item']};
  if (checklist.length > 20) return {ok:false, errors:['too_many_checklist_items']};
  if (checklist.some(item=>item.length>160)) return {ok:false,errors:['checklist_item_too_long']};
  if(raw.documents != null && !Array.isArray(raw.documents))return {ok:false,errors:['invalid_documents']};
  const docs = Array.isArray(raw.documents) ? raw.documents : [];
  if(docs.length>5) return {ok:false,errors:['too_many_documents']};
  if(docs.some(f => !f || !['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type) || !Number.isFinite(f.size) || f.size<=0 || f.size>10*1024*1024))
    return {ok:false,errors:['invalid_document']};
  if(clean(raw.purpose).length>80)return {ok:false,errors:['appointment_title_too_long']};
  if(clean(raw.additional_note).length>1000)return {ok:false,errors:['appointment_note_too_long']};
  if(clean(raw.doctor).length>160)return {ok:false,errors:['doctor_name_too_long']};
  const selection=raw.provider_selection;
  if(selection!==undefined&&(selection===null||typeof selection!=='object'||Array.isArray(selection)||!['organizationId','unitId','clinicianId'].every(k=>selection[k]===undefined||typeof selection[k]==='string')))return {ok:false,errors:['invalid_provider_selection']};
  return {ok:true,draft:{
    scenario:clean(raw.scenario), date:clean(raw.date), time_known:raw.time_known===true,
    time:raw.time_known===true?clean(raw.time):null,
    provider_selection:selection?{organizationId:clean(selection.organizationId),unitId:clean(selection.unitId),clinicianId:clean(selection.clinicianId)}:null,
    hospital_name:clean(raw.hospital), department:clean(raw.department),
    doctor_name:clean(raw.doctor), title:clean(raw.purpose), note:clean(raw.additional_note),
    preparation_tasks:checklist.map((title,index)=>({title,sequence_no:index+1,status:structured?structured[index].status:'pending'})),
    document_metadata:docs.map(f=>({name:clean(f.name),type:f.type,size:f.size}))
  }};
}
