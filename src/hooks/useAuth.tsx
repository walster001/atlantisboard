import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from '@/integrations/api/client';

// User type matching Supabase User structure for compatibility
interface User {
  id: string;
  email: string;
  appMetadata?: {
    provider?: string;
  };
  userMetadata?: {
    avatarUrl?: string | null;
    fullName?: string | null;
    isAdmin?: boolean;
  };
}

interface Session {
  accessToken: string;
  refreshToken: string;
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
    try {
      // Use /auth/me endpoint which returns isAdmin directly
      const result = await api.request<{
        id: string;
        email: string;
        fullName: string | null;
        isAdmin: boolean;
        avatarUrl: string | null;
      }>('/auth/me');

      if (result.error) {
        console.error('[fetchAdminStatus] Error fetching admin status:', result.error);
        setIsAppAdmin(false);
        return;
      }

      if (result.data) {
        const isAdmin = result.data.isAdmin ?? false;
        setIsAppAdmin(isAdmin);
      } else {
        console.warn('[fetchAdminStatus] No user data returned');
        setIsAppAdmin(false);
      }
    } catch (error) {
      console.error('[fetchAdminStatus] Exception caught:', error);
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
              // Extract admin status from user metadata if available
              const isAdminFromMetadata = session.user.userMetadata?.isAdmin ?? false;
              if (isAdminFromMetadata) {
                setIsAppAdmin(true);
              } else {
                // Fallback to fetching admin status if not in metadata
                fetchAdminStatus(session.user.id);
              }

              const provider = session.user.appMetadata?.provider;
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
            // Extract admin status from user metadata if available
            const isAdminFromMetadata = data.session.user.userMetadata?.isAdmin ?? false;
            if (isAdminFromMetadata) {
              setIsAppAdmin(true);
            } else {
              // Fallback to fetching admin status if not in metadata
              console.log('[useAuth] User found, fetching admin status for:', data.session.user.id);
              fetchAdminStatus(data.session.user.id);
            }
          } else {
            console.warn('[useAuth] Session exists but no user in session');
          }
        } else {
          console.log('[useAuth] No session found');
          setSession(null);
          setUser(null);
          setIsAppAdmin(false);
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
        // Fetch full user data including avatar and admin status
        const sessionResult = await api.auth.getSession();
        if (sessionResult.data?.session) {
          setSession(sessionResult.data.session);
          setUser(sessionResult.data.session.user);
          // Extract admin status from user metadata
          const isAdminFromMetadata = sessionResult.data.session.user.userMetadata?.isAdmin ?? false;
          if (isAdminFromMetadata) {
            setIsAppAdmin(true);
          } else {
            // Fallback: use isAdmin from sign-in response if available
            setIsAppAdmin(data.user.isAdmin ?? false);
          }
        } else {
          // Fallback to basic user data if getSession fails
          setSession({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user,
          });
          setUser(data.user);
          // Use isAdmin from sign-in response
          setIsAppAdmin(data.user.isAdmin ?? false);
        }
        setIsVerified(true);
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
        // Fetch full user data including avatar and admin status
        const sessionResult = await api.auth.getSession();
        if (sessionResult.data?.session) {
          setSession(sessionResult.data.session);
          setUser(sessionResult.data.session.user);
          // Extract admin status from user metadata
          const isAdminFromMetadata = sessionResult.data.session.user.userMetadata?.isAdmin ?? false;
          if (isAdminFromMetadata) {
            setIsAppAdmin(true);
          } else {
            // Fallback: use isAdmin from sign-up response if available
            setIsAppAdmin(data.user.isAdmin ?? false);
          }
        } else {
          // Fallback to basic user data if getSession fails
          setSession({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user,
          });
          setUser(data.user);
          // Use isAdmin from sign-up response
          setIsAppAdmin(data.user.isAdmin ?? false);
        }
        setIsVerified(true);
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
