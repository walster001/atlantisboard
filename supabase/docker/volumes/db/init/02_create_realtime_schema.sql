-- Minimal Realtime schema for local-only setup
-- This creates the minimal required schema without Lovable-specific configurations

-- Create _realtime schema
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

-- Create tenants table for Realtime service (required by Realtime v2.28.32)
-- This table stores tenant configuration for the Realtime service
CREATE TABLE IF NOT EXISTS _realtime.tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    external_id text NOT NULL UNIQUE,
    jwt_secret text,
    jwt_jwks jsonb,
    postgres_cdc_default text,
    max_concurrent_users integer DEFAULT 200,
    max_events_per_second integer DEFAULT 100,
    max_bytes_per_second integer DEFAULT 100000,
    max_channels_per_client integer DEFAULT 100,
    max_joins_per_second integer DEFAULT 100,
    suspend boolean DEFAULT false,
    enable_authorization boolean DEFAULT false,
    inserted_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create single tenant for local-only setup (one tenant for one database)
-- Realtime service looks for tenant with external_id = 'realtime' (from FLY_APP_NAME)
-- This is a SINGLE-TENANT setup: one tenant represents the single database
-- 
-- JWT Validation: Client JWTs are validated against this tenant's jwt_secret
--   - JWT secret is set to NULL initially - Realtime service will set it from API_JWT_SECRET on startup
--   - The JWT secret is stored encrypted by Realtime using DB_ENC_KEY when Realtime writes it
-- 
-- Channel Scoping: All channels are scoped to this single tenant
--   - Each client connects with a JWT, Realtime validates against this tenant's secret
--   - Clients subscribe to channels scoped to this tenant
-- 
-- Database Connection: The tenant uses the default Realtime.Repo connection pool
--   - Same database connection as the realtime service itself (DB_HOST=db, DB_NAME=postgres)
--   - No separate tenant database connection needed - the tenant database IS the main database
-- 
-- RLS Support: For RLS-enabled tables, use postgres_cdc_rls driver with authorization enabled
--   - postgres_cdc_rls uses the same database connection pool (Realtime.Repo) for all operations
--   - RLS policies are enforced at the database level - no separate tenant database connection needed
INSERT INTO _realtime.tenants (name, external_id, postgres_cdc_default, enable_authorization, jwt_secret)
VALUES ('realtime', 'realtime', 'postgres_cdc_rls', false, NULL)
ON CONFLICT (external_id) DO UPDATE SET 
    postgres_cdc_default = COALESCE(EXCLUDED.postgres_cdc_default, _realtime.tenants.postgres_cdc_default),
    enable_authorization = COALESCE(EXCLUDED.enable_authorization, _realtime.tenants.enable_authorization),
    -- Only update jwt_secret if it's still NULL (let Realtime set it on first startup)
    jwt_secret = COALESCE(_realtime.tenants.jwt_secret, EXCLUDED.jwt_secret);

-- Create extensions table for Realtime service (required for driver registration)
-- This table stores extension/driver configuration for the Realtime service
CREATE TABLE IF NOT EXISTS _realtime.extensions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    settings jsonb,
    tenant_external_id text NOT NULL,
    inserted_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id) ON DELETE CASCADE
);

-- Register postgres_cdc_rls extension for the realtime tenant
-- This is required for the realtime service to recognize the postgres_cdc_rls driver
-- postgres_cdc_rls is needed when RLS (Row Level Security) is enabled on database tables
-- 
-- Region Configuration: Include region in settings to bypass get_region function's pattern matching issue
--   - The region is set to 'local' for local-only setups where region controls are not needed
--   - This allows the service to default to Realtime.Repo (the default connection) instead of looking for region-specific connections
-- 
-- Database Connection: postgres_cdc_rls uses the same database connection pool (Realtime.Repo) for all operations
--   - No separate tenant database connection is needed - the tenant database IS the main database
--   - RLS policies handle data isolation at the database level
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _realtime.extensions WHERE type = 'postgres_cdc_rls' AND tenant_external_id = 'realtime') THEN
        INSERT INTO _realtime.extensions (type, settings, tenant_external_id)
        VALUES ('postgres_cdc_rls', '{"region": "local"}'::jsonb, 'realtime');
    ELSE
        UPDATE _realtime.extensions 
        SET settings = '{"region": "local"}'::jsonb
        WHERE type = 'postgres_cdc_rls' AND tenant_external_id = 'realtime';
    END IF;
END
$$;

-- Grant permissions on realtime tables
GRANT ALL ON _realtime.tenants TO postgres;
GRANT ALL ON _realtime.extensions TO postgres;

-- Single-Tenant Mode Summary:
--   - One tenant (external_id = 'realtime') represents the single database
--   - Tenant uses default Realtime.Repo connection (same as realtime service: DB_HOST=db, DB_NAME=postgres)
--   - JWT validation: Client JWTs validated against tenant's jwt_secret (from API_JWT_SECRET)
--   - Channel scoping: All channels scoped to this single tenant
--   - RLS support: postgres_cdc_rls driver with enable_authorization=true respects RLS policies
--   - No separate tenant database: The tenant database IS the main database
-- 
-- Expected Behavior:
--   - "Replica region not found, defaulting to Realtime.Repo" warning is expected and correct for local-only setups
--   - When enable_authorization = true, the service may attempt to call external nodes, but should fall back to Realtime.Repo
--   - All database operations use the same connection pool - no separate tenant database connection needed

