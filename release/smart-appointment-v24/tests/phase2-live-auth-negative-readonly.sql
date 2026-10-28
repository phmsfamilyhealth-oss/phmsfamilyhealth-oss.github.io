-- Repeatable live read-only behavioral negative-path assertions.
-- Synthetic UUIDs only, no real users, family persons or patient data.
-- Not an authorized-owner vs another real-family test.
WITH probes AS (
 SELECT 'unknown_actor_a' name,
  private.user_can_access_family_person('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'appointments','view') as can_view,
  private.user_can_access_family_person('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'appointments','create') as can_create
 UNION ALL
 SELECT 'unknown_actor_b',
  private.user_can_access_family_person('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'appointments','view'),
  private.user_can_access_family_person('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'appointments','create')
)
SELECT name, (can_view IS FALSE AND can_create IS FALSE) AS pass FROM probes ORDER BY name;
