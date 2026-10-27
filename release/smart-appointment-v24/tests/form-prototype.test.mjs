import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
test('Thai form and review steps exist',()=>{assert.match(html,/เพิ่มนัดหมาย/);assert.match(html,/ตรวจทานก่อนบันทึก/);});
test('client draft uses shared validator',()=>assert.match(html,/import \{validateAppointmentDraft\} from '\.\.\/contracts\/scenario-validator\.mjs'/));
test('no real save exposed without auth backend',()=>{assert.match(html,/<button id="save" disabled/);assert.match(html,/if\(!id\|\|!endpoint\|\|!memberId\)return/);assert.doesNotMatch(html,/fetch\(|supabase\.from\(|localStorage|service_role/);});
test('no editable patient or family identifiers',()=>{assert.doesNotMatch(html,/id="(?:person_id|family_id|line_user_id)"/)});
test('date-only scenario and previous history selectable',()=>{assert.match(html,/value="walk_in"/);assert.match(html,/value="historical"/);});
test('review fields inserted as safe text',()=>{assert.match(html,/dd\.textContent=/);assert.doesNotMatch(html,/innerHTML\s*=/);});

test('LIFF requires LINE login before enabling appointment save',()=>{assert.match(html,/if\(!window\.liff\.isLoggedIn\(\)\)\{window\.liff\.login\(\);return;\}/);assert.match(html,/confirmClient=makeLiffConfirmClient/);});

test('LIFF never enables save without a real LINE ID token',()=>{assert.match(html,/if\(!window\.liff\.getIDToken\(\)\)\{document\.getElementById\('error'\)/);});

test('missing LINE ID token shows an actionable Thai error without activating save',()=>{assert.match(html,/ยังยืนยันตัวตนกับ LINE ไม่สำเร็จ/);assert.match(html,/if\(!window\.liff\.getIDToken\(\)\)\{document\.getElementById\('error'\)/);});

test('review requires a verified registered hospital instead of misleading free text',()=>{assert.match(html,/providerPickerState\(authorizedCatalog,\$\('providerOrg'\)\.value/);assert.match(html,/กรุณาเลือกโรงพยาบาลจากรายชื่อที่ระบบแสดงก่อนบันทึก/)});

test('save remains disabled until a nonempty authorized hospital registry is loaded',()=>{assert.match(html,/if\(catalogResult\.ok&&catalogResult\.catalog\.organizations\.length\)/);assert.match(html,/syncProviderNames\(\);document\.getElementById\('save'\)\.disabled=false/);assert.doesNotMatch(html,/confirmClient=makeLiffConfirmClient\([^;]+;document\.getElementById\('save'\)\.disabled=false/);});
