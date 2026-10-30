// Server-side composition for the existing appointment provider catalog.
// Inject a backend Supabase client only; never ship service credentials to LIFF.
import {fetchProviderMaster} from './supabase-provider-master.mjs';
import {loadAuthorizedProviderPicker} from './provider-catalog-orchestrator.mjs';
export async function loadSupabaseProviderPicker(request,identityAdapters,supabase) {
 if (!supabase || typeof supabase.from !== 'function') return {ok:false,error:'provider_catalog_unavailable'};
 return loadAuthorizedProviderPicker(request,{
  ...identityAdapters,
  getAuthorizedProviderMaster:async()=>{
   try{return await fetchProviderMaster(supabase);}
   catch{return null;}
  }
 });
}
