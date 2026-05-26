import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { dispatchLoginOptionsUpdated } from '../../../appBrandingEvents.js';
import { api } from '../../../utils/api.js';
import {
  DEFAULT_VERIFICATION_SQL,
  formatMysqlHostForDisplay,
  type AdminConfigShape,
  type DefaultAuthMethod,
  type GoogleDraft,
  type MysqlDraft,
} from '../LoginOptionsSection/helpers.js';
import {
  buildExternalMysqlPayload,
  buildLoginOptionsSavePayload,
  getMysqlTestPayload,
} from './loginOptionsStatePayload.js';

interface UseLoginOptionsStateResult {
  readonly config: AdminConfigShape | null;
  readonly setConfig: Dispatch<SetStateAction<AdminConfigShape | null>>;
  readonly mysqlDraft: MysqlDraft;
  readonly setMysqlDraft: Dispatch<SetStateAction<MysqlDraft>>;
  readonly googleDraft: GoogleDraft;
  readonly setGoogleDraft: Dispatch<SetStateAction<GoogleDraft>>;
  readonly mysqlReplaceMode: boolean;
  readonly setMysqlReplaceMode: Dispatch<SetStateAction<boolean>>;
  readonly googleReplaceMode: boolean;
  readonly setGoogleReplaceMode: Dispatch<SetStateAction<boolean>>;
  readonly dbFormOpen: boolean;
  readonly setDbFormOpen: Dispatch<SetStateAction<boolean>>;
  readonly googleFormOpen: boolean;
  readonly setGoogleFormOpen: Dispatch<SetStateAction<boolean>>;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly testing: boolean;
  readonly error: string | null;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly success: string | null;
  readonly mysqlTestError: string | null;
  readonly setMysqlTestError: Dispatch<SetStateAction<string | null>>;
  readonly mysqlTestSuccess: string | null;
  readonly setMysqlTestSuccess: Dispatch<SetStateAction<string | null>>;
  readonly extConfigured: boolean;
  readonly googleConfigured: boolean;
  readonly handleSave: () => Promise<void>;
  readonly handleSaveExternalDb: () => Promise<void>;
  readonly handleTestConnection: () => Promise<void>;
  readonly resetMysqlDraftFromConfig: (config: AdminConfigShape) => void;
}

export function useLoginOptionsState(): UseLoginOptionsStateResult {
  const [config, setConfig] = useState<AdminConfigShape | null>(null);
  const [mysqlDraft, setMysqlDraft] = useState<MysqlDraft>({
    host: '',
    database: '',
    username: '',
    password: '',
    verificationQuery: DEFAULT_VERIFICATION_SQL,
  });
  const [googleDraft, setGoogleDraft] = useState<GoogleDraft>({
    clientId: '',
    clientSecret: '',
    callbackUrl: '',
  });
  const [mysqlReplaceMode, setMysqlReplaceMode] = useState(false);
  const [googleReplaceMode, setGoogleReplaceMode] = useState(false);
  const [dbFormOpen, setDbFormOpen] = useState(true);
  const [googleFormOpen, setGoogleFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mysqlTestError, setMysqlTestError] = useState<string | null>(null);
  const [mysqlTestSuccess, setMysqlTestSuccess] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const prevAuthMethodRef = useRef<DefaultAuthMethod | null>(null);

  const showToast = useCallback((message: string) => {
    setSuccess(message);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setSuccess(null);
      timeoutRef.current = null;
    }, 3000);
  }, []);

  const resetMysqlDraftFromConfig = useCallback((nextConfig: AdminConfigShape) => {
    const ext = nextConfig.externalMySQL ?? { enabled: false };
    const configured = ext.credentialsConfigured === true;
    if (configured) {
      setMysqlDraft({
        host: '',
        database: '',
        username: '',
        password: '',
        verificationQuery: DEFAULT_VERIFICATION_SQL,
      });
      setMysqlReplaceMode(false);
      setDbFormOpen(false);
      return;
    }
    const maybeQuery = ext.verificationQuery;
    const verificationQuery =
      typeof maybeQuery === 'string' && maybeQuery.trim() !== ''
        ? maybeQuery.trim()
        : DEFAULT_VERIFICATION_SQL;
    setMysqlDraft({
      host: formatMysqlHostForDisplay(ext.host, ext.port),
      database: ext.database || '',
      username: ext.username || '',
      password: '',
      verificationQuery,
    });
    setMysqlReplaceMode(false);
    setDbFormOpen(true);
  }, []);

  const applyLoadedConfig = useCallback(
    (nextConfig: AdminConfigShape) => {
      const normalized: AdminConfigShape = {
        ...nextConfig,
        registrationMode: nextConfig.registrationMode ?? 'open',
        requireEmailVerification: nextConfig.requireEmailVerification !== false,
      };
      setConfig(normalized);
      resetMysqlDraftFromConfig(normalized);
      const go = normalized.googleOAuth ?? { enabled: false };
      const configured = !!(go.clientIdSet && go.clientSecretSet);
      setGoogleDraft({
        clientId: configured ? '' : (go.clientId || ''),
        clientSecret: '',
        callbackUrl: configured ? '' : (go.callbackUrl || ''),
      });
      setGoogleReplaceMode(false);
      setGoogleFormOpen(!configured);
      prevAuthMethodRef.current = normalized.defaultAuthMethod;
    },
    [resetMysqlDraftFromConfig],
  );

  useEffect(() => {
    isMountedRef.current = true;
    const loadConfig = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.getAdminConfig();
        const nextConfig = response.config as AdminConfigShape;
        if (!isMountedRef.current) {
          return;
        }
        applyLoadedConfig(nextConfig);
      } catch (err) {
        if (isMountedRef.current) {
          setError('Failed to load configuration');
          console.error(err);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void loadConfig();
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [applyLoadedConfig]);

  useEffect(() => {
    if (!config) {
      return;
    }
    const method = config.defaultAuthMethod;
    if (prevAuthMethodRef.current === method) {
      return;
    }
    prevAuthMethodRef.current = method;

    if (method === 'email-google' || method === 'google' || method === 'google-external') {
      const configured = !!(config.googleOAuth?.clientIdSet && config.googleOAuth?.clientSecretSet);
      setGoogleReplaceMode(false);
      setGoogleFormOpen(!configured);
    } else {
      setGoogleReplaceMode(false);
      setGoogleFormOpen(false);
    }

    setMysqlTestError(null);
    setMysqlTestSuccess(null);
    if (method === 'google-external') {
      resetMysqlDraftFromConfig(config);
    } else {
      setMysqlReplaceMode(false);
    }
  }, [config, resetMysqlDraftFromConfig]);

  const persistFromPayload = async (payload: Record<string, unknown>, message: string) => {
    try {
      setSaving(true);
      setError(null);
      const { config: saved } = await api.updateAdminConfig(payload);
      if (!isMountedRef.current) {
        return;
      }
      applyLoadedConfig(saved as AdminConfigShape);
      dispatchLoginOptionsUpdated();
      showToast(message);
    } catch (err) {
      if (isMountedRef.current) {
        setError('Failed to save configuration');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!config) {
      return;
    }
    const payload = buildLoginOptionsSavePayload({
      config,
      mysqlDraft,
      googleDraft,
      mysqlReplaceMode,
      googleReplaceMode,
    });
    await persistFromPayload(payload, 'Configuration saved successfully');
  };

  const handleSaveExternalDb = async (): Promise<void> => {
    if (!config) {
      return;
    }
    if (!mysqlDraft.database.trim() || !mysqlDraft.username.trim()) {
      setMysqlTestError('Database name and user are required');
      setMysqlTestSuccess(null);
      return;
    }
    if (mysqlDraft.host.trim() === '') {
      setMysqlTestError('Database host is required');
      setMysqlTestSuccess(null);
      return;
    }
    setMysqlTestError(null);
    setMysqlTestSuccess(null);
    const payload = buildExternalMysqlPayload({
      mysqlDraft,
      replaceConfiguredCredentials: config.externalMySQL.credentialsConfigured === true,
    });
    if (payload == null) {
      setMysqlTestError('Database host, name, and user are required');
      return;
    }
    await persistFromPayload(
      {
        externalMySQL: payload,
      },
      'Database configuration saved',
    );
  };

  const handleTestConnection = async (): Promise<void> => {
    if (!config) {
      return;
    }
    setMysqlTestError(null);
    setMysqlTestSuccess(null);
    try {
      setTesting(true);
      const testPayload = getMysqlTestPayload({ config, mysqlDraft, mysqlReplaceMode });
      if (testPayload.error != null) {
        setMysqlTestError(testPayload.error);
        return;
      }
      if (testPayload.payload == null) {
        setMysqlTestError('Connection test payload was incomplete');
        return;
      }
      const result = await api.testExternalMysqlConnection(testPayload.payload);
      if (result.ok) {
        setMysqlTestSuccess(result.message);
      } else {
        setMysqlTestError(result.message);
      }
    } catch (err) {
      setMysqlTestError('Connection test failed');
      console.error(err);
    } finally {
      setTesting(false);
    }
  };

  const extConfigured = config?.externalMySQL.credentialsConfigured === true;
  const googleConfigured = !!(config?.googleOAuth.clientIdSet && config?.googleOAuth.clientSecretSet);

  return {
    config,
    setConfig,
    mysqlDraft,
    setMysqlDraft,
    googleDraft,
    setGoogleDraft,
    mysqlReplaceMode,
    setMysqlReplaceMode,
    googleReplaceMode,
    setGoogleReplaceMode,
    dbFormOpen,
    setDbFormOpen,
    googleFormOpen,
    setGoogleFormOpen,
    loading,
    saving,
    testing,
    error,
    setError,
    success,
    mysqlTestError,
    setMysqlTestError,
    mysqlTestSuccess,
    setMysqlTestSuccess,
    extConfigured,
    googleConfigured,
    handleSave,
    handleSaveExternalDb,
    handleTestConnection,
    resetMysqlDraftFromConfig,
  };
}
