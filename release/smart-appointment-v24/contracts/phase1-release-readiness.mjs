// PHMS v2.4 Phase 1: machine-readable release readiness, no patient data.
// This gate is independent from device UAT, which the owner waived for Phase 1.
// Fail closed unless every non-device prerequisite has independently verifiable evidence.
export const PHASE1_REQUIRED = Object.freeze([
 'source_parity','router_typecheck','regression','rollback_bundle',
 'liff_configured','liff_hosted','owner_allowlist',
 'permission_negative','atomic_commit_backend','scoped_readback',
 'production_route_deployed','non_device_e2e'
]);
export function assessPhase1(evidence, {waiveRealDevice=true}={}) {
 if(!evidence || typeof evidence!=='object' || Array.isArray(evidence))
  throw Error('phase1_evidence_required');
 const missing=PHASE1_REQUIRED.filter(k=>{
  const item=evidence[k];
  return !item || item.passed!==true || typeof item.reference!=='string' || !item.reference.trim();
 });
 if(!waiveRealDevice && !(evidence.real_device_uat?.passed===true && evidence.real_device_uat.reference))
  missing.push('real_device_uat');
 return {passed:missing.length===0,missing,realDeviceWaived:waiveRealDevice};
}
