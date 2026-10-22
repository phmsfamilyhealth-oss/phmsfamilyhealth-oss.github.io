# PHMS v2.3 — Automatic Container ID + FEFO implementation gap record (2026-10-22)
Source: User implementation contract, live Supabase schema and actual `phms_med_v23_line_register_stock_container` definition.
Current `medication_stock_containers` has UUID, `pool_id`, `medication_id`, `lot_id`, `bottle_id` (NOT NULL), `manufacturer_expiry_date`, `beyond_use_at`, `idempotency_key`; shared medication pools map to `family_id`.
The existing registration RPC is SECURITY DEFINER and derives context from `private.phms_line_crud_context`; performs family/pool/lot checks and idempotency checks but **requires caller-supplied `p_bottle_id`**, so auto-generated `MED-PPP-CCC` is NOT implemented/verified.
The live `medication_inventory_fefo_v` exists but returned zero rows during audit; this is not a passed selection test.
The repo module `fefo-engine.mjs` is a **pure, offline eligibility model**, not connected to LINE or stock and not an authorization decision.
## Missing prerequisites for deployment
1. Audit product master identity and family scoping. Product codes must be family-scoped; product variants differentiated by true product identity.
2. Introduce durable family/product counters using locked transaction or keyed advisory lock and unique constraints. Never use unlocked `MAX+1`. Keep assigned codes immutable even after disposal.
3. Adapt existing registration RPC to emit codes automatically on receiving new physical containers, preserving its authorization/idempotency guarantees and historic `bottle_id` clients.
4. Store label lifecycle with evidence and review, guarding FEFO pick-readiness until `LABEL_VERIFIED`.
5. Define effective expiry using manufacturer expiry and beyond-use deadline; reject missing/expired/quarantined stock; FEFO rank is computed and is NOT permanent identifier.
6. Integrate atomic pick, stock allocation, preparation impact and verified order version, with repeat-postback protection.
7. Add 16 Flex screens for receipt/label/picking/preparation, secured opaque action context and senior-accessible layouts per current PHMS theme, button and Carousel standards.
8. Test with isolated fixtures and multiple authorized users; UAT real LINE and clinician approval required before production acceptance.
## Evidence
Source method: Supabase public catalog read and `pg_get_functiondef` (read-only).
No new database migration or runtime deploy performed by this work; no PHI changed.
