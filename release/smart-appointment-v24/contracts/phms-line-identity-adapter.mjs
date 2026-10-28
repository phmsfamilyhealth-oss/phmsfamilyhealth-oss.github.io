// PHMS v2.4 server-only identity adapter using the existing line_identities table.
// The caller must use the trusted service-side database client and LIFF channel ID.
import {makeLineIdTokenVerifier} from './line-id-token-verifier.mjs';
import {makePhmsLineSubjectResolver} from './phms-line-subject-resolver.mjs';
export function makePhmsLineIdentityAdapter({supabase,channelId,fetchImpl,onReject}={}){
 return makeLineIdTokenVerifier({channelId,fetchImpl,onReject,resolveLineSubject:makePhmsLineSubjectResolver(supabase)});
}
