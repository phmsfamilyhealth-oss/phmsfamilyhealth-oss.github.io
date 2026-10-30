// PHMS v2.4 offline Phase-3 workflow state, no network or patient identifiers.
// Pure transition function ensures review is completed before requesting confirmation.
export function transition(state,event){
 const current=state??{step:'edit',draft:null,reviewed:null,error:null};
 if(!event||typeof event.type!=='string')return {...current,error:'invalid_event'};
 switch(event.type){
 case 'EDIT':
  if(current.step==='submitting')return {...current,error:'busy'};
  return {step:'edit',draft:event.draft??null,reviewed:null,error:null};
 case 'REVIEW':
  if(current.step!=='edit'||!event.validation?.ok)return {...current,error:'invalid_draft'};
  return {step:'review',draft:current.draft,reviewed:structuredClone(current.draft),error:null};
 case 'BACK':
  return {step:'edit',draft:current.draft,reviewed:null,error:null};
 case 'SUBMIT':
  if(current.step!=='review'||!current.reviewed)return {...current,error:'review_required'};
  return {...current,step:'submitting',error:null};
 case 'SUCCESS':
  if(current.step!=='submitting'||!event.receipt?.appointmentId)return {...current,error:'unverified_result'};
  return {...current,step:'done',receipt:{appointmentId:event.receipt.appointmentId},error:null};
 case 'FAIL':
  if(current.step!=='submitting')return {...current,error:'invalid_transition'};
  return {...current,step:'review',error:'request_failed'};
 default:return {...current,error:'invalid_event'};
 }
}
