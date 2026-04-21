import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Loader } from '@mantine/core';
import { useAuthContext } from '../contexts/AuthContext.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import { api } from '../utils/api.js';
import { BrandedLoginCard } from '../components/auth/BrandedLoginCard.js';
import { RegisterModal } from '../components/auth/RegisterModal.js';
import {
  consumePostLoginRedirect,
  isSafeAppInternalPath,
  storePostLoginRedirect,
} from '../../shared/utils/postLoginRedirect.js';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, refreshUser } = useAuthContext();
  const { branding, appBranding, loginBrandingReady } = useAppBranding();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginOptionsLoading, setLoginOptionsLoading] = useState(true);
  const [emailPasswordAllowed, setEmailPasswordAllowed] = useState(true);
  const [googleLoginAllowed, setGoogleLoginAllowed] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const strippedNextFromUrlRef = useRef(false);

  /** Legacy `?next=` in address bar → sessionStorage, then strip (avoids exposing return path in URL). */
  useEffect(() => {
    if (strippedNextFromUrlRef.current) {
      return;
    }
    const next = searchParams.get('next');
    if (!next || next.length === 0) {
      return;
    }
    strippedNextFromUrlRef.current = true;
    let decoded = next;
    try {
      decoded = decodeURIComponent(next);
    } catch {
      /* use raw */
    }
    if (isSafeAppInternalPath(decoded)) {
      storePostLoginRedirect(decoded);
    }
    const p = new URLSearchParams(searchParams);
    p.delete('next');
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opts = await api.getLoginOptions();
        if (!cancelled) {
          setEmailPasswordAllowed(opts.emailPassword);
          setGoogleLoginAllowed(opts.googleLogin);
        }
      } catch {
        if (!cancelled) {
          setEmailPasswordAllowed(true);
          setGoogleLoginAllowed(false);
        }
      } finally {
        if (!cancelled) {
          setLoginOptionsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = searchParams.get('token');
    const oauth = searchParams.get('oauth');
    if (token && oauth === '1') {
      api.setToken(token);
      searchParams.delete('token');
      searchParams.delete('oauth');
      searchParams.delete('next');
      setSearchParams(searchParams, { replace: true });
      const stored = consumePostLoginRedirect();
      const target = stored ?? '/';
      void refreshUser().then(() => navigate(target, { replace: true }));
    }
  }, [searchParams, setSearchParams, navigate, refreshUser]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err?.startsWith('google_')) {
      const msg =
        err === 'google_no_email'
          ? 'Google did not provide an email for this account.'
          : err === 'google_mysql_denied'
            ? 'Your email is not authorized in the external database required for this application.'
            : err === 'google_email_conflict'
              ? 'This email is already linked to a different Google account. Use that Google account or sign in with email and password.'
              : 'Google sign-in failed. You may not be allowed to access this application.';
      setError(msg);
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const validated = loginSchema.parse(formData);
      await login(validated.email, validated.password);
      const target = consumePostLoginRedirect() ?? '/';
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0]?.message || 'Validation error');
      } else if (err instanceof Error) {
        setError(err.message || 'Login failed');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    /* `next` is already in sessionStorage from ProtectedRoute or migrated ?next=; server reads session only */
    window.location.href = '/api/v1/auth/google';
  };

  if (!loginBrandingReady || loginOptionsLoading) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader />
      </Box>
    );
  }

  return (
    <>
      <BrandedLoginCard
        variant="live"
        branding={branding}
        {...(appBranding.defaultUiFontFamily
          ? { defaultUiFontFamily: appBranding.defaultUiFontFamily }
          : {})}
        showLocalForm={emailPasswordAllowed}
        showGoogle={googleLoginAllowed}
        loginOptionsLoading={loginOptionsLoading}
        error={error}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={(e) => void handleSubmit(e)}
        submitLoading={loading}
        onGoogleClick={handleGoogleLogin}
        {...(emailPasswordAllowed ? { onSignUpClick: () => setRegisterModalOpen(true) } : {})}
      />
      <RegisterModal
        opened={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onSuccess={() => {
          const target = consumePostLoginRedirect() ?? '/';
          navigate(target, { replace: true });
        }}
      />
    </>
  );
}
