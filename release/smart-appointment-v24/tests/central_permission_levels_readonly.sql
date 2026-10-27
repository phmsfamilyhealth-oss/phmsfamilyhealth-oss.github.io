-- PHMS v2.4 central permission policy semantics; read-only, no patient rows.
WITH checks AS (
SELECT 'view_level_can_view' name, private.phms_five_category_level_allows('view','{}'::jsonb,'appointments','view') pass
UNION ALL SELECT 'view_level_cannot_create', NOT private.phms_five_category_level_allows('view','{}'::jsonb,'appointments','create')
UNION ALL SELECT 'view_level_cannot_delete', NOT private.phms_five_category_level_allows('view','{}'::jsonb,'appointments','delete')
UNION ALL SELECT 'manage_level_can_create', private.phms_five_category_level_allows('manage','{}'::jsonb,'appointments','create')
UNION ALL SELECT 'override_deny_blocks', NOT private.phms_five_category_level_allows('manage','{"appointments":"none"}'::jsonb,'appointments','view')
UNION ALL SELECT 'override_view_blocks_update', NOT private.phms_five_category_level_allows('manage','{"appointments":"view"}'::jsonb,'appointments','update')
UNION ALL SELECT 'override_manage_allows_update', private.phms_five_category_level_allows('view','{"appointments":"manage"}'::jsonb,'appointments','update')
UNION ALL SELECT 'invalid_level_denied', NOT private.phms_five_category_level_allows('invalid','{}'::jsonb,'appointments','view')
) SELECT name,pass FROM checks ORDER BY name;
