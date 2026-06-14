import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import type { ClientAuthUser } from '../utils/api/authApiMethods.js';

interface AuthContextType {
  user: ClientAuthUser | null;
  loading: boolean;
  authenticated: boolean;
  requiresPrivacyPolicyAcceptance: boolean;
  login: (email: string, password: string) => Promise<ClientAuthUser>;
  logout: () => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<unknown>;
  refreshUser: () => Promise<ClientAuthUser | null>;
  acceptPrivacyPolicy: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

