import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create user client to verify JWT and admin status
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.log('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      console.log('Not admin:', profileError);
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { db_host, db_name, db_user, db_password, verification_query } = await req.json();

    if (!db_host || !db_name || !db_user || !db_password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Testing MySQL connection to ${db_host}...`);

    // Parse host and port
    let hostname = db_host;
    let port = 3306;
    if (db_host.includes(':')) {
      const parts = db_host.split(':');
      hostname = parts[0];
      port = parseInt(parts[1], 10);
    }

    // Attempt MySQL connection
    const client = await new Client();
    
    try {
      await client.connect({
        hostname,
        port,
        username: db_user,
        password: db_password,
        db: db_name,
        timeout: 10000, // 10 second timeout
      });

      // Simple query to verify connection
      await client.execute('SELECT 1');
      
      console.log('MySQL connection test successful');
      
      // If verification query is provided, test it too
      let queryTestResult = null;
      if (verification_query) {
        try {
          // Replace ? with a test email to validate query syntax
          const testQuery = verification_query.replace('?', "'test@example.com'");
          console.log('Testing verification query:', testQuery);
          await client.execute(testQuery);
          queryTestResult = { success: true, message: 'Verification query executed successfully.' };
        } catch (queryError) {
          console.error('Verification query error:', queryError);
          const queryErrorStr = String(queryError);
          let queryErrorMsg = 'Verification query failed';
          
          if (queryErrorStr.includes("doesn't exist")) {
            queryErrorMsg = 'Table or column in query does not exist.';
          } else if (queryErrorStr.includes('syntax')) {
            queryErrorMsg = 'SQL syntax error in verification query.';
          } else {
            queryErrorMsg = `Query error: ${queryErrorStr.substring(0, 100)}`;
          }
          queryTestResult = { success: false, message: queryErrorMsg };
        }
      }
      
      await client.close();
      
      // Build response message
      let message = 'Connection successful! Database is reachable.';
      if (queryTestResult) {
        if (queryTestResult.success) {
          message += ' Verification query is valid.';
        } else {
          message = `Connection successful, but verification query failed: ${queryTestResult.message}`;
        }
      }
      
      return new Response(JSON.stringify({ 
        success: queryTestResult ? queryTestResult.success : true,
        connection_success: true,
        query_success: queryTestResult?.success ?? null,
        message,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (mysqlError) {
      console.error('MySQL connection error:', mysqlError);
      
      let errorMessage = 'Connection failed';
      const errorString = String(mysqlError);
      
      if (errorString.includes('Access denied')) {
        errorMessage = 'Access denied. Check username and password.';
      } else if (errorString.includes('Unknown database')) {
        errorMessage = `Database "${db_name}" does not exist.`;
      } else if (errorString.includes('ETIMEDOUT') || errorString.includes('timeout')) {
        errorMessage = 'Connection timed out. Check host address and firewall settings.';
      } else if (errorString.includes('ENOTFOUND') || errorString.includes('getaddrinfo')) {
        errorMessage = 'Host not found. Check the database host address.';
      } else if (errorString.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused. Check if MySQL is running and port is correct.';
      } else {
        errorMessage = `Connection failed: ${errorString.substring(0, 100)}`;
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: errorMessage 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error in test-mysql-connection:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
