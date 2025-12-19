-- Update get_auth_page_data to include login_style
CREATE OR REPLACE FUNCTION public.get_auth_page_data()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'settings', (
      SELECT row_to_json(s.*)
      FROM (
        SELECT 
          custom_login_logo_enabled,
          custom_login_logo_url,
          custom_login_logo_size,
          custom_app_name_enabled,
          custom_app_name,
          custom_app_name_size,
          custom_app_name_color,
          custom_app_name_font,
          custom_tagline_enabled,
          custom_tagline,
          custom_tagline_size,
          custom_tagline_color,
          custom_tagline_font,
          custom_login_background_enabled,
          custom_login_background_type,
          custom_login_background_color,
          custom_login_background_image_url,
          custom_login_box_background_color,
          custom_google_button_background_color,
          custom_google_button_text_color,
          login_style
        FROM app_settings
        WHERE id = 'default'
      ) s
    ),
    'fonts', COALESCE(
      (SELECT json_agg(row_to_json(f.*))
       FROM (SELECT id, name, font_url FROM custom_fonts) f),
      '[]'::json
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;