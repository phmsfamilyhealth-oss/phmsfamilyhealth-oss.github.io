-- PHMS v2.4 secure write candidate; private payload keeps all non-photo form
-- fields atomically alongside the canonical appointment record.
create table if not exists private.phms_v24_appointment_form_payloads (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
revoke all on private.phms_v24_appointment_form_payloads from public, anon, authenticated;
-- A completed retrospective visit may legitimately lack its clock time.
alter table public.appointments drop constraint if exists aim_walk_in_date_only_allowed;
alter table public.appointments add constraint aim_walk_in_date_only_allowed
 check (
   visit_time_known = true
   or (appointment_at is null and planned_visit_date is not null and
        ((visit_mode = 'walk_in' and status in ('planned','scheduled')) or
         status = 'completed'))
 );
