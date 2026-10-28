// Read-only catalog transport. Server MUST verify the LINE identity, selected member,
// central appointment view permission and limited release gate before returning data.
// Never send a service-role key or trust browser-supplied permissions.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function makeLiffProviderCatalogClient({liff,endpoint,fetchImpl=fetch}={}){
 if(!liff?.getIDToken||typeof fetchImpl!=='function'||typeof endpoint!=='string')throw new Error('catalog_not_configured');
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||!url.pathname.endsWith('/phms-v24-appointment-confirm'))throw new Error('unsafe_catalog_endpoint');
 return async function loadCatalog(selectedPersonCode){
  const token=liff.getIDToken();
  if(!token||!uuid(selectedPersonCode))return {ok:false,error:'unauthenticated'};
  try{
   const response=await fetchImpl(url.href,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'provider_catalog',selectedPersonCode})});
   const data=await response.json();
   if(!response.ok||data?.ok!==true||!data.catalog)return {ok:false,error:data?.error||'catalog_unavailable'};
   const master=data.catalog;
   if(!['organizations','units','clinicians'].every(k=>Array.isArray(master[k])&&master[k].length<=1000&&master[k].every(row=>row&&uuid(row.id))))return {ok:false,error:'invalid_catalog'};
   return {ok:true,catalog:master};
  }catch{return {ok:false,error:'catalog_unavailable'};}
 };
}
