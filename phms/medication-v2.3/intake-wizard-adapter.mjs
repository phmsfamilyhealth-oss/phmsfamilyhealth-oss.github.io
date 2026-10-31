/** PHMS intake adapter: validation -> existing draft RPC only. No clinical or inventory commit. */
import {validateMedicationIntake} from "./smart-medication-intake.mjs";
export function buildWizardDraftRequest(input,{lineUserId,submit=false}={}) {
 const check=validateMedicationIntake(input);
 if(!check.ok) return {ok:false,errors:check.errors,pending:check.pending};
 if(typeof lineUserId!=="string"||!lineUserId.trim())return {ok:false,errors:["LINE_USER_REQUIRED"],pending:check.pending};
 if(submit&&check.pending.length)return {ok:false,errors:["PENDING_VERIFICATION"],pending:check.pending};
 const payload={product:input.productName.trim(),quantity:String(input.doses?.[0]?.amount??""),instructions_label:input.instructionsLabel??"รอตรวจสอบคำสั่งยา",intake_mode:input.mode,dose_rules:input.doses??[],medication_strength:input.strength??null,order_verified:input.orderVerified===true,recorded_from:"smart_medication_intake_v23"};
 return {ok:true,rpc:"phms_med_intake_wizard_save",args:{p_line_user_id:lineUserId,p_payload:payload,p_submit:Boolean(submit)},pending:check.pending};
}
