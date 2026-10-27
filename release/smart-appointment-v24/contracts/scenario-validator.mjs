// PHMS v2.4 Phase-2 *pure* input-contract validator. Not a security boundary.
// Server authorization and transactional commit are separately required.
const scenarios = new Set(["booked","walk_in","historical"]);
const isDate = s => typeof s==="string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+"T00:00:00Z")) && new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const isTime = s => typeof s==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function validateAppointmentDraft(x) {
 const errors=[];
 if(!x || typeof x!=="object" || Array.isArray(x)) return {ok:false,errors:["invalid_payload"]};
 if(!scenarios.has(x.scenario)) errors.push("invalid_scenario");
 if(!isDate(x.date)) errors.push("invalid_date");
 if(x.time_known !== true && x.time_known !== false) errors.push("invalid_time_known");
 if(x.time_known===true && !isTime(x.time)) errors.push("time_required");
 if(x.time_known===false && x.time!=null && x.time!=="") errors.push("time_must_be_empty");
 if(x.scenario==="booked" && x.time_known!==true) errors.push("booked_requires_time");
 if(x.scenario==="historical" && x.status!=="completed") errors.push("historical_requires_completed");
 if(x.scenario==="walk_in" && x.status && !["planned","scheduled"].includes(x.status)) errors.push("walkin_invalid_status");
 if(x.clinician && (!x.organization || x.clinician.organization_id!==x.organization.id)) errors.push("doctor_hospital_mismatch");
 if(x.service_unit && (!x.organization || x.service_unit.organization_id!==x.organization.id)) errors.push("unit_hospital_mismatch");
 if(x.clinician?.service_unit_id && x.service_unit && x.clinician.service_unit_id!==x.service_unit.id) errors.push("doctor_unit_mismatch");
 if(x.organization?.deleted_at || x.service_unit?.deleted_at || x.clinician?.deleted_at) errors.push("inactive_provider");
 return {ok:errors.length===0, errors};
}
