// Trusted owner-pilot member discovery. No family or actor identifier is accepted from the browser.
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function makeAuthorizedPersonPicker({supabase,verifyLineIdentity,isReleaseEnabled,centralCanAccess}={}){
 if(!supabase?.from||[verifyLineIdentity,isReleaseEnabled,centralCanAccess].some(x=>typeof x!=='function'))throw Error('person_picker_not_configured');
 return async function listPeople(request,raw){
  if(request.method!=='POST'||raw?.action!=='person_options')return response({ok:false,error:'invalid_request'},400);
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return response({ok:false,error:'unauthenticated'},401);
  try{
   const actor=await verifyLineIdentity(token);
   if(!actor?.userId)return response({ok:false,error:'unauthenticated'},401);
   if(await isReleaseEnabled(actor.userId)!==true)return response({ok:false,error:'feature_not_released'},404);
   const memberships=await supabase.from('family_memberships').select('family_id').eq('user_id',actor.userId).eq('status','active').limit(100);
   if(memberships.error||!Array.isArray(memberships.data))return response({ok:false,error:'members_unavailable'},503);
   const families=[...new Set(memberships.data.map(x=>x.family_id).filter(Boolean))];
   if(!families.length)return response({ok:true,people:[]});
   const rows=await supabase.from('family_persons').select('id,family_id,person_id,status').in('family_id',families).limit(500);
   if(rows.error||!Array.isArray(rows.data))return response({ok:false,error:'members_unavailable'},503);
   const authorized=[];
   for(const row of rows.data){
    if(row.status==='inactive'||!row.id||!row.person_id)continue;
    if(await centralCanAccess(actor.userId,row.id,'appointments','view')!==true)continue;
    if(await centralCanAccess(actor.userId,row.id,'appointments','create')!==true)continue;
    authorized.push(row);
   }
   const ids=[...new Set(authorized.map(x=>x.person_id))];
   if(!ids.length)return response({ok:true,people:[]});
   const names=await supabase.from('persons').select('id,display_name,nickname,first_name,last_name').in('id',ids).limit(500);
   if(names.error||!Array.isArray(names.data))return response({ok:false,error:'members_unavailable'},503);
   const byId=new Map(names.data.map(n=>[n.id,n]));
   const people=authorized.map(row=>{
    const n=byId.get(row.person_id);
    return n?{id:row.id,name:String(n.display_name||n.nickname||[n.first_name,n.last_name].filter(Boolean).join(' ')||'สมาชิกครอบครัว').slice(0,160)}:null;
   }).filter(Boolean);
   return response({ok:true,people});
  }catch{return response({ok:false,error:'members_unavailable'},503)}
 };
}
