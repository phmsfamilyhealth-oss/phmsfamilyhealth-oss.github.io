// Trusted server-only PHMS LINE subject resolver against existing public.line_identities.
// Service client must be server-side; never expose credentials to LIFF or browser.
export function makePhmsLineSubjectResolver(supabase){
 if(!supabase?.from)throw new Error('identity_db_not_configured');
 return async function resolveLineSubject(lineSub){
  if(typeof lineSub!=='string'||!/^U[0-9a-f]{32}$/i.test(lineSub))return null;
  const {data,error}=await supabase.from('line_identities').select('id,user_id,is_active').eq('line_user_id',lineSub).limit(2);
  if(error||!Array.isArray(data)||data.length!==1)return null;
  const row=data[0];
  if(row?.is_active!==true||typeof row.user_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.user_id))return null;
  return {userId:row.user_id};
 };
}
