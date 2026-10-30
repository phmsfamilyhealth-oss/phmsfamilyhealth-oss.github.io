// PHMS v2.4: DOM-independent provider option data; no master data is bundled.
// Caller must supply a trusted, access-scoped master snapshot from backend.
import {providerChoices,verifyProviderSelection} from './provider-hierarchy.mjs';
export function providerPickerState(master, organizationId='', unitId='', clinicianId='') {
 const choices=providerChoices(master,organizationId,unitId);
 const safeUnit=choices.units.some(x=>x.id===unitId)?unitId:'';
 const safeClinician=choices.clinicians.some(x=>x.id===clinicianId)?clinicianId:'';
 return {
  organizations:choices.organizations.map(x=>({value:x.id,label:x.display_name||x.name||'สถานพยาบาล'})),
  units:choices.units.map(x=>({value:x.id,label:(x.name||'แผนก')+(x.code&&!String(x.name||'').includes('('+x.code+')')?' ('+x.code+')':''),code:x.code||''})),
  clinicians:choices.clinicians.map(x=>({value:x.id,label:x.display_name||'แพทย์'})),
  organizationId:choices.organizations.some(x=>x.id===organizationId)?organizationId:'',
  unitId:safeUnit,clinicianId:safeClinician,
  valid:!!organizationId&&verifyProviderSelection(master,{organizationId,unitId:safeUnit||undefined,clinicianId:safeClinician||undefined})
 };
}
