-- Maintain timestamps even for maintenance SQL outside the application service.
CREATE FUNCTION life_os_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_user', 'auth_credential', 'auth_session', 'category', 'season',
    'season_allocation', 'vision', 'goal', 'milestone', 'project', 'task',
    'inbox_item', 'daily_plan', 'daily_big_three', 'schedule_block', 'focus_session'
  ] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION life_os_touch_updated_at()', table_name);
  END LOOP;
END;
$$;
