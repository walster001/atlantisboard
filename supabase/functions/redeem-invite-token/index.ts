import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RedeemInviteRequest {
  token: string;
}

Deno.serve(async (req) => {
  console.log('=== REDEEM INVITE TOKEN START ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.log('ERROR: No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT for auth check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Supabase URL configured:', !!supabaseUrl);
    console.log('Supabase Anon Key configured:', !!supabaseAnonKey);
    console.log('Supabase Service Key configured:', !!supabaseServiceKey);
    
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the authenticated user
    console.log('Fetching authenticated user...');
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError) {
      console.error('ERROR: User authentication failed:', JSON.stringify(userError, null, 2));
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!user) {
      console.error('ERROR: No user returned from auth');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user ID:', user.id);
    console.log('Authenticated user email:', user.email);

    // Parse request body
    let body: RedeemInviteRequest;
    try {
      body = await req.json();
      console.log('Request body parsed successfully');
    } catch (parseError) {
      console.error('ERROR: Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { token } = body;
    console.log('Token received:', token ? `${token.substring(0, 10)}...` : 'NONE');

    if (!token) {
      console.log('ERROR: No invite token provided in request');
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Invite token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== CALLING DATABASE FUNCTION ===');
    console.log('Function: validate_and_redeem_invite_token');
    console.log('Parameters: _token (truncated), _user_id:', user.id);

    // Use service role client to call the validation function (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Validate and redeem the token using database function
    const { data: result, error: redeemError } = await supabaseAdmin.rpc('validate_and_redeem_invite_token', {
      _token: token,
      _user_id: user.id,
    });

    if (redeemError) {
      console.error('=== DATABASE FUNCTION ERROR ===');
      console.error('Error code:', redeemError.code);
      console.error('Error message:', redeemError.message);
      console.error('Error details:', redeemError.details);
      console.error('Error hint:', redeemError.hint);
      console.error('Full error:', JSON.stringify(redeemError, null, 2));
      return new Response(
        JSON.stringify({ error: 'Server Error', message: 'Failed to process invite', details: redeemError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== DATABASE FUNCTION RESULT ===');
    console.log('Result:', JSON.stringify(result, null, 2));

    // Check result from database function
    if (!result.success) {
      console.log('Token redemption failed:', result.error, result.message);
      const statusCode = result.error === 'invalid_token' ? 404 
        : result.error === 'expired' ? 410 
        : result.error === 'already_used' ? 410 
        : 400;
      
      return new Response(
        JSON.stringify({ 
          error: result.error, 
          message: result.message,
          success: false,
        }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== SUCCESS ===');
    console.log('User added to board:', result.board_id);
    console.log('Already member:', result.already_member || false);

    return new Response(
      JSON.stringify({
        success: true,
        boardId: result.board_id,
        alreadyMember: result.already_member || false,
        message: result.message,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('=== UNEXPECTED ERROR ===');
    const err = error as Error;
    console.error('Error type:', err?.constructor?.name);
    console.error('Error message:', err?.message);
    console.error('Error stack:', err?.stack);
    console.error('Full error:', String(error));
    return new Response(
      JSON.stringify({ error: 'Server Error', message: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
