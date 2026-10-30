// PHMS v2.4 backend-only master catalog fetcher: exact live Supabase column names (verified read-only).
// Construct this adapter ONLY after LINE identity + central appointments:view permission has been checked.
// Uses an injected service-side Supabase client; NEVER embed its credentials in browser code.
export async function fetchProviderMaster(client) {
 if (!client || typeof client.from !== 'function') throw new Error('catalog_client_required');
 const defs=[
 ['healthcare_organizations','id,name,display_name,deleted_at'],
 ['healthcare_service_units','id,organization_id,name,deleted_at'],
 ['healthcare_clinicians','id,organization_id,service_unit_id,display_name,deleted_at']
 ];
 const results=await Promise.all(defs.map(async ([table,columns])=>{
  const result=await client.from(table).select(columns).is('deleted_at',null).limit(1000);
  if(result.error||!Array.isArray(result.data))throw new Error('provider_catalog_unavailable');
  return result.data;
 }));
 return {organizations:results[0],units:results[1],clinicians:results[2]};
}
