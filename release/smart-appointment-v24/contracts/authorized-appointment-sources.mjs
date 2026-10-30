// Backend-only person-scoped appointment source search; never trust client-provided actor or family ID.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function rankRelatedAppointments(rows,{organizationId,unitId,clinicianId,careTopic}={}){
 const topic=String(careTopic||'').trim().toLocaleLowerCase('th-TH');
 return [...rows].map(x=>({...x,_score:(organizationId&&x.organization_id===organizationId?8:0)+(unitId&&x.service_unit_id===unitId?4:0)+(clinicianId&&x.clinician_id===clinicianId?2:0)+(topic&&String(x.care_topic||'').toLocaleLowerCase('th-TH').includes(topic)?1:0)})).sort((a,b)=>b._score-a._score||String(b.planned_visit_date||b.appointment_at||'').localeCompare(String(a.planned_visit_date||a.appointment_at||''))).map(({_score,...x})=>x);
}
export function makeAuthorizedAppointmentSources({supabase,verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess}={}){
 if(!supabase?.from||[verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess].some(x=>typeof x!=='function'))throw Error('sources_security_not_configured');
 return async(request,raw)=>{
  if(request.method!=='POST'||raw?.action!=='appointment_sources'||!uuid(raw.selectedPersonCode))return reply(400,{ok:false,error:'invalid_request'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return reply(401,{ok:false,error:'unauthenticated'});
  try{
   const actor=await verifyLineIdentity(token);if(!actor?.userId)return reply(401,{ok:false,error:'unauthenticated'});
   if(await isReleaseEnabled(actor.userId)!==true)return reply(404,{ok:false,error:'feature_not_released'});
   const person=await resolvePerson(actor.userId,raw.selectedPersonCode);
   if(!person?.familyPersonId||!person?.familyId)return reply(404,{ok:false,error:'person_not_found'});
   if(await centralCanAccess(actor.userId,person.familyPersonId,'appointments','view')!==true)return reply(403,{ok:false,error:'permission_denied'});
   const columns='id,created_at,title,appointment_at,planned_visit_date,hospital_name,department,doctor_name,organization_id,service_unit_id,clinician_id,care_topic,status,appointment_type,deleted_at';
   const result=await supabase.from('appointments').select(columns).eq('family_id',person.familyId).eq('family_person_id',person.familyPersonId).is('deleted_at',null).order('created_at',{ascending:false}).limit(200);
   if(result.error||!Array.isArray(result.data))return reply(503,{ok:false,error:'appointments_unavailable'});
   const mode=raw.mode==='all'?'all':'related';
   const query=typeof raw.query==='string'?raw.query.trim().toLocaleLowerCase('th-TH').slice(0,120):'';
   const filtered=result.data.filter(x=>!query||[x.title,x.hospital_name,x.department,x.doctor_name,x.care_topic,x.planned_visit_date].some(z=>String(z||'').toLocaleLowerCase('th-TH').includes(query)));
   const records=mode==='related'?rankRelatedAppointments(filtered,{organizationId:raw.organizationId,unitId:raw.unitId,clinicianId:raw.clinicianId,careTopic:raw.careTopic}):filtered;
   return reply(200,{ok:true,mode,appointments:records.slice(0,100).map(({deleted_at,...x})=>x),has_more:filtered.length>100});
  }catch{return reply(503,{ok:false,error:'appointments_unavailable'});}
 };
}
