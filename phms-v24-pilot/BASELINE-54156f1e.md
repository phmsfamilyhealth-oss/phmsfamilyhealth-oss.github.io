# PHMS v2.4 canonical baseline

The owner-approved canonical UI AND functional behavior for Smart Appointment is Git commit **54156f1e76df7a48ede228762c2cedd7fa415849**, file `phms-v24-pilot/prototype/index.html`.

**Mandatory rule for all subsequent changes**
1. Read current `main` HEAD, production interfaces and this baseline before editing.
2. Treat commit 54156f1e as the reference for **complete behavior** (person selection and gate, simple/detailed modes, appointment type selection, progressive field visibility, original card design, validation, existing appointment linking, provider selection, dates/times, optional sections and reset). It is not merely a CSS reference.
3. Do NOT reset HEAD to 54156f1e or overwrite newer, verified fixes. Integrate enhancements as small changes against current HEAD while retaining baseline behavior.
4. New features such as authorized per-person-and-hospital HN lookup and the editable 30-minute arrival default are additions; they must not prevent the baseline app from booting.
5. Verify module initialization, UI behavior and interactions for first load, no person, selected person, selection clearing, switching appointment type/mode, hospital selection, HN fallback, and iPhone LINE LIFF before claiming final acceptance.
6. Keep the form in experimental no-save mode unless the independent release gate authorizes recording.

Baseline preview: https://phmsfamilyhealth-oss.github.io/phms-v24-pilot/prototype/index.html?v=54156f1e
