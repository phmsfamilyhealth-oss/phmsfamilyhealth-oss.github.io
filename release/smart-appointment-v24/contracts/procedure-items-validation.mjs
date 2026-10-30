// Pure validation of user-reported procedure selection, not a write operation.
// Confirmation of catalog/medical instructions and appointment ownership belongs to the server.
const normalize=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('th-TH');
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function validateProcedureItems(items,{maxItems=30}={}){
 if(!Array.isArray(items)||items.length>maxItems)return {ok:false,error:'invalid_procedure_list'};
 const keys=new Set(),normalized=[];
 for(let index=0;index<items.length;index++){
  const x=items[index];
  if(!x||typeof x!=='object'||Array.isArray(x))return {ok:false,error:'invalid_procedure_item'};
  const name=typeof x.procedure_name_th==='string'?x.procedure_name_th.trim():'';
  const code=typeof x.procedure_code==='string'?x.procedure_code.trim():'';
  if(name.length<2||name.length>160||code.length>80)return {ok:false,error:'invalid_procedure_item'};
  if(x.instruction_verified===true||x.status&&x.status!=='PLANNED')return {ok:false,error:'unverified_procedure_assertion'};
  if(x.instruction_source_document_id&&!uuid(x.instruction_source_document_id))return {ok:false,error:'invalid_instruction_source'};
  if(x.clinical_instruction&&!x.instruction_source_document_id)return {ok:false,error:'instruction_source_required'};
  const key=code?normalize(code):normalize(name);if(keys.has(key))return {ok:false,error:'duplicate_procedure'};keys.add(key);
  normalized.push({sequence_no:index+1,procedure_code:code||null,procedure_name_th:name,procedure_category:typeof x.procedure_category==='string'?x.procedure_category.slice(0,60):null,status:'PLANNED',clinical_instruction:typeof x.clinical_instruction==='string'?x.clinical_instruction.trim().slice(0,1000):null,instruction_source_document_id:x.instruction_source_document_id||null,instruction_verified:false});
 }
 return {ok:true,items:normalized};
}
