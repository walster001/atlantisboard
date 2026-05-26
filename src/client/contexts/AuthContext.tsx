import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import type { BoardThemeDefinition } from '../../shared/boardTheme.js';

interface AuthContextType {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    profilePicture?: string;
    isAppAdmin?: boolean;
    preferences: {
      theme: 'light' | 'dark' | 'auto';
      notifications: boolean;
      language: string;
      notificationPreferences: Record<string, unknown>;
      homeWorkspaceOrder?: string[];
      customBoardThemes?: BoardThemeDefinition[];
    };
    emailVerified: boolean;
  } | null;
  loading: boolean;
  authenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    displayName: string;
  }) => Promise<unknown>;
  refreshUser: () => Promise<void>;
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

