-- Run as the trusted database administrator on the explicitly selected fresh DB.
-- No password literals. Set LOGIN/passwords separately with psql \password.
BEGIN;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['life_os_migrator','life_os_runtime','life_os_operator','life_os_backup'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) OR
      EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=role_name) THEN
      RAISE EXCEPTION 'An operations role has unexpected privileges or memberships; review before proceeding';
    END IF;
  END LOOP;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO life_os_migrator, life_os_runtime, life_os_operator, life_os_backup', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO life_os_migrator', current_database());
END; $$;
-- PostgreSQL 16+ requires explicit SET permission for a non-superuser owner transfer.
-- Only the trusted administrator can assume the migrator; the runtime cannot.
GRANT life_os_migrator TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
ALTER SCHEMA public OWNER TO life_os_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO life_os_migrator;
GRANT USAGE ON SCHEMA public TO life_os_runtime, life_os_operator, life_os_backup;
SET LOCAL ROLE life_os_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE life_os_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
COMMIT;
