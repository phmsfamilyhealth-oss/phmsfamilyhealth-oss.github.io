// Pure provider hierarchy for offline Smart Appointment. The server must query and
// revalidate current healthcare master data and permissions before writing anything.
export function providerChoices(master, organizationId, unitId=null) {
 const organizations=(master?.organizations??[]).filter(x=>x?.id&&!x.deleted_at);
 const org=organizations.find(x=>x.id===organizationId);
 const units=org?(master?.units??[]).filter(x=>x?.organization_id===org.id&&!x.deleted_at):[];
 const selectedUnit=units.find(x=>x.id===unitId);
 const clinicians=org?(master?.clinicians??[]).filter(x=>x?.organization_id===org.id&&!x.deleted_at&&(!x.service_unit_id||selectedUnit?.id===x.service_unit_id)):[];
 return {organizations,units,clinicians};
}
export function verifyProviderSelection(master,selection){
 const {organizationId,unitId,clinicianId}=selection??{};
 if(!organizationId)return false;
 const {organizations,units,clinicians}=providerChoices(master,organizationId,unitId);
 if(!organizations.some(x=>x.id===organizationId))return false;
 if(unitId&&!units.some(x=>x.id===unitId))return false;
 if(clinicianId&&!clinicians.some(x=>x.id===clinicianId))return false;
 return true;
}
