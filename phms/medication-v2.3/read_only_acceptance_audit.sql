-- PHMS v2.3 read-only security and integrity smoke audit
-- No writes. Execute against authorized environment; never expose PHI in logs.
select 'uat_result' check_name, result detail, count(*)::text result_value from public.phms_med_ui_uat_cases group by result;
select 'medication_core_rows' check_name, 'medication_master' detail,count(*)::text result_value from public.medication_master
union all select 'medication_core_rows','person_medications',count(*)::text from public.person_medications
union all select 'medication_core_rows','medication_order_versions',count(*)::text from public.medication_order_versions
union all select 'medication_core_rows','medication_administration_events',count(*)::text from public.medication_administration_events;
select c.relname relation_name,c.relrowsecurity rls_enabled,count(p.policyname) direct_policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public' and c.relname in
('medication_master','medication_order_versions','medication_administration_events','medication_inventory_transactions','medication_expense_links')
group by c.relname,c.relrowsecurity order by c.relname;
select c.relname view_name,c.reloptions,has_table_privilege('anon',c.oid,'SELECT') anon_select,has_table_privilege('authenticated',c.oid,'SELECT') auth_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('medication_current_list_v','medication_emergency_summary_v','medication_inventory_compat_v','medication_inventory_fefo_v');
