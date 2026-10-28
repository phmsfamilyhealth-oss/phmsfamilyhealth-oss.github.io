// PHMS v2.4 isolated read-only API. Does not import appointment persistence or write RPC.
// LINE channel ID comes from the owner-created LIFF app ID (LINE documents its prefix).
import {createClient} from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import {makePhmsLineIdentityAdapter} from '../contracts/phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from '../contracts/phms-person-resolver.mjs';
import {makePhmsAuthorityAdapter} from '../contracts/phms-private-authority.mjs';
import {makeAuthorizedProviderCatalogHandler} from '../contracts/authorized-provider-catalog.mjs';
import {makeAuthorizedPersonPicker} from '../contracts/authorized-person-picker.mjs';
const origin='https://phmsfamilyhealth-oss.github.io';
const json=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const env=name=>(Deno.env.get(name)||'').trim();
const serviceKey=()=>{if(env('SUPABASE_SERVICE_ROLE_KEY'))return env('SUPABASE_SERVICE_ROLE_KEY');try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||''}catch{return ''}};
let options=null,catalog=null;
if(env('SUPABASE_URL')&&env('SUPABASE_DB_URL')&&serviceKey()){
 try{
  const client=createClient(env('SUPABASE_URL'),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const sql=postgres(env('SUPABASE_DB_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
  const query=async(q,args)=>({rows:await sql.unsafe(q,args)});
  const authority=makePhmsAuthorityAdapter(query);
  const verifyLineIdentity=makePhmsLineIdentityAdapter({supabase:client,channelId:'2011619364',fetchImpl:fetch,onReject:reason=>console.warn('phms_v24_auth_rejected',reason)});
  const resolvePerson=makePhmsPersonResolver({supabase:client,centralCanAccess:authority.centralCanAccess});
  options=makeAuthorizedPersonPicker({supabase:client,verifyLineIdentity,isReleaseEnabled:authority.isReleaseEnabled,centralCanAccess:authority.centralCanAccess});
  const fetchMaster=async()=>{const tables=[['healthcare_organizations','id,name,display_name,deleted_at'],['healthcare_service_units','id,organization_id,name,deleted_at'],['healthcare_clinicians','id,organization_id,service_unit_id,display_name,deleted_at']];const values=[];for(const [table,cols] of tables){const result=await sql.unsafe('select '+cols+' from public.'+table+' where deleted_at is null limit 1000');values.push([...result]);}return {organizations:values[0],units:values[1],clinicians:values[2]};};
  catalog=makeAuthorizedProviderCatalogHandler({supabase:client,verifyLineIdentity,resolvePerson,isReleaseEnabled:authority.isReleaseEnabled,centralCanAccess:authority.centralCanAccess,fetchMaster});
 }catch{options=null;catalog=null}
}
Deno.serve(async request=>{
 const requestOrigin=request.headers.get('origin');
 if(requestOrigin&&requestOrigin!==origin)return json('origin_not_allowed',403);
 const cors=response=>{if(!requestOrigin)return response;const headers=new Headers(response.headers);headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');return new Response(response.body,{status:response.status,headers});};
 if(request.method==='OPTIONS')return requestOrigin===origin?new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type','access-control-max-age':'300','vary':'Origin'}}):json('origin_not_allowed',403);
 if(request.method!=='POST')return cors(json('method_not_allowed',405));
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))return cors(json('invalid_request',400));
 if(!options||!catalog)return cors(json('feature_not_released',404));
 let raw;try{const body=await request.text();if(new TextEncoder().encode(body).length>32768)return cors(json('invalid_request',400));raw=JSON.parse(body)}catch{return cors(json('invalid_request',400))}
 if(raw?.action==='person_options')return cors(await options(request,raw));
 if(raw?.action==='provider_catalog')return cors(await catalog(request,raw));
 return cors(json('unsupported_action',400));
});