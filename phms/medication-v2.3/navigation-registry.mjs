/**
 * PHMS Medication v2.3 — central navigation contract.
 * NON-PRODUCTION: This module has no LINE webhook side effects.
 * Resolve person/family and permissions on server for EVERY transition.
 * Never place person IDs, patient names, family IDs or PHI into LINE postback data.
 */
export const MED_ROUTES = Object.freeze({
  "person.overview": {screen:"person.overview", back:null, primary:"med.overview"},
  "med.overview": {screen:"overview", back:"person.overview", primary:"med.list"},
  "med.list": {screen:"list", back:"med.overview", primary:"med.detail"},
  "med.detail": {screen:"detail", back:"med.list", primary:"med.revision", contextualBack:true},
  "med.schedule": {screen:"schedule", back:"med.overview", primary:"med.round"},
  "med.round": {screen:"round", back:"med.schedule", primary:"med.emar"},
  "med.emar": {screen:"emar", back:"med.round", primary:"med.history", contextualBack:true},
  "med.history": {screen:"emar", back:"med.overview", primary:"med.emar", contextualBack:true},
  "med.intake": {screen:"intake", back:"med.overview", primary:"med.intake.review", wizard:true},
  "med.intake.review": {screen:"intake", back:"med.intake", primary:"med.intake.result", confirmation:true, writeAction:true},
  "med.intake.result": {screen:"intake", back:"med.overview", primary:"med.list"},
  "med.revision": {screen:"revision", back:"med.detail", primary:"med.revision.review", wizard:true, contextualBack:true},
  "med.revision.review": {screen:"revision", back:"med.revision", primary:"med.revision.result", confirmation:true, writeAction:true},
  "med.revision.result": {screen:"revision", back:"med.detail", primary:"med.detail"},
  "med.inventory": {screen:"inventory", back:"med.overview", primary:"med.lot"},
  "med.lot": {screen:"inventory", back:"med.inventory", primary:"med.container"},
  "med.container": {screen:"container", back:"med.lot", primary:"med.container.review", wizard:true},
  "med.container.review": {screen:"container", back:"med.container", primary:"med.container.result", confirmation:true, writeAction:true},
  "med.container.result": {screen:"container", back:"med.lot", primary:"med.lot"},
  "med.preparation.list": {screen:"preparation", back:"med.overview", primary:"med.preparation"},
  "med.preparation": {screen:"preparation", back:"med.preparation.list", primary:"med.preparation.review", wizard:true},
  "med.preparation.review": {screen:"preparation", back:"med.preparation", primary:"med.preparation.result", confirmation:true, writeAction:true},
  "med.preparation.result": {screen:"preparation", back:"med.preparation.list", primary:"med.preparation.list"},
  "med.pricing": {screen:"pricing", back:"med.detail", primary:"med.expense", contextualBack:true},
  "med.expense": {screen:"pricing", back:"med.detail", primary:"med.expense.evidence", contextualBack:true},
  "med.expense.evidence": {screen:"pricing", back:"med.expense", primary:"med.expense"},
  "med.safety": {screen:"safety", back:"med.overview", primary:"med.safety.detail"},
  "med.safety.detail": {screen:"safety", back:"med.safety", primary:"med.safety"},
  "med.prn": {screen:"prn", back:"med.overview", primary:"med.prn.detail"},
  "med.prn.detail": {screen:"prn", back:"med.prn", primary:"med.prn"},
  "med.report.daily": {screen:"report_daily", back:"med.overview", primary:"med.history"},
  "med.emergency": {screen:"emergency", back:"person.overview", primary:"med.emergency.full"},
  "med.emergency.full": {screen:"emergency", back:"person.overview", primary:"person.overview"}
});
export const PHMS_MED_UI_STATES = Object.freeze(["HAS_DATA","EMPTY","PROCESSING","ERROR","PENDING_VERIFICATION","PERMISSION_DENIED"]);

/** Route keys are NOT deployable handlers until explicitly verified. */
export function assertRegistry() {
  for (const [key, route] of Object.entries(MED_ROUTES)) {
    if (!route.screen) throw new Error("missing screen: "+key);
    for (const dest of [route.back, route.primary]) {
      if (dest && !MED_ROUTES[dest]) throw new Error("dangling route: "+key+" -> "+dest);
    }
    if (route.back === key) throw new Error("self-back: "+key);
  }
  return Object.keys(MED_ROUTES).length;
}
/** Lookup is metadata only: never authorize solely using route metadata. */
export function resolveNavigation(routeKey, {verifiedReturnRoute, isReturnAllowed}={}) {
  const route=MED_ROUTES[routeKey];
  if (!route) return {ok:false,reason:"UNKNOWN_ROUTE"};
  const back=(route.contextualBack && verifiedReturnRoute && isReturnAllowed===true && MED_ROUTES[verifiedReturnRoute]) ? verifiedReturnRoute : route.back;
  return {ok:true,screen:route.screen,back,primary:route.primary,confirmation:!!route.confirmation,writeAction:!!route.writeAction};
}
/** Render-time style must come from deployed PHMS tokens, never hardcode hex colors. */
export function requireExistingBackButtonStandard(standard) {
  if (!standard || standard.height_px !== 44) throw new Error("PHMS_BACK_BUTTON_STANDARD_V3 mismatch");
  return standard;
}
/** Guard: a workflow confirmation is NOT a navigation-only transition. */
export function canIssueNavigationPostback(routeKey, {authorized=false,handlerVerified=false,writeCommitted=false}={}) {
  const r=MED_ROUTES[routeKey];
  if (!r || !authorized || !handlerVerified) return false;
  if (r.confirmation && !writeCommitted) return false;
  return true;
}
