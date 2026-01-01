import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerateInviteRequest {
  boardId: string;
  linkType?: 'one_time' | 'recurring';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log('User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const body: GenerateInviteRequest = await req.json();
    const { boardId, linkType = 'one_time' } = body;

    console.log('Request body:', { boardId, linkType });

    if (!boardId) {
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Board ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['one_time', 'recurring'].includes(linkType)) {
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Invalid link type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking permissions for board:', boardId);

    // Check if user can create invite tokens for this board (must be board admin)
    const { data: canCreate, error: permError } = await supabase.rpc('can_create_board_invite', {
      _user_id: user.id,
      _board_id: boardId,
    });

    if (permError) {
      console.error('Permission check error:', permError);
      return new Response(
        JSON.stringify({ error: 'Server Error', message: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!canCreate) {
      console.log('User lacks permission to create invite for board:', boardId);
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'You must be a board admin to generate invite links' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate cryptographically secure token
    // Combine UUID with random bytes for extra security
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const token = `inv_${crypto.randomUUID().replace(/-/g, '')}_${randomHex}`;

    console.log('Generated secure token for board:', boardId);

    // Insert token into database
    // One-time links expire in 24 hours, recurring links never expire (null expires_at)
    const expiresAt = linkType === 'one_time' 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() 
      : null;
    
    const { data: insertedToken, error: insertError } = await supabase
      .from('board_invite_tokens')
      .insert({
        token,
        board_id: boardId,
        created_by: user.id,
        expires_at: expiresAt,
        link_type: linkType,
      })
      .select('id, token, expires_at, link_type')
      .single();

    if (insertError) {
      console.error('Token insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Server Error', message: 'Failed to generate invite link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token created successfully:', insertedToken.id);

    return new Response(
      JSON.stringify({
        success: true,
        token: insertedToken.token,
        expiresAt: insertedToken.expires_at,
        linkType: insertedToken.link_type,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Server Error', message: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
