import { useState, useEffect, useCallback, useRef } from 'react';
import { api, isPublicPath } from '../utils/api.js';
import { usesHttpOnlyAuth } from '../config/env.js';
import { socketClient } from '../utils/socket.js';
import { resetLocalUserIdCache } from './socketHandlers/state.js';
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
    homeBoardOrderByWorkspace?: Record<string, string[]>;
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
    const useCookies = usesHttpOnlyAuth();
    try {
      const token = useCookies ? 'cookie' : localStorage.getItem('token');
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

      // Connect socket with token (production uses HttpOnly cookie on handshake)
      if (useCookies) {
        socketClient.connect('');
      } else {
        const socketToken = localStorage.getItem('token');
        if (socketToken) {
          socketClient.connect(socketToken);
        }
      }

      if (aliveRef.current && loadGenRef.current === runGen) {
        setAuthState({ user, loading: false, authenticated: true });
      }
    } catch (error) {
      console.error('Error loading user:', error);
      // Clear token and user data
      if (!useCookies) {
        localStorage.removeItem('token');
      }
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

    const useCookies = usesHttpOnlyAuth();
    if (useCookies) {
      socketClient.connect('');
    } else {
      const token = localStorage.getItem('token');
      if (token) {
        socketClient.connect(token);
      }
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
    resetLocalUserIdCache();
    await db.users.clear();
    setAuthState({ user: null, loading: false, authenticated: false });
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      username: string;
      password: string;
      displayName: string;
    }): Promise<unknown> => {
      const result = await api.register(data);
      if (
        result != null &&
        typeof result === 'object' &&
        'verificationRequired' in result &&
        (result as { verificationRequired?: boolean }).verificationRequired
      ) {
        return result;
      }
      await loadUser();
      return result;
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

