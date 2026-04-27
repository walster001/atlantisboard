import { useState, useEffect, useCallback, useRef } from 'react';
import { api, isPublicPath } from '../utils/api.js';
import { socketClient } from '../utils/socket.js';
import { db, type UserDB } from '../store/database.js';
import type { BoardThemeDefinition } from '../../shared/boardTheme.js';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  profilePicture?: string;
  /** Present when server includes it (login /me / register). */
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
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    authenticated: false,
  });
  const aliveRef = useRef(true);
  const loadGenRef = useRef(0);

  const loadUser = useCallback(async () => {
    const runGen = ++loadGenRef.current;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        if (aliveRef.current && loadGenRef.current === runGen) {
          setAuthState({ user: null, loading: false, authenticated: false });
        }
        return;
      }

      const response = await api.getCurrentUser();
      const user = (response as { user: User }).user;

      if (!user || !user.id) {
        throw new Error('Invalid user data received');
      }

      // Save to IndexedDB
      const userDB: UserDB = {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
        lastSyncAt: new Date(),
      };
      if (user.isAppAdmin === true) {
        userDB.isAppAdmin = true;
      }
      if (user.profilePicture) {
        userDB.profilePicture = user.profilePicture;
      }
      await db.users.put(userDB);

      // Connect socket with token
      socketClient.connect(token);

      if (aliveRef.current && loadGenRef.current === runGen) {
        setAuthState({ user, loading: false, authenticated: true });
      }
    } catch (error) {
      console.error('Error loading user:', error);
      // Clear token and user data
      localStorage.removeItem('token');
      await db.users.clear().catch(() => {
        // Ignore IndexedDB errors
      });
      socketClient.disconnect();
      if (aliveRef.current && loadGenRef.current === runGen) {
        setAuthState({ user: null, loading: false, authenticated: false });
      }
      if (!isPublicPath(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    loadUser();
    return () => {
      aliveRef.current = false;
      loadGenRef.current += 1;
    };
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await api.login(email, password);
    const user = (response as { user: User }).user;

    // Save to IndexedDB
    const userDB: UserDB = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      preferences: user.preferences,
      emailVerified: user.emailVerified,
      lastSyncAt: new Date(),
    };
    if (user.isAppAdmin === true) {
      userDB.isAppAdmin = true;
    }
    if (user.profilePicture) {
      userDB.profilePicture = user.profilePicture;
    }
    await db.users.put(userDB);

    // Connect socket
    const token = localStorage.getItem('token');
    if (token) {
      socketClient.connect(token);
    }

    setAuthState({ user, loading: false, authenticated: true });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
    socketClient.disconnect();
    await db.users.clear();
    setAuthState({ user: null, loading: false, authenticated: false });
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      username: string;
      password: string;
      displayName: string;
    }): Promise<void> => {
      await api.register(data);
      await loadUser();
    },
    [loadUser]
  );

  return {
    ...authState,
    login,
    logout,
    register,
    refreshUser: loadUser,
  };
}

