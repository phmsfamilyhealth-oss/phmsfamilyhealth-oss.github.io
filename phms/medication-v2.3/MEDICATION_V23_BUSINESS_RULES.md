# Medication v2.3 — Business rules
BR-01 A medication product identifier does not confer permission to see or edit an individual's order.
BR-02 No actual administration is inferred from scheduled dose or preparation.
BR-03 No successful write result until verified transaction commit; idempotency and duplicate-event guard required.
BR-04 Distinguish occurred_at, recorded_at and order effective interval; corrections are append-only.
BR-05 FEFO respects lot expiry, container discard deadline, authorization and safe stock availability.
BR-06 Shared pool must never create duplicate financial expense when allocating to family members.
BR-07 Missing value is unknown, not zero; unknown strength, dose, price or stock must not be silently fabricated.
BR-08 Unverified order, possible allergy or unresolved preparation impact blocks relevant clinical approval and presents pending verification.
BR-09 Check performer, recorder, family and person authorization at the backend even when coming from LINE.
BR-10 Mutations and elevated changes are audited; review by physician/pharmacist remains a distinct approval step.
Status: rules defined, executable proof incomplete; consult Acceptance Matrix.
