import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAppAdmin: boolean;
  isVerified: boolean;
  verificationError: string | null;
  clearVerificationError: () => void;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [oauthRetryCount, setOauthRetryCount] = useState(0);

  const clearVerificationError = useCallback(() => {
    setVerificationError(null);
  }, []);

  // Check if user needs database verification
  const verifyUserInDatabase = useCallback(async (email: string): Promise<{ verified: boolean; message?: string }> => {
    try {
      const response = await supabase.functions.invoke('verify-user-email', {
        body: { email },
      });

      if (response.error) {
        console.error('Verification function error:', response.error);
        return { verified: false, message: 'Verification service unavailable' };
      }

      return response.data;
    } catch (error) {
      console.error('Verification error:', error);
      return { verified: false, message: 'Verification failed' };
    }
  }, []);

  // Check for clock skew in console errors
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Detect clock skew warnings from Supabase
      if (message.includes('clock for skew') || message.includes('issued in the future')) {
        console.warn('Clock skew detected. This may cause authentication issues.');
        // Don't block the error, just log it
      }
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);

  // Handle auth state changes with verification
  const handleAuthStateChange = useCallback(async (event: string, newSession: Session | null) => {
    console.log('Auth state change:', event, newSession?.user?.email);
    
    // Detect clock skew scenario: SIGNED_OUT immediately after OAuth callback
    const hash = window.location.hash;
    const isOAuthCallback = hash && (
      hash.includes('access_token') || 
      hash.includes('refresh_token')
    );
    
    if (event === 'SIGNED_OUT' && isOAuthCallback && oauthRetryCount < 3) {
      console.warn('SIGNED_OUT detected during OAuth callback - possible clock skew. Retrying...');
      const currentRetryCount = oauthRetryCount;
      setOauthRetryCount(prev => prev + 1);
      
      // Wait a bit and retry getting the session
      // Sometimes the session needs a moment to be processed
      setTimeout(async () => {
        try {
          const { data: { session: retrySession }, error } = await supabase.auth.getSession();
          if (retrySession && !error) {
            console.log('Session retrieved on retry - clock skew may have resolved');
            // Set session directly instead of recursive call
            setSession(retrySession);
            setUser(retrySession.user);
            setLoading(false);
            setOauthRetryCount(0);
            // Trigger verification if needed
            if (retrySession.user) {
              const provider = retrySession.user.app_metadata?.provider;
              if (provider === 'google') {
                const { data: settings } = await supabase
                  .from('app_settings')
                  .select('login_style')
                  .eq('id', 'default')
                  .maybeSingle();
                if (settings?.login_style === 'google_verified') {
                  const result = await verifyUserInDatabase(retrySession.user.email!);
                  if (!result.verified) {
                    setVerificationError(result.message || 'User does not exist in database');
                    setIsVerified(false);
                    await supabase.auth.signOut();
                    return;
                  }
                  setIsVerified(true);
                } else {
                  setIsVerified(true);
                }
              } else {
                setIsVerified(true);
              }
              fetchAdminStatus(retrySession.user.id);
            }
            return;
          }
        } catch (err) {
          console.error('Retry failed:', err);
        }
      }, 500 * (currentRetryCount + 1)); // Exponential backoff
    }
    
    // If signing in via Google OAuth, check if verification is needed
    if (event === 'SIGNED_IN' && newSession?.user) {
      // Check if this is a Google OAuth sign-in by checking the provider
      const provider = newSession.user.app_metadata?.provider;
      
      if (provider === 'google') {
        // Check login style
        const { data: settings } = await supabase
          .from('app_settings')
          .select('login_style')
          .eq('id', 'default')
          .maybeSingle();

        if (settings?.login_style === 'google_verified') {
          console.log('Checking database verification for:', newSession.user.email);
          const result = await verifyUserInDatabase(newSession.user.email!);
          
          if (!result.verified) {
            console.log('User not verified, signing out');
            setVerificationError(result.message || 'User does not exist in database');
            setIsVerified(false);
            await supabase.auth.signOut();
            return;
          }
          console.log('User verified successfully');
          setIsVerified(true);
        } else {
          // Non-verified login styles are always considered verified
          setIsVerified(true);
        }
      } else {
        // Non-Google providers are always considered verified
        setIsVerified(true);
      }
    }

    setSession(newSession);
    setUser(newSession?.user ?? null);
    setLoading(false);
    
    // Reset retry count on successful sign in
    if (event === 'SIGNED_IN') {
      setOauthRetryCount(0);
    }
    
    // Fetch admin status after auth state change
    if (newSession?.user) {
      setTimeout(() => {
        fetchAdminStatus(newSession.user.id);
      }, 0);
    } else {
      setIsAppAdmin(false);
    }
  }, [verifyUserInDatabase]);

  useEffect(() => {
    // Check for OAuth callback hash fragments
    // PKCE flow uses 'code' parameter, implicit flow uses 'access_token'
    const hash = window.location.hash;
    const isOAuthCallback = hash && (
      hash.includes('access_token') || 
      hash.includes('refresh_token') || 
      hash.includes('code=') ||  // PKCE flow uses code parameter
      hash.includes('error=') ||
      hash.includes('error_description=')
    );
    
    // Log OAuth callback details for debugging
    if (isOAuthCallback) {
      console.log('[useAuth] OAuth callback detected, hash:', hash.substring(0, 100) + '...');
      // Check for errors in hash
      if (hash.includes('error=')) {
        const errorMatch = hash.match(/error=([^&]+)/);
        const errorDescMatch = hash.match(/error_description=([^&]+)/);
        console.error('[useAuth] OAuth callback error:', errorMatch?.[1], errorDescMatch?.[1]);
      }
    }

    // Set up auth state listener FIRST
    // This will handle OAuth callbacks via the SIGNED_IN event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleAuthStateChange(event, session);
      }
    );

    // THEN check for existing session
    // getSession() will automatically process hash fragments if present
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // If there's an error related to clock skew, log it but don't fail immediately
      if (error) {
        console.warn('[useAuth] Session retrieval error:', error);
        // Log more details about the error
        if (error.message) {
          console.warn('[useAuth] Error message:', error.message);
        }
        // If it's a clock skew issue, we'll handle it in the retry logic
      }
      
      // Log session state for debugging
      if (isOAuthCallback) {
        console.log('[useAuth] OAuth callback - session state:', session ? 'has session' : 'no session', 'error:', error ? 'yes' : 'no');
      }
      
      // If this is an OAuth callback, the hash fragments will be processed
      // and onAuthStateChange will fire with SIGNED_IN event
      // In that case, handleAuthStateChange will set loading to false
      // So we only set loading to false here if it's NOT an OAuth callback
      // or if we already have a session (meaning the callback was processed)
      if (!isOAuthCallback || session) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (session?.user) {
          fetchAdminStatus(session.user.id);
        }
      } else if (isOAuthCallback && !session) {
        // Check if there's an error in the hash first
        const hashParams = new URLSearchParams(hash.substring(1));
        const oauthError = hashParams.get('error');
        const oauthErrorDesc = hashParams.get('error_description');
        
        if (oauthError) {
          console.error('[useAuth] OAuth callback error detected:', oauthError, oauthErrorDesc);
          setLoading(false);
          // Don't retry if there's an explicit error
          return;
        }
        
        // OAuth callback detected but no session yet
        // Keep loading true and wait for onAuthStateChange to process it
        // This ensures components don't redirect before session is established
        console.log('[useAuth] OAuth callback detected, waiting for onAuthStateChange to process...');
        
        // Set up a retry mechanism with longer timeout for OAuth callbacks
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // Start with 1 second
        
        const retrySessionCheck = () => {
          if (retryCount < maxRetries) {
            setTimeout(() => {
              supabase.auth.getSession().then(({ data: { session: retrySession }, error: retryError }) => {
                if (retrySession) {
                  console.log('[useAuth] Session retrieved on retry attempt', retryCount + 1);
                  setSession(retrySession);
                  setUser(retrySession.user);
                  setLoading(false);
                  fetchAdminStatus(retrySession.user.id);
                } else if (retryError) {
                  console.error('[useAuth] Retry session check error:', retryError);
                  if (retryCount < maxRetries - 1) {
                    // Retry again with exponential backoff
                    retryCount++;
                    retrySessionCheck();
                  } else {
                    console.warn('[useAuth] OAuth callback failed after max retries');
                    setLoading(false);
                  }
                } else if (retryCount < maxRetries - 1) {
                  // Retry again with exponential backoff
                  retryCount++;
                  retrySessionCheck();
                } else {
                  // Max retries reached - set loading to false to prevent infinite loading
                  // onAuthStateChange should have handled it by now, or there's an error
                  console.warn('[useAuth] OAuth callback timeout after max retries - no session established');
                  setLoading(false);
                }
              });
            }, retryDelay * (retryCount + 1)); // Exponential backoff
          }
        };
        
        // Start retry after initial delay
        retrySessionCheck();
      }
    });

    return () => subscription.unsubscribe();
  }, [handleAuthStateChange]);

  const fetchAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();
    
    setIsAppAdmin(data?.is_admin ?? false);
  };

  const signInWithGoogle = async () => {
    setVerificationError(null);
    
    // Detect if we're running on localhost for proper OAuth redirect
    const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';
    
    // Use localhost redirect URL when running locally, otherwise use current origin
    const redirectUrl = isLocalhost 
      ? `http://localhost:${window.location.port || '8080'}/`
      : `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    
    return { error };
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Session might already be invalid - clear local state anyway
      console.log('Sign out error (session may already be invalid):', error);
    }
    // Always clear local state
    setSession(null);
    setUser(null);
    setIsAppAdmin(false);
    setIsVerified(false);
    setVerificationError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAppAdmin,
        isVerified,
        verificationError,
        clearVerificationError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
