/**
 * PHMS v2.3 - PURE FEFO decision engine.
 * No patient data, database writes or clinical approval. Uses caller-supplied verified inputs.
 * Sorting is NOT authorization. Server must verify order/family/stock/label status before committing.
 */
export function containerCode(productSequence,containerSequence){
  for(const n of [productSequence,containerSequence]) if(!Number.isSafeInteger(n)||n<1) throw new Error("INVALID_SEQUENCE");
  return "MED-"+String(productSequence).padStart(3,"0")+"-"+String(containerSequence).padStart(3,"0");
}
export function rankPickableContainers(containers, now=new Date()) {
  if(!(now instanceof Date)||Number.isNaN(+now))throw new Error("INVALID_CLOCK");
  const blocked=[],eligible=[];
  for(const c of containers){
    const reasons=[];
    if(!c.productMatched||!c.orderVerified||!c.familyAuthorized||!c.locationAuthorized||!c.sharedUseAuthorized)reasons.push("AUTH_OR_ORDER_MISMATCH");
    if(c.labelStatus!=="LABEL_VERIFIED")reasons.push("LABEL_NOT_VERIFIED");
    if(c.lifecycleStatus!=="unopened"&&c.lifecycleStatus!=="opened")reasons.push("CONTAINER_NOT_USABLE");
    if(c.quarantined||c.recalled)reasons.push("BLOCKED_LOT");
    if(!(typeof c.availableQuantity==="number"&&Number.isFinite(c.availableQuantity)&&c.availableQuantity>0))reasons.push("NO_STOCK");
    const dates=[c.expiryDate,c.beyondUseAt].filter(Boolean).map(x=>new Date(x));
    if(!c.expiryDate||dates.some(x=>Number.isNaN(+x)))reasons.push("UNKNOWN_EXPIRY");
    const effectiveExpiry=dates.length&&!dates.some(x=>Number.isNaN(+x))?Math.min(...dates.map(x=>+x)):null;
    if(effectiveExpiry!==null&&effectiveExpiry<=+now)reasons.push("EXPIRED");
    if(c.lifecycleStatus==="opened"&&c.openedRequiresBeyondUseDate&&!c.beyondUseAt)reasons.push("UNKNOWN_AFTER_OPEN_EXPIRY");
    if(reasons.length)blocked.push({containerId:c.containerId,reasons});
    else eligible.push({...c,effectiveExpiry});
  }
  eligible.sort((a,b)=>a.effectiveExpiry-b.effectiveExpiry ||
    new Date(a.receivedAt||"9999-12-31")-new Date(b.receivedAt||"9999-12-31") ||
    String(a.containerId).localeCompare(String(b.containerId)));
  return {eligible:eligible.map((c,i)=>({...c,fefoRank:i+1})),blocked};
}
