// PHMS v2.4: offline-only appointment draft packaging and checklist parser.
// NEVER grants permissions, uploads files, or writes patient data.
export function prepareDraftForReview(raw) {
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const checklist = clean(raw.prep).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (checklist.length > 20) return {ok:false, errors:['too_many_checklist_items']};
  if (checklist.some(item=>item.length>160)) return {ok:false,errors:['checklist_item_too_long']};
  const docs = Array.isArray(raw.documents) ? raw.documents : [];
  if(docs.length>5) return {ok:false,errors:['too_many_documents']};
  if(docs.some(f => !f || !['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type) || !Number.isFinite(f.size) || f.size<=0 || f.size>10*1024*1024))
    return {ok:false,errors:['invalid_document']};
  return {ok:true,draft:{
    scenario:clean(raw.scenario), date:clean(raw.date), time_known:raw.time_known===true,
    time:raw.time_known===true?clean(raw.time):null,
    hospital_name:clean(raw.hospital), department:clean(raw.department),
    doctor_name:clean(raw.doctor), note:clean(raw.purpose),
    preparation_tasks:checklist.map((title,index)=>({title,sequence_no:index+1,status:'pending'})),
    document_metadata:docs.map(f=>({name:clean(f.name),type:f.type,size:f.size}))
  }};
}
