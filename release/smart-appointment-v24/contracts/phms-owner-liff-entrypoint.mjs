// Server-side composition for the eventual v1431 LINE webhook integration.
// Caller MUST supply verified actor + active person from trusted LINE context,
// never from postback fields or a LIFF browser request. This file changes no runtime.
import {makePhmsAuthorityAdapter} from './phms-private-authority.mjs';
import {makePhmsPersonResolver} from './phms-person-resolver.mjs';
import {makeOwnerLiffLaunch} from './owner-liff-launch.mjs';
import {makeOwnerLiffRoute} from './owner-liff-route.mjs';
export function makePhmsOwnerLiffEntrypoint({supabase,privateQuery,launchUrl,legacy}={}){
 if(!supabase?.from||typeof privateQuery!=='function'||typeof legacy!=='function')throw new Error('owner_liff_entrypoint_not_configured');
 let expectedOrigin;
 try{const u=new URL(launchUrl);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!u.pathname.endsWith('/'))throw Error('unsafe');expectedOrigin=u.origin;}
 catch{throw new Error('owner_liff_entrypoint_url_invalid')}
 const authority=makePhmsAuthorityAdapter(privateQuery);
 const resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess:authority.centralCanAccess});
 const launch=makeOwnerLiffLaunch({...authority,resolvePerson,launchUrl});
 return makeOwnerLiffRoute({launch,legacy,expectedOrigin});
}
