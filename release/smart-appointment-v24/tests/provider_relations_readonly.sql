-- PHMS v2.4 / read-only hospital-clinic-doctor contract checks
-- Evaluates schema facts only. Never query patient records or mutate Production.
WITH checks AS (
 SELECT 'organization_active_softdelete' name,
 EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='healthcare_organizations' AND column_name='deleted_at') pass
 UNION ALL SELECT 'unit_organization_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.healthcare_service_units'::regclass AND contype='f' AND confrelid='public.healthcare_organizations'::regclass)
 UNION ALL SELECT 'doctor_organization_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.healthcare_clinicians'::regclass AND contype='f' AND confrelid='public.healthcare_organizations'::regclass)
 UNION ALL SELECT 'doctor_unit_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.healthcare_clinicians'::regclass AND contype='f' AND confrelid='public.healthcare_service_units'::regclass)
 UNION ALL SELECT 'doctor_softdelete',
 EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='healthcare_clinicians' AND column_name='deleted_at')
 UNION ALL SELECT 'appointment_org_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND contype='f' AND confrelid='public.healthcare_organizations'::regclass)
 UNION ALL SELECT 'appointment_unit_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND contype='f' AND confrelid='public.healthcare_service_units'::regclass)
 UNION ALL SELECT 'appointment_doctor_fk',
 EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND contype='f' AND confrelid='public.healthcare_clinicians'::regclass)
) SELECT name,pass FROM checks ORDER BY name;
