import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from '@/integrations/api/client';

// User type matching Supabase User structure for compatibility
interface User {
  id: string;
  email: string;
  app_metadata?: {
    provider?: string;
  };
  user_metadata?: {
    avatar_url?: string | null;
    full_name?: string | null;
  };
}

interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

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

  const clearVerificationError = useCallback(() => {
    setVerificationError(null);
  }, []);

  // Check if user needs database verification
  const verifyUserInDatabase = useCallback(async (email: string): Promise<{ verified: boolean; message?: string }> => {
    try {
      const result = await api.functions.invoke('verify-user-email', {
        body: { email },
      });

      if (result.error) {
        console.error('Verification function error:', result.error);
        return { verified: false, message: 'Verification service unavailable' };
      }

      return result.data as { verified: boolean; message?: string };
    } catch (error) {
      console.error('Verification error:', error);
      return { verified: false, message: 'Verification failed' };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Always clear local state
      api.clearAuth();
      setSession(null);
      setUser(null);
      setIsAppAdmin(false);
      setIsVerified(false);
      setVerificationError(null);
    }
  }, []);

  const fetchAdminStatus = useCallback(async (userId: string) => {
    console.log('[fetchAdminStatus] Starting, userId:', userId);
    try {
      console.log('[fetchAdminStatus] Making API call...');
      const queryPromise = api
        .from('profiles')
        .select('isAdmin')
        .eq('id', userId)
        .maybeSingle();
      
      console.log('[fetchAdminStatus] Query promise created, awaiting...');
      
      // Use .then() directly to test if promise resolves
      const result = await new Promise<{ data: any; error: Error | null }>((resolve, reject) => {
        queryPromise.then((res: any) => {
          console.log('[fetchAdminStatus] .then() callback executed with result:', res);
          resolve(res);
        }).catch((err: any) => {
          console.error('[fetchAdminStatus] .then() callback caught error:', err);
          reject(err);
        });
      });
      
      console.log('[fetchAdminStatus] API result received:', result);
      console.log('[fetchAdminStatus] Result keys:', Object.keys(result || {}));
      console.log('[fetchAdminStatus] Result structure:', JSON.stringify(result, null, 2));
      
      const { data, error } = result;

      if (error) {
        console.error('[fetchAdminStatus] Error:', error);
        setIsAppAdmin(false);
        return;
      }

      if (data) {
        console.log('[fetchAdminStatus] Data received:', data);
        console.log('[fetchAdminStatus] Data type:', typeof data);
        console.log('[fetchAdminStatus] Data keys:', Object.keys(data || {}));
        console.log('[fetchAdminStatus] isAdmin value:', (data as any)?.isAdmin);
        // Handle both possible response structures: direct object or { data: object }
        const profile = data as any;
        const isAdmin = profile?.isAdmin ?? profile?.data?.isAdmin ?? false;
        console.log('[fetchAdminStatus] Extracted isAdmin:', isAdmin);
        console.log('[fetchAdminStatus] Setting isAppAdmin to:', isAdmin);
        setIsAppAdmin(isAdmin);
      } else {
        console.warn('[fetchAdminStatus] No profile data returned for user:', userId);
        console.warn('[fetchAdminStatus] Result was:', result);
        setIsAppAdmin(false);
      }
    } catch (error) {
      console.error('[fetchAdminStatus] Exception caught:', error);
      console.error('[fetchAdminStatus] Exception details:', error instanceof Error ? error.stack : error);
      setIsAppAdmin(false);
    }
  }, []);

  // Handle OAuth callback from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('refresh_token'))) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        // Set tokens in API client
        api.setAuth(accessToken, refreshToken);

        // Get user info
        api.auth.getSession().then(({ data, error }) => {
          if (data?.session) {
            const session = data.session;
            setSession(session);
            setUser(session.user);
            setLoading(false);

            // Check verification if needed (for Google OAuth)
            if (session.user) {
              const provider = session.user.app_metadata?.provider;
              if (provider === 'google') {
                // Check login style
                api.from('app_settings')
                  .select('loginStyle')
                  .eq('id', 'default')
                  .maybeSingle()
                  .then(({ data: settings }) => {
                    if (settings?.loginStyle === 'google_verified') {
                      verifyUserInDatabase(session.user.email).then((result) => {
                        if (!result.verified) {
                          setVerificationError(result.message || 'User does not exist in database');
                          setIsVerified(false);
                          signOut();
                        } else {
                          setIsVerified(true);
                        }
                      });
                    } else {
                      setIsVerified(true);
                    }
                  });
              } else {
                setIsVerified(true);
              }
              fetchAdminStatus(session.user.id);
            }

            // Clear hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          } else if (error) {
            console.error('Failed to get session:', error);
            setLoading(false);
          }
        });
      } else {
        // Check for OAuth errors
        const error = params.get('error');
        const errorDescription = params.get('error_description');
        if (error) {
          console.error('OAuth error:', error, errorDescription);
          setVerificationError(errorDescription || error);
          setLoading(false);
        }
      }
    }
  }, [verifyUserInDatabase, signOut, fetchAdminStatus]);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('[useAuth] Initializing session...');
        const { data, error } = await api.auth.getSession();
        console.log('[useAuth] Session data:', data, 'Error:', error);

        if (data?.session && !error) {
          setSession(data.session);
          setUser(data.session.user);
          
          if (data.session.user) {
            console.log('[useAuth] User found, fetching admin status for:', data.session.user.id);
            fetchAdminStatus(data.session.user.id);
          } else {
            console.warn('[useAuth] Session exists but no user in session');
          }
        } else {
          console.log('[useAuth] No session found');
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('[useAuth] Failed to initialize session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [fetchAdminStatus]);


  const signInWithGoogle = async () => {
    setVerificationError(null);
    
    try {
      await api.auth.signInWithOAuth('google');
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('OAuth sign-in failed') };
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { data, error } = await api.auth.signInWithPassword(email, password);
      
      if (error) {
        return { error: error instanceof Error ? error : new Error('Sign in failed') };
      }

      if (data) {
        // Fetch full user data including avatar
        const sessionResult = await api.auth.getSession();
        if (sessionResult.data?.session) {
          setSession(sessionResult.data.session);
          setUser(sessionResult.data.session.user);
        } else {
          // Fallback to basic user data if getSession fails
          setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
            user: data.user,
          });
          setUser(data.user);
        }
        setIsVerified(true);
        fetchAdminStatus(data.user.id);
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign in failed') };
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await api.auth.signUp(email, password, fullName);
      
      if (error) {
        return { error: error instanceof Error ? error : new Error('Sign up failed') };
      }

      if (data) {
        // Fetch full user data including avatar
        const sessionResult = await api.auth.getSession();
        if (sessionResult.data?.session) {
          setSession(sessionResult.data.session);
          setUser(sessionResult.data.session.user);
        } else {
          // Fallback to basic user data if getSession fails
          setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
            user: data.user,
          });
          setUser(data.user);
        }
        setIsVerified(true);
        fetchAdminStatus(data.user.id);
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign up failed') };
    }
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
