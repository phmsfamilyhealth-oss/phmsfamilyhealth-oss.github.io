// PHMS v2.4: offline-only appointment draft packaging and checklist parser.
// NEVER grants permissions, uploads files, or writes patient data.
export function prepareDraftForReview(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false,errors:['invalid_payload']};
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const extras=raw.extended_details??{};
  if(typeof extras!=='object'||extras===null||Array.isArray(extras)||Object.keys(extras).some(k=>!Object.hasOwn({"hospital_hn":80,"hospital_vn":80,"location_detail":240,"contact_phone":40,"care_topic":500,"coverage_type":100,"arrival_lead_minutes":4,"visit_outcome_notes":1000,"diagnosis_summary":1000,"treatment_summary":1000,"test_results_summary":1000,"medication_plan_notes":1000,"next_steps":1000,"walk_in_reason":500},k)))return {ok:false,errors:['invalid_extended_details']};
  if(Object.entries(extras).some(([key,value])=>typeof value!=='string'||value.trim().length>{"hospital_hn":80,"hospital_vn":80,"location_detail":240,"contact_phone":40,"care_topic":500,"coverage_type":100,"arrival_lead_minutes":4,"visit_outcome_notes":1000,"diagnosis_summary":1000,"treatment_summary":1000,"test_results_summary":1000,"medication_plan_notes":1000,"next_steps":1000,"walk_in_reason":500}[key]))return {ok:false,errors:['extended_details_too_long']};
  if(extras.walk_in_reason&&!['queue_full','hospital_advised','no_booking','urgent','other'].includes(extras.walk_in_reason))return {ok:false,errors:['invalid_walk_in_reason']};
  if(extras.arrival_lead_minutes&&!/^(?:0|[1-9]\[0-9]{0,3})$/.test(extras.arrival_lead_minutes))return {ok:false,errors:['invalid_arrival_lead']};
  if(Number(extras.arrival_lead_minutes||0)>720)return {ok:false,errors:['invalid_arrival_lead']};
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
    doctor_name:clean(raw.doctor), title:clean(raw.purpose), note:clean(raw.additional_note), extended_details:Object.fromEntries(Object.entries(extras).map(([k,v])=>[k,v.trim()])),
    preparation_tasks:checklist.map((title,index)=>({title,sequence_no:index+1,status:structured?structured[index].status:'pending'})),
    document_metadata:docs.map(f=>({name:clean(f.name),type:f.type,size:f.size}))
  }};
}
