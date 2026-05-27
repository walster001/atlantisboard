import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Loader } from '@mantine/core';
import { useAuthContext } from '../contexts/AuthContext.js';
import { useAppBranding } from '../contexts/AppBrandingContext.js';
import { api } from '../utils/api.js';
import { usesHttpOnlyAuth } from '../config/env.js';
import { BrandedLoginCard } from '../components/auth/BrandedLoginCard.js';
import { RegisterModal } from '../components/auth/RegisterModal.js';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal.js';
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
  const { branding, loginBrandingReady } = useAppBranding();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginOptionsLoading, setLoginOptionsLoading] = useState(true);
  const [emailPasswordAllowed, setEmailPasswordAllowed] = useState(true);
  const [googleLoginAllowed, setGoogleLoginAllowed] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [googleOAuthStartUrl, setGoogleOAuthStartUrl] = useState<string | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const strippedNextFromUrlRef = useRef(false);
  const strippedForgotQueryRef = useRef(false);
  const oauthDevTokenRef = useRef<string | null>(null);
  const strippedOAuthTokenFromUrlRef = useRef(false);

  /** Dev OAuth: remove JWT from the address bar before paint (token kept in memory only). */
  useLayoutEffect(() => {
    if (usesHttpOnlyAuth() || strippedOAuthTokenFromUrlRef.current) {
      return;
    }
    const url = new URL(globalThis.location.href);
    const token = url.searchParams.get('token');
    if (!token) {
      return;
    }
    strippedOAuthTokenFromUrlRef.current = true;
    oauthDevTokenRef.current = token;
    url.searchParams.delete('token');
    const query = url.searchParams.toString();
    const path = `${url.pathname}${query.length > 0 ? `?${query}` : ''}${url.hash}`;
    globalThis.history.replaceState(globalThis.history.state, '', path);
  }, []);

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
          setRegistrationOpen(opts.registrationOpen !== false);
          setGoogleOAuthStartUrl(
            typeof opts.googleOAuthStartUrl === 'string' && opts.googleOAuthStartUrl.length > 0
              ? opts.googleOAuthStartUrl
              : null,
          );
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
    const oauth = searchParams.get('oauth');
    if (oauth !== '1') {
      return;
    }

    const isProduction = usesHttpOnlyAuth();
    const token = isProduction ? searchParams.get('token') : oauthDevTokenRef.current;

    if (isProduction && !token) {
      searchParams.delete('oauth');
      searchParams.delete('next');
      setSearchParams(searchParams, { replace: true });
      void api
        .oauthExchange()
        .then(() => refreshUser())
        .then(() => {
          const target = consumePostLoginRedirect() ?? '/';
          navigate(target, { replace: true });
        })
        .catch(() => {
          setError('Google sign-in could not be completed. Please try again.');
        });
      return;
    }

    if (token) {
      api.setToken(token);
      oauthDevTokenRef.current = null;
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
              : err === 'google_merge_unverified'
                ? 'A local account with this email exists but has not been verified. Please verify your email first, then try signing in with Google.'
                : err === 'google_registration_disabled'
                  ? 'New account registration is disabled on this server.'
                  : err === 'google_registration_invite_only'
                    ? 'New account registration is invite-only. Contact an administrator for access.'
                    : 'Google sign-in failed. You may not be allowed to access this application.';
      setError(msg);
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  /** Deep link `/login?forgot=1` (e.g. after `/forgot-password` redirect) opens the forgot-password modal once. */
  useEffect(() => {
    if (!loginBrandingReady || loginOptionsLoading || strippedForgotQueryRef.current) {
      return;
    }
    if (searchParams.get('forgot') !== '1') {
      return;
    }
    strippedForgotQueryRef.current = true;
    setForgotModalOpen(true);
    const p = new URLSearchParams(searchParams);
    p.delete('forgot');
    setSearchParams(p, { replace: true });
  }, [loginBrandingReady, loginOptionsLoading, searchParams, setSearchParams]);

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
      } else if (
        err != null &&
        typeof err === 'object' &&
        'response' in err
      ) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string; code?: string } } } };
        const apiMsg = axiosErr.response?.data?.error?.message;
        setError(apiMsg ?? 'Login failed. Please try again.');
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
    /* With GOOGLE_OAUTH_BROWSER_ORIGIN, server returns an absolute URL so redirect_uri uses a registrable host (not a private IP). */
    window.location.href = googleOAuthStartUrl ?? '/api/v1/auth/google';
  };

  if (!loginBrandingReady || loginOptionsLoading) {
    return (
      <Box className="kb-login-host min-h-screen flex items-center justify-center">
        <Loader />
      </Box>
    );
  }

  return (
    <>
      <BrandedLoginCard
        variant="live"
        branding={branding}
        showLocalForm={emailPasswordAllowed}
        showGoogle={googleLoginAllowed}
        loginOptionsLoading={loginOptionsLoading}
        error={error}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={(e) => void handleSubmit(e)}
        submitLoading={loading}
        onGoogleClick={handleGoogleLogin}
        {...(emailPasswordAllowed && registrationOpen
          ? {
              onSignUpClick: () => setRegisterModalOpen(true),
              onForgotPasswordClick: () => setForgotModalOpen(true),
            }
          : emailPasswordAllowed
            ? { onForgotPasswordClick: () => setForgotModalOpen(true) }
            : {})}
      />
      <ForgotPasswordModal opened={forgotModalOpen} onClose={() => setForgotModalOpen(false)} />
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
