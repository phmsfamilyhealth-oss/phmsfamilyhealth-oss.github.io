/** Generate a proposed one-off shift command. Does not write or mutate patient orders. */
export function proposeOneOffScheduleChange({scheduledDoseId,reason,requestedAt,kind,actorAuthorized,orderVerified}={}){
 if(actorAuthorized!==true)throw Error("PERMISSION_DENIED");
 if(orderVerified!==true)throw Error("PENDING_VERIFICATION");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scheduledDoseId||""))throw Error("SCHEDULED_DOSE_REQUIRED");
 if(typeof reason!=="string"||reason.trim().length<5)throw Error("REASON_REQUIRED");
 if(!["shift","skip"].includes(kind))throw Error("INVALID_ACTION");
 if(kind==="shift"&&(!requestedAt||Number.isNaN(Date.parse(requestedAt))))throw Error("SHIFT_TIME_REQUIRED");
 return Object.freeze({scheduledDoseId,kind,reason:reason.trim(),requestedAt:kind==="shift"?requestedAt:null,requiresTransactionalAudit:true,changeMasterOrder:false});
}
