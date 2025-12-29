-- Create auth schema for GoTrue
CREATE SCHEMA IF NOT EXISTS auth;

-- Create required database roles for PostgREST and Supabase services
-- These roles must exist before PostgREST (rest service) starts
DO $$
BEGIN
    -- Create anon role (required by PostgREST)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    
    -- Create authenticated role
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    
    -- Create service_role role
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    
    -- Create supabase_admin role (used by Supabase services)
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END
$$;

-- Grant necessary permissions to roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;

-- Grant future table access
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Create storage schema for Supabase Storage
CREATE SCHEMA IF NOT EXISTS storage;

-- Grant permissions on storage schema
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA storage TO postgres;

-- Create extensions schema for PostgreSQL extensions
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role, supabase_admin;
GRANT ALL ON SCHEMA extensions TO postgres;

-- Ensure realtime schema exists for realtime service
CREATE SCHEMA IF NOT EXISTS _realtime;
GRANT ALL ON SCHEMA _realtime TO postgres;

-- Create supabase_realtime publication for Realtime service
-- This publication is used by Supabase Realtime to replicate table changes
-- Note: We create it without FOR ALL TABLES so migrations can add tables individually
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;
