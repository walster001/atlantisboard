import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM decryption
async function decryptData(encryptedBase64: string, ivBase64: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      console.log('Invalid email provided');
      return new Response(JSON.stringify({ verified: false, message: 'Invalid email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Verifying email:', email);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('MYSQL_ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('MYSQL_ENCRYPTION_KEY not configured');
      return new Response(JSON.stringify({ verified: false, message: 'Verification not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to read encrypted config
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config, error: configError } = await serviceClient
      .from('mysql_config')
      .select('*')
      .eq('id', 'default')
      .single();

    if (configError || !config || !config.is_configured) {
      console.log('MySQL config not found or not configured:', configError);
      return new Response(JSON.stringify({ verified: false, message: 'Database verification not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Decrypting MySQL credentials...');

    // Decrypt credentials
    const dbHost = await decryptData(config.db_host_encrypted, config.iv, encryptionKey);
    const dbName = await decryptData(config.db_name_encrypted, config.iv, encryptionKey);
    const dbUser = await decryptData(config.db_user_encrypted, config.iv, encryptionKey);
    const dbPassword = await decryptData(config.db_password_encrypted, config.iv, encryptionKey);

    console.log('Connecting to MySQL database...');

    // Connect to external MySQL
    const client = await new Client().connect({
      hostname: dbHost,
      username: dbUser,
      db: dbName,
      password: dbPassword,
      timeout: 10000, // 10 second timeout
    });

    try {
      // Execute prepared query with email parameter
      const query = config.verification_query.replace('?', '?');
      console.log('Executing verification query...');
      
      const result = await client.execute(query, [email]);
      
      const verified = result.rows && result.rows.length > 0;
      console.log('Verification result:', verified ? 'User found' : 'User not found');

      await client.close();

      return new Response(JSON.stringify({ 
        verified,
        message: verified ? 'User verified' : 'User does not exist in database'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (queryError) {
      console.error('Query error:', queryError);
      await client.close();
      return new Response(JSON.stringify({ 
        verified: false, 
        message: 'Database verification failed' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error in verify-user-email:', error);
    return new Response(JSON.stringify({ 
      verified: false, 
      message: 'Verification service error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
