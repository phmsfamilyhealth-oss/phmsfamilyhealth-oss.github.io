import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMedication,validateMedication,medicationScheduleLabel} from '../supabase/functions/line-webhook/smart-medication.ts';
const base={generic_name:'Vitamin D2',strength_value:'20000',strength_unit:'IU',dosage_form:'แคปซูล',dose_value:'1',dose_unit:'แคปซูล',frequency:'ทุกวันศุกร์',time:'เช้า',instructions:'รับประทานตามฉลาก',meal_relation:'หลังอาหาร',start_date:'2026-10-22'};
test('calendar weekday and rolling day interval remain distinct on readback',()=>{
 const w=normalizeMedication(base),r=normalizeMedication({...base,frequency:'ทุก 7 วัน'});
 assert.deepEqual(validateMedication(w),[]);assert.deepEqual(validateMedication(r),[]);
 assert.equal(medicationScheduleLabel(w),'ทุกวันศุกร์');assert.match(medicationScheduleLabel(r),/7 วันนับจาก 2026-10-22/);
});
test('conflicting explicit weekdays require correction instead of changing the instruction',()=>{
 for(const weekdays of ['จันทร์','จันทร์,ศุกร์'])assert.ok(validateMedication(normalizeMedication({...base,weekdays})).includes('วันในสัปดาห์ขัดกับความถี่'));
});
test('daily and rolling schedules cannot silently ignore selected weekdays',()=>{
 for(const frequency of ['วันละ 1 ครั้ง','ทุก 7 วัน','ทุก 8 ชั่วโมง'])assert.ok(validateMedication(normalizeMedication({...base,frequency,weekdays:'ศุกร์',time:'08:00'})).includes('วันในสัปดาห์ไม่ตรงชนิดตารางยา'));
});
test('PRN needs the actual symptom instruction and creates no invented fixed frequency',()=>{
 const d=normalizeMedication({...base,frequency:'ตามอาการ',time:''});assert.ok(validateMedication(d).includes('อาการที่ให้ใช้ยาตามคำสั่งจริง'));
 assert.deepEqual(validateMedication(normalizeMedication({...base,frequency:'ตามอาการ',prn_condition:'เมื่อปวดตามฉลาก',time:''})),[]);
});
test('eye-drop ratio retains numerator and denominator without oral meal defaults',()=>{
 const d=normalizeMedication({...base,generic_name:'Synthetic Eye Drops',strength_value:'5',strength_unit:'mg/mL',dosage_form:'ยาหยอดตา',dose_unit:'หยด',frequency:'วันละ 2 ครั้ง',time:'08:00,20:00',instructions:'หยอดตาตามฉลาก',meal_relation:'ไม่เกี่ยวข้อง',administration_site:'ตาซ้าย'});
 assert.deepEqual(validateMedication(d),[]);assert.equal(d.concentration_text,'5 mg/1 mL');assert.equal(d.strength_denominator_value,1);
});
test('ambiguous clock and symbolic periods, duplicate clocks and overflowing numbers fail review',()=>{
 for(const change of [{time:'เช้า 08:00'},{time:'08:00,08:00'},{strength_value:'9'.repeat(400)},{dose_value:'9'.repeat(400)}])assert.ok(validateMedication(normalizeMedication({...base,...change})).length);
});
