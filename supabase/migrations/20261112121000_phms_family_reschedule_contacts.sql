-- PHMS v2.4: family-scoped hospital reschedule contact overrides.
-- Never publish unverified family entries as the shared verified hospital registry.
CREATE TABLE IF NOT EXISTS private.phms_family_reschedule_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.healthcare_organizations(id),
  service_unit_id uuid REFERENCES public.healthcare_service_units(id),
  days_mode text NOT NULL CHECK (days_mode IN ('government','specific')),
  weekdays text[] NOT NULL DEFAULT '{}'::text[],
  hours_mode text CHECK (hours_mode IN ('office','morning','afternoon','morning-afternoon','custom')),
  start_time text,
  end_time text,
  phones text[] NOT NULL DEFAULT '{}'::text[],
  notice_days integer CHECK (notice_days IN (1,3,5,7)),
  notice_unit text NOT NULL DEFAULT 'calendar' CHECK (notice_unit IN ('calendar','working')),
  instructions text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (family_id,organization_id,service_unit_id),
  CHECK (cardinality(weekdays)<=7),
  CHECK (cardinality(phones)<=12),
  CHECK (length(instructions)<=600)
);
CREATE TABLE IF NOT EXISTS private.phms_family_reschedule_contact_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES private.phms_family_reschedule_contacts(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  prior_record jsonb,
  current_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.phms_family_reschedule_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.phms_family_reschedule_contact_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.phms_family_reschedule_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON private.phms_family_reschedule_contact_audit FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE private.phms_family_reschedule_contacts IS
 'Family-only contact preferences, authenticated via PHMS LINE actor; never a globally verified hospital record.';
COMMENT ON TABLE private.phms_family_reschedule_contact_audit IS
 'Append-only provenance for owner/admin changes to family hospital contact preferences.';
