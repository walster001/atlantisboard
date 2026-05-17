import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { socketClient } from '../utils/socket.js';

export interface HomePageCapabilities {
  readonly canCreateWorkspace: boolean;
  readonly canUseImport: boolean;
}

const DEFAULT_CAPABILITIES: HomePageCapabilities = {
  canCreateWorkspace: false,
  canUseImport: false,
};

/**
 * Global home-page affordances from per-user account capabilities (`workspaces.create`, `import.display`).
 */
export function useHomePageCapabilities(userId: string | undefined, isAppAdmin?: boolean): {
  readonly loaded: boolean;
  readonly capabilities: HomePageCapabilities;
} {
  const [capabilities, setCapabilities] = useState<HomePageCapabilities>(DEFAULT_CAPABILITIES);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (userId === undefined || userId === '') {
      setCapabilities(DEFAULT_CAPABILITIES);
      setLoaded(true);
      return;
    }
    if (isAppAdmin === true) {
      setCapabilities({ canCreateWorkspace: true, canUseImport: true });
      setLoaded(true);
      return;
    }
    try {
      const response = await api.getMyHomeCapabilities();
      setCapabilities({
        canCreateWorkspace: response.capabilities['workspaces.create'] === true,
        canUseImport: response.capabilities['import.display'] === true,
      });
    } catch {
      setCapabilities(DEFAULT_CAPABILITIES);
    } finally {
      setLoaded(true);
    }
  }, [userId, isAppAdmin]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const socket = socketClient.getSocket();
    if (socket == null || userId === undefined || userId === '') {
      return undefined;
    }
    const handler = (): void => {
      void refresh();
    };
    socket.on('permissions.updated', handler);
    return () => {
      socket.off('permissions.updated', handler);
    };
  }, [userId, refresh]);

  return { loaded, capabilities };
}
