-- Grant SELECT permission to anon role for app_settings table
-- This allows unauthenticated users to read app settings (needed for login page branding)
-- The RLS policy "App settings are publicly readable" allows access, but we also need
-- table-level permissions for the anon role to actually access the table.
GRANT SELECT ON TABLE public.app_settings TO anon;

-- Grant EXECUTE permission to anon role for get_auth_page_data function
-- This allows unauthenticated users to call the RPC function to get auth page branding data
-- The function is SECURITY DEFINER so it runs with elevated privileges, but anon still needs
-- EXECUTE permission on the function itself.
GRANT EXECUTE ON FUNCTION public.get_auth_page_data() TO anon;

