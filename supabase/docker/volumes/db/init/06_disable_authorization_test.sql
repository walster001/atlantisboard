-- Temporarily disable authorization to test if it resolves the tenant database connection error
UPDATE _realtime.tenants 
SET enable_authorization = false
WHERE external_id = 'realtime';

