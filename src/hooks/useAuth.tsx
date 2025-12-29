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

  // Handle auth state changes with verification
  const handleAuthStateChange = useCallback(async (event: string, newSession: Session | null) => {
    console.log('Auth state change:', event, newSession?.user?.email);
    
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
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleAuthStateChange(event, session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        fetchAdminStatus(session.user.id);
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
