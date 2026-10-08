-- Apply after 0000–0006 using the migration owner. Explicit lists, no future-table grants.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO life_os_runtime, life_os_operator, life_os_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, life_os_runtime, life_os_operator, life_os_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, life_os_runtime, life_os_operator, life_os_backup;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, life_os_runtime, life_os_operator, life_os_backup;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, life_os_runtime, life_os_operator;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM PUBLIC, life_os_runtime, life_os_operator;
GRANT SELECT ON app_user, auth_credential, auth_session, auth_rate_limit, category, vision,
  season, season_allocation, goal, milestone, project, task, inbox_item, daily_plan,
  daily_big_three, schedule_block, focus_session, focus_interval, routine, routine_completion,
  vault_item, execution_receipt TO life_os_runtime;
GRANT INSERT, UPDATE ON auth_session, auth_rate_limit, season, goal, milestone, project, task,
  daily_plan, daily_big_three, schedule_block, focus_session, focus_interval, routine,
  routine_completion, vault_item TO life_os_runtime;
GRANT INSERT ON category, vision, inbox_item, season_allocation, execution_receipt TO life_os_runtime;
GRANT DELETE ON auth_rate_limit, season_allocation, daily_big_three, schedule_block, routine_completion TO life_os_runtime;
GRANT UPDATE(id) ON app_user TO life_os_runtime;
GRANT UPDATE(processed_at) ON inbox_item TO life_os_runtime;
GRANT EXECUTE ON FUNCTION life_os_touch_updated_at() TO life_os_runtime, life_os_operator;
GRANT SELECT, INSERT ON app_user, auth_credential TO life_os_operator;
GRANT USAGE ON SCHEMA drizzle TO life_os_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO life_os_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO life_os_backup;
GRANT SELECT ON app_user, auth_credential, auth_session, auth_rate_limit, category, vision,
  season, season_allocation, goal, milestone, project, task, inbox_item, daily_plan,
  daily_big_three, schedule_block, focus_session, focus_interval, routine, routine_completion,
  vault_item, execution_receipt TO life_os_backup;
COMMIT;
