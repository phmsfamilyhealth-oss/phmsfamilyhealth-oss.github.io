/** Medication refill workflow contract. No writes; authorization checked again by server RPC. */
export const REFILL_STATES=Object.freeze(["PLANNED","PARTIALLY_RECEIVED","RECEIVED","NOT_RECEIVED","CANCELLED"]);
export function validateRefillItem(x){
 const errors=[];
 if(!x||typeof x!=="object")return {ok:false,errors:["INVALID_INPUT"]};
 if(!x.appointmentId||!x.personMedicationId&&!x.medicationId)errors.push("APPOINTMENT_AND_MEDICATION_REQUIRED");
 if(!REFILL_STATES.includes(x.status))errors.push("INVALID_STATUS");
 if(x.familyAuthorized!==true||x.personAuthorized!==true)errors.push("PERMISSION_DENIED");
 if(x.expectedQuantity!=null&&(!Number.isFinite(x.expectedQuantity)||x.expectedQuantity<=0||!x.expectedUnit))errors.push("INVALID_EXPECTED_QUANTITY");
 if(x.receivedQuantity!=null&&(!Number.isFinite(x.receivedQuantity)||x.receivedQuantity<0||!x.receivedUnit))errors.push("INVALID_RECEIVED_QUANTITY");
 if(x.receivedQuantity>0&&!["PARTIALLY_RECEIVED","RECEIVED"].includes(x.status))errors.push("RECEIPT_STATE_MISMATCH");
 if(x.requestStockMovement&&!x.physicalReceiptConfirmed)errors.push("NO_PHYSICAL_RECEIPT");
 if(x.requestStockMovement&&!x.idempotencyKey)errors.push("IDEMPOTENCY_REQUIRED");
 if(x.requestExpenseCreation&&x.existingExpenseId)errors.push("DUPLICATE_EXPENSE");
 if(x.hospitalLateRuleDays!=null&&x.hospitalRuleVerified!==true)errors.push("UNVERIFIED_HOSPITAL_RULE");
 return {ok:errors.length===0,errors};
}
