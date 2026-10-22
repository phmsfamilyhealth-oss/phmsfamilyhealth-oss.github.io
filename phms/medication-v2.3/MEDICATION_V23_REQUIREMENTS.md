# Medication v2.3 — Requirements (controlled draft)
Source: PHMS acceptance instructions, Supabase live schema/registry audit, 2026-10-22.
This is a specification, NOT certification of deployed completeness.
REQ-01 All medication information/screens use LINE Flex states HAS_DATA, EMPTY, PROCESSING, ERROR, PENDING_VERIFICATION, PERMISSION_DENIED.
REQ-02 Use PHMS central five-category theme/header/type/buttons/carousel, including 44px Back.
REQ-03 Every operation rechecks LINE user, target person/family and permissions in backend.
REQ-04 Medication product identity, person orders, schedule, administration, stock, preparation and finance stay separate.
REQ-05 Version/effective time/provenance, idempotent transactions, immutable audit/corrections.
REQ-06 Clinical review stops unverified or conflicting order/allergy/preparation; never auto-approve.
REQ-07 Inventory FEFO, expiration/opened-container discard rules and shared stock control.
REQ-08 Price references separate real expenses and allocated stock cost, no double charge.
REQ-09 All 16 screens and all actual postbacks must work in live LINE for authorized UAT.
REQ-10 Release prohibited while critical/high defect, unresolved rights or missing real-world verification exists.
