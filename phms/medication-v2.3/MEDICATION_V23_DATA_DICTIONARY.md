# Medication v2.3 — Data dictionary (verified table-level mapping)
Do not create replacement tables until complete column/FK-level audit.
Catalog source: medication_master; aliases: medication_aliases; packages: medication_packages.
Person prescriptions: person_medications, medication_regimens, medication_regimen_doses, medication_timing_policies, medication_order_versions, medication_instruction_sources.
Generated schedule: medication_scheduled_doses and medication_round_instances; historical administration: medication_administration_events and medication_administration_corrections.
Inventory events: medication_inventory_transactions; inventory projection/cache: medication_inventory_balances; legacy support: medication_lots, medication_dispenses, medication_stock_ledger, medication_containers; views medication_inventory_compat_v, medication_inventory_fefo_v.
Preparation: medication_preparation_sessions, medication_preparation_items, medication_preparation_checks, medication_preparation_impacts and medication_preparation_audit_events.
Safety: allergies, medication_safety_reviews, medication_conditional_rules, medication_prn_assessments, medication_dose_decisions.
Finance: medication_price_references, medication_expense_links, healthcare_expense_items, healthcare_expenses.
Emergency/history: medication_emergency_snapshots, emergency_profiles, record_provenance, medication_media.
Verification evidence: 189 foreign keys, 414 checks, 29 unique constraints, 121 indexes, 73 noninternal triggers for medication_% plus person_medications (counts only; correctness NOT VERIFIED).
Baseline as of 2026-10-22: medication_master=3, person_medications=2, medication_order_versions=2, medication_regimens=2, administration_events=0, inventory_transactions=0, healthcare_expenses=2.
A complete field dictionary, FK graph, deduplication proof and immutable UUID snapshot comparison remain NOT VERIFIED.
