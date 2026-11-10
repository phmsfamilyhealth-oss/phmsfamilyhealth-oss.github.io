-- PHMS v2.4 Hospital Journey Guide: additive, private data structures.
-- Already applied to Supabase as phms_v24_journey_private_schema_and_photo_bucket.
-- This file records the exact safe schema for repository deployments.
CREATE TABLE IF NOT EXISTS private.phms_journey_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 family_id uuid NOT NULL REFERENCES public.families(id),
 organization_id uuid NOT NULL REFERENCES public.healthcare_organizations(id),
 service_unit_id uuid NOT NULL REFERENCES public.healthcare_service_units(id),
 title text NOT NULL DEFAULT 'เส้นทางไปแผนก',
 main_location jsonb NOT NULL DEFAULT '{}'::jsonb,
 steps jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_kind text NOT NULL DEFAULT 'family',
 version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phms_journey_template_source_check CHECK (source_kind='family'),
 CONSTRAINT phms_journey_template_version_check CHECK (version>0),
 CONSTRAINT phms_journey_template_location_object CHECK (jsonb_typeof(main_location)='object'),
 CONSTRAINT phms_journey_template_steps_array CHECK (jsonb_typeof(steps)='array' AND jsonb_array_length(steps)<=40),
 CONSTRAINT phms_journey_template_title_length CHECK (char_length(title) BETWEEN 1 AND 160),
 CONSTRAINT phms_journey_family_unit_unique UNIQUE (family_id,organization_id,service_unit_id)
);
CREATE INDEX IF NOT EXISTS phms_journey_templates_family_idx ON private.phms_journey_templates(family_id,organization_id,service_unit_id);
CREATE TABLE IF NOT EXISTS private.phms_journey_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 template_id uuid NOT NULL REFERENCES private.phms_journey_templates(id) ON DELETE CASCADE,
 step_key text NOT NULL,
 position integer NOT NULL,
 storage_path text NOT NULL UNIQUE,
 caption text NOT NULL DEFAULT '',
 file_name text NOT NULL,
 byte_size integer NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phms_journey_photo_step_key_check CHECK (char_length(step_key) BETWEEN 1 AND 100),
 CONSTRAINT phms_journey_photo_position_check CHECK (position BETWEEN 1 AND 5),
 CONSTRAINT phms_journey_photo_caption_check CHECK (char_length(caption)<=140),
 CONSTRAINT phms_journey_photo_name_check CHECK (char_length(file_name) BETWEEN 1 AND 200),
 CONSTRAINT phms_journey_photo_size_check CHECK (byte_size BETWEEN 1 AND 2097152),
 CONSTRAINT phms_journey_photo_five_per_stop UNIQUE (template_id,step_key,position)
);
CREATE INDEX IF NOT EXISTS phms_journey_photos_template_idx ON private.phms_journey_photos(template_id,step_key,position);
CREATE TABLE IF NOT EXISTS private.phms_appointment_journey_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
 family_id uuid NOT NULL REFERENCES public.families(id),
 template_id uuid REFERENCES private.phms_journey_templates(id) ON DELETE SET NULL,
 main_location jsonb NOT NULL DEFAULT '{}'::jsonb,
 steps jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_version integer,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phms_journey_snapshot_location_object CHECK (jsonb_typeof(main_location)='object'),
 CONSTRAINT phms_journey_snapshot_steps_array CHECK (jsonb_typeof(steps)='array' AND jsonb_array_length(steps)<=40)
);
CREATE INDEX IF NOT EXISTS phms_appointment_journey_snapshots_family_idx ON private.phms_appointment_journey_snapshots(family_id,appointment_id);
ALTER TABLE private.phms_journey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.phms_journey_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.phms_appointment_journey_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.phms_journey_templates FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE private.phms_journey_photos FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE private.phms_appointment_journey_snapshots FROM PUBLIC,anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('phms-journey-guides','phms-journey-guides',false,2097152,ARRAY['image/jpeg']::text[])
ON CONFLICT(id) DO NOTHING;
-- No storage.objects policy granted: server-mediated LINE access only.
