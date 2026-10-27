# Hospital ↔ Service Unit ↔ Doctor: binding acceptance contract

Evidence 2026-10-27: `tests/provider_relations_readonly.sql` executed on Production, **8/8 PASS**, only schema introspection. Production line-webhook v1426, main SHA 1d988866dfcd9a1a97196b5fa26bbc989110f3cb, feature gate disabled and allowlist empty.

## Enforced backend requirements (not implemented yet)
- Lookup active organization `healthcare_organizations.id` where `deleted_at IS NULL` before accepting organization_id.
- Unit must have `healthcare_service_units.organization_id=chosen organization_id`, and `deleted_at IS NULL`.
- Clinician must have `healthcare_clinicians.organization_id=chosen organization_id` (or a future verified affiliation junction), and `deleted_at IS NULL`. If clinician has service_unit_id, it must equal chosen service_unit_id when one is selected.
- Where chosen clinician or unit is provided but organization is absent, backend must resolve single unambiguous organization or reject requiring explicit selection.
- Frontend cascading selectors clear unit + clinician when hospital changes; clear clinician when unit changes. Backend must **revalidate independently** at confirm/commit.
- Hospital-specific doctor codes are distinct from professional license numbers. Do not promote unverified free-text doctors to canonical verified clinician IDs.
- Access rights to the person are checked **before** any write; published provider search may be broadly readable, but must not leak patient HN/VN or patient-specific prior appointments.
- If a provider is deleted/deactivated between selection and commit, fail with a Thai human-readable message and preserve draft without creating an appointment.

## Isolated acceptance tests required
| ID | Scenario | Expected |
|---|---|---|
| P01 | Doctor same active organization + unit | Allowed |
| P02 | Doctor different organization | REJECT |
| P03 | Clinic different organization | REJECT |
| P04 | Doctor with different clinic | REJECT or explicit organization-only policy |
| P05 | Doctor deactivated after selection | REJECT; draft preserved |
| P06 | Hospital changed after selecting doctor | Dependent selections reset |
| P07 | Two same-name doctors different organizations | No cross-association |
| P08 | Free-text unverified doctor | Remain free text without clinician FK |
| P09 | Cross-family appointment data requested during provider lookup | No patient data exposed |
| P10 | Double submit after mismatch error | Zero partial canonical rows |

These tests must be implemented and executed, not merely listed, before passing Phase 2. Existing independent FK checks alone cannot meet these conditions. No production schema/application mutation in this audit.
