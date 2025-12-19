-- Create table for encrypted MySQL configuration
CREATE TABLE public.mysql_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  db_host_encrypted TEXT,
  db_name_encrypted TEXT,
  db_user_encrypted TEXT,
  db_password_encrypted TEXT,
  verification_query TEXT DEFAULT 'SELECT 1 FROM users WHERE email = ? LIMIT 1',
  iv TEXT,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS - no frontend read access to encrypted data
ALTER TABLE public.mysql_config ENABLE ROW LEVEL SECURITY;

-- Only admins can check if configured (but cannot see encrypted values)
CREATE POLICY "Admins can check config status"
  ON public.mysql_config FOR SELECT
  USING (is_app_admin(auth.uid()));

-- No frontend INSERT/UPDATE/DELETE - only service role can write
-- This ensures credentials can only be written by Edge Functions