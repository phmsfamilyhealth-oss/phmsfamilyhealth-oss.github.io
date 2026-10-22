/** Pure intake validation for PHMS Medication v2.3; NOT a production authorization decision. */
export const INTAKE_MODES=Object.freeze(["existing_unrecorded","refill_existing","newly_received","bulk"]);
export const INTAKE_STATES=Object.freeze(["DRAFT","PENDING_VERIFICATION","PENDING_REVIEW"]);
export function validateMedicationIntake(x) {
  const errors=[],pending=[];
  if(!x||typeof x!=="object"||Array.isArray(x))return {ok:false,errors:["INVALID_INPUT"],pending:[]};
  if(!INTAKE_MODES.includes(x.mode))errors.push("INVALID_MODE");
  if(typeof x.productName!=="string"||!x.productName.trim())errors.push("PRODUCT_REQUIRED");
  if(x.strengthVerified!==true)pending.push("STRENGTH_UNVERIFIED");
  if(x.orderVerified!==true)pending.push("ORDER_UNVERIFIED");
  if(x.personAuthorized!==true||x.familyAuthorized!==true)errors.push("PERMISSION_DENIED");
  if(x.actualStartDateKnown===false&&x.mode==="existing_unrecorded"&&x.startDateInferred===true)errors.push("START_DATE_MUST_NOT_BE_INFERRED");
  const doses=x.doses??[];
  if(!Array.isArray(doses))errors.push("INVALID_DOSES");
  else for(const dose of doses) {
    if(typeof dose.amount!=="number"||!Number.isFinite(dose.amount)||dose.amount<=0)errors.push("INVALID_DOSE");
    if(typeof dose.unit!=="string"||!dose.unit.trim())errors.push("DOSE_UNIT_REQUIRED");
    if(!dose.slot&&!dose.interval&&!dose.condition)errors.push("DOSE_SCHEDULE_REQUIRED");
  }
  if(x.hasPhysicalReceipt===false&&(x.requestContainerCreation||x.requestStockDeduction))errors.push("NO_PHYSICAL_RECEIPT");
  if(x.sharedInventory===true&&x.openedEyeDropBottle===true)errors.push("OPENED_EYE_DROP_NOT_SHARED");
  if(x.createExpense===true&&x.existingExpenseLinked===true)errors.push("DUPLICATE_EXPENSE");
  if(x.requestAdministration===true)errors.push("INTAKE_CANNOT_ADMINISTER");
  return {ok:errors.length===0,errors:[...new Set(errors)],pending,status:errors.length?"ERROR":pending.length?"PENDING_VERIFICATION":"PENDING_REVIEW"};
}
export function expandMealDoses(slots,amount,unit,overrides={}) {
  if(!Array.isArray(slots)||!slots.length||new Set(slots).size!==slots.length)throw Error("INVALID_SLOTS");
  const allowed=new Set(["morning","noon","evening","bedtime"]);
  return slots.map(slot=>{
    if(!allowed.has(slot))throw Error("INVALID_SLOT");
    const n=Object.hasOwn(overrides,slot)?overrides[slot]:amount;
    if(typeof n!=="number"||!Number.isFinite(n)||n<=0)throw Error("INVALID_AMOUNT");
    return {slot,amount:n,unit};
  });
}
