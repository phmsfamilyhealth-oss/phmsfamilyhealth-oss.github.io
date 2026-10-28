// Fail closed: an installed RPC alone cannot prove that the historical date-only
// database constraint has been migrated. This guard does not read patient data.
export function canReleaseAppointmentSchema(row){
 if(row?.installed!==true||row?.operations_ready!==true||row?.historical_check_ready!==true)return false;
 return true;
}
