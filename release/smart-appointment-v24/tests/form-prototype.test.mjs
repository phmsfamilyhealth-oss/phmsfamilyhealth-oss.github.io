import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
test('Thai form and review steps exist',()=>{assert.match(html,/เพิ่มนัดหมาย/);assert.match(html,/ตรวจทานก่อนบันทึก/);});
test('client draft uses shared validator',()=>assert.match(html,/import \{validateAppointmentDraft\} from '\.\.\/contracts\/scenario-validator\.mjs'/));
test('no real save exposed without auth backend',()=>{assert.match(html,/<button id="save" disabled/);assert.match(html,/if\(!id\|\|!endpoint\|\|!memberId\)\{/);assert.doesNotMatch(html,/fetch\(|supabase\.from\(|localStorage|service_role/);});
test('no editable patient or family identifiers',()=>{assert.doesNotMatch(html,/id="(?:person_id|family_id|line_user_id)"/)});
test('date-only scenario and previous history selectable',()=>{assert.match(html,/value="walk_in"/);assert.match(html,/value="historical"/);});
test('review fields inserted as safe text',()=>{assert.match(html,/dd\.textContent=/);assert.doesNotMatch(html,/innerHTML\s*=/);});

test('LIFF requires LINE login before enabling appointment save',()=>{assert.match(html,/if\(!window\.liff\.isLoggedIn\(\)\)\{window\.liff\.login\(\);return;\}/);assert.match(html,/confirmClient=makeLiffConfirmClient/);});

test('LIFF never enables save without a real LINE ID token',()=>{assert.match(html,/if\(!window\.liff\.getIDToken\(\)\)\{document\.getElementById\('connectionStatus'\)/);});

test('missing LINE ID token shows an actionable Thai error without activating save',()=>{assert.match(html,/ยังยืนยันตัวตนกับ LINE ไม่สำเร็จ/);assert.match(html,/if\(!window\.liff\.getIDToken\(\)\)\{document\.getElementById\('connectionStatus'\)/);});

test('review requires a verified registered hospital instead of misleading free text',()=>{assert.match(html,/providerPickerState\(authorizedCatalog,\$\('providerOrg'\)\.value/);assert.match(html,/กรุณาเลือกโรงพยาบาลจากรายชื่อที่ระบบแสดงก่อนบันทึก/)});

test('save remains disabled until a nonempty authorized hospital registry is loaded',()=>{assert.match(html,/if\(catalogResult\.ok&&catalogResult\.catalog\.organizations\.length\)/);assert.match(html,/document\.getElementById\('review'\)\.disabled=false;document\.getElementById\('save'\)\.disabled=false/);assert.doesNotMatch(html,/confirmClient=makeLiffConfirmClient\([^;]+;document\.getElementById\('save'\)\.disabled=false/);});

test('unimplemented document upload never advances to a misleading save confirmation',()=>{assert.match(html,/if\(packaged\.draft\.document_metadata\.length\)\{\$\('error'\)\.textContent='การแนบรูปใบนัดและเอกสารยังไม่เปิดใช้งาน/);assert.match(html,/เอาไฟล์ออกก่อน/);});

test('missing LINE deployment config displays an actionable error instead of silently doing nothing',()=>{assert.match(html,/ยังไม่ตั้งค่าการเชื่อมต่อ LINE หรือยังไม่ได้เลือกบุคคล/);assert.match(html,/if\(!id\|\|!endpoint\|\|!memberId\)\{/)});

test('LIFF status reflects actual readiness rather than permanent not-open notice',()=>{
 assert.match(html,/id="connectionStatus" role="status"/);
 assert.match(html,/เชื่อมต่อ LINE สำเร็จ/);
 assert.match(html,/เชื่อมต่อ LINE ไม่สำเร็จ/);
 assert.doesNotMatch(html,/ฟอร์มนี้ยังไม่เปิดบันทึกจริงจนกว่า/);
});
test('save feedback is targeted to confirmation rather than setup status',()=>{
 assert.match(html,/id="saveStatus" role="status"/);
 assert.match(html,/\$\('saveStatus'\)\.textContent='บันทึกนัดแล้ว/);
 assert.doesNotMatch(html,/\\n<label for="hospital">/);
});

test('review is disabled until LINE and authorized catalog are ready',()=>{assert.match(html,/<button id="review" type="button" disabled>/);});
test('successful save prevents return to editable form',()=>{assert.match(html,/\$\('back'\)\.disabled=true/);});

test('review handler itself fails closed without trusted LINE and provider catalog',()=>{assert.match(html,/if\(!confirmClient\|\|!authorizedCatalog\|\|\$\('review'\)\.disabled\)\{/);assert.match(html,/ยังเชื่อมต่อ LINE และทะเบียนโรงพยาบาลไม่สำเร็จ/);});
