import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from '@/integrations/api/client';

// User type matching Supabase User structure for compatibility
interface User {
  id: string;
  email: string;
  app_metadata?: {
    provider?: string;
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
  }, [verifyUserInDatabase, signOut]);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const { data, error } = await api.auth.getSession();

        if (data?.session && !error) {
          setSession(data.session);
          setUser(data.session.user);
          
          if (data.session.user) {
            fetchAdminStatus(data.session.user.id);
          }
        } else {
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to initialize session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, []);

  const fetchAdminStatus = async (userId: string) => {
    const { data, error } = await api
      .from('profiles')
      .select('isAdmin')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setIsAppAdmin(data.isAdmin ?? false);
    }
  };

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
        setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
          user: data.user,
        });
        setUser(data.user);
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
        setSession({
          access_token: data.accessToken,
          refresh_token: data.refreshToken,
          user: data.user,
        });
        setUser(data.user);
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
