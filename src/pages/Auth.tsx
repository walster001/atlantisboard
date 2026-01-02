import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

type LoginStyle = 'local_accounts' | 'google_only' | 'google_verified';

interface AppSettings {
  customLoginLogoEnabled: boolean;
  customLoginLogoUrl: string | null;
  customLoginLogoSize: string;
  customAppNameEnabled: boolean;
  customAppName: string | null;
  customAppNameSize: number;
  customAppNameColor: string;
  customAppNameFont: string;
  customTaglineEnabled: boolean;
  customTagline: string | null;
  customTaglineSize: number;
  customTaglineColor: string;
  customTaglineFont: string;
  customLoginBackgroundEnabled: boolean;
  customLoginBackgroundType: string;
  customLoginBackgroundColor: string;
  customLoginBackgroundImageUrl: string | null;
  customLoginBoxBackgroundColor: string;
  customGoogleButtonBackgroundColor: string;
  customGoogleButtonTextColor: string;
  loginStyle: LoginStyle;
}

interface CustomFont {
  id: string;
  name: string;
  fontUrl: string;
}

interface AuthPageData {
  settings: AppSettings | null;
  fonts: CustomFont[];
}

const logoSizeMap: Record<string, { className: string; width: number; height: number }> = {
  small: { className: 'w-[100px] h-[100px]', width: 100, height: 100 },
  medium: { className: 'w-[200px] h-[200px]', width: 200, height: 200 },
  large: { className: 'w-[300px] h-[300px]', width: 300, height: 300 },
};

export default function Auth() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, verificationError, clearVerificationError } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pageData, setPageData] = useState<AuthPageData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  
  // Local auth state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Show verification error as toast
  useEffect(() => {
    if (verificationError) {
      toast({
        title: 'Access Denied',
        description: verificationError,
        variant: 'destructive',
      });
      clearVerificationError();
    }
  }, [verificationError, clearVerificationError, toast]);

  // Single server-side call for all auth page data
  useEffect(() => {
    const fetchPageData = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';
        const response = await fetch(`${API_BASE_URL}/app-settings`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const result = data as unknown as AuthPageData;
        setPageData(result);
      } catch (error: any) {
        // Log all errors for debugging (this endpoint should be public)
        // But continue with defaults so the auth page still works
        console.error('Error fetching auth page data:', error);
        // Use defaults on error
        setPageData({ settings: null, fonts: [] });
      } finally {
        setDataLoading(false);
      }
    };
    fetchPageData();
  }, []);

  // Detect OAuth callback by checking for hash fragments
  const isOAuthCallback = useCallback(() => {
    const hash = window.location.hash;
    if (!hash) return false;
    
    // Check for OAuth callback indicators in hash
    // PKCE flow uses 'code' parameter, implicit flow uses 'access_token'
    // Supabase OAuth callbacks include: access_token, refresh_token, code, error, etc.
    const isCallback = hash.includes('access_token') || 
           hash.includes('refresh_token') || 
           hash.includes('code=') ||  // PKCE flow uses code parameter
           hash.includes('error=') ||
           hash.includes('error_description=');
    
    // Log for debugging
    if (isCallback) {
      console.log('[Auth] OAuth callback detected, hash:', hash.substring(0, 100) + '...');
    }
    
    return isCallback;
  }, []);

  // Handle OAuth callback if it lands on /auth page
  useEffect(() => {
    if (isOAuthCallback()) {
      console.log('[Auth] OAuth callback detected on /auth page, waiting for session...');
      // OAuth callback detected - wait for session to be established
      // The auth state change handler will update the user state
      // Give it time to process (up to 3 seconds)
      let checkInterval: NodeJS.Timeout | null = null;
      let timeout: NodeJS.Timeout | null = null;

      checkInterval = setInterval(() => {
        // Check if user is now authenticated
        if (user) {
          console.log('[Auth] OAuth callback successful, redirecting to homepage');
          if (checkInterval) clearInterval(checkInterval);
          if (timeout) clearTimeout(timeout);
          navigate('/');
        } else if (!loading) {
          // If loading is false and still no user, session establishment failed
          console.warn('[Auth] OAuth callback processed but no user found');
          if (checkInterval) clearInterval(checkInterval);
          if (timeout) clearTimeout(timeout);
        }
      }, 100);

      // Timeout after 3 seconds if no session established
      timeout = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        if (!user) {
          console.warn('[Auth] OAuth callback timeout - no session established');
        }
      }, 3000);

      return () => {
        if (checkInterval) clearInterval(checkInterval);
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [isOAuthCallback, user, loading, navigate]);

  // Normal redirect when user is authenticated (not from OAuth callback)
  useEffect(() => {
    if (!loading && user && !isOAuthCallback()) {
      navigate('/');
    }
  }, [user, loading, navigate, isOAuthCallback]);

  // Load custom fonts
  useEffect(() => {
    const fonts = pageData?.fonts || [];
    if (fonts.length === 0) {
      setFontsLoaded(true);
      return;
    }

    fonts.forEach((font) => {
      const fontId = `custom-font-${font.id}`;
      if (!document.getElementById(fontId)) {
        const style = document.createElement('style');
        style.id = fontId;
        style.textContent = `
          @font-face {
            font-family: '${font.name}';
            src: url('${font.fontUrl}') format('woff2'), url('${font.fontUrl}') format('woff'), url('${font.fontUrl}') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }
    });
    // Allow fonts to load
    requestAnimationFrame(() => setFontsLoaded(true));
  }, [pageData?.fonts]);

  const getFontFamily = useCallback((fontKey: string | undefined) => {
    if (!fontKey || fontKey === 'default') return 'Inter, sans-serif';
    const font = pageData?.fonts?.find(f => f.id === fontKey);
    return font ? `'${font.name}', sans-serif` : 'Inter, sans-serif';
  }, [pageData?.fonts]);

  const handleGoogleSignIn = useCallback(async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [signInWithGoogle, toast]);

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    
    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Account exists',
              description: 'An account with this email already exists. Please sign in instead.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Sign up failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Account created',
            description: 'Please check your email to confirm your account.',
          });
        }
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          toast({
            title: 'Sign in failed',
            description: error.message,
            variant: 'destructive',
          });
        }
      }
    } finally {
      setAuthLoading(false);
    }
  }, [email, password, fullName, isSignUp, signInWithEmail, signUpWithEmail, toast]);

  // Get login style from settings
  const loginStyle = pageData?.settings?.loginStyle || 'google_only';
  const showLocalAuth = loginStyle === 'local_accounts';

  // Memoize computed values
  const brandingConfig = useMemo(() => {
    const settings = pageData?.settings;
    const showCustomLogo = settings?.customLoginLogoEnabled && settings?.customLoginLogoUrl;
    const showCustomAppName = settings?.customAppNameEnabled && settings?.customAppName;
    const showCustomTagline = settings?.customTaglineEnabled && settings?.customTagline;
    const useCustomBackground = settings?.customLoginBackgroundEnabled;
    
    return {
      showCustomLogo,
      logoUrl: settings?.customLoginLogoUrl,
      logoSize: logoSizeMap[settings?.customLoginLogoSize || 'medium'] || logoSizeMap.medium,
      logoSizeClass: (logoSizeMap[settings?.customLoginLogoSize || 'medium'] || logoSizeMap.medium).className,
      logoWidth: (logoSizeMap[settings?.customLoginLogoSize || 'medium'] || logoSizeMap.medium).width,
      logoHeight: (logoSizeMap[settings?.customLoginLogoSize || 'medium'] || logoSizeMap.medium).height,
      appName: showCustomAppName ? settings!.customAppName : 'KanBoard',
      tagline: showCustomTagline ? settings!.customTagline : 'Sign in to manage your boards',
      appNameSize: settings?.customAppNameSize || 24,
      appNameColor: settings?.customAppNameColor || '#000000',
      appNameFont: getFontFamily(settings?.customAppNameFont),
      taglineSize: settings?.customTaglineSize || 14,
      taglineColor: settings?.customTaglineColor || '#6b7280',
      taglineFont: getFontFamily(settings?.customTaglineFont),
      // Background settings
      useCustomBackground,
      backgroundType: settings?.customLoginBackgroundType || 'color',
      backgroundColor: settings?.customLoginBackgroundColor || '#f3f4f6',
      backgroundImageUrl: settings?.customLoginBackgroundImageUrl,
      // Box and button settings
      boxBackgroundColor: settings?.customLoginBoxBackgroundColor || '#ffffff',
      googleButtonBackgroundColor: settings?.customGoogleButtonBackgroundColor || '#ffffff',
      googleButtonTextColor: settings?.customGoogleButtonTextColor || '#000000',
    };
  }, [pageData?.settings, getFontFamily]);

  // Compute background styles
  const backgroundStyles = useMemo(() => {
    if (!brandingConfig.useCustomBackground) {
      return {};
    }
    
    if (brandingConfig.backgroundType === 'image' && brandingConfig.backgroundImageUrl) {
      return {
        backgroundImage: `url(${brandingConfig.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    
    return {
      backgroundColor: brandingConfig.backgroundColor,
    };
  }, [brandingConfig]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main 
      className={`min-h-screen flex items-center justify-center p-4 ${
        !brandingConfig.useCustomBackground ? 'bg-gradient-to-br from-kanban-bg via-background to-kanban-bg' : ''
      }`}
      style={backgroundStyles}
    >
      <Card 
        className="w-full max-w-lg border-0 shadow-lg"
        style={{ backgroundColor: brandingConfig.boxBackgroundColor }}
      >
        <CardHeader className="text-center space-y-4">
          {brandingConfig.showCustomLogo && (
            <div className="flex justify-center">
              <img
                src={brandingConfig.logoUrl!}
                alt="Logo"
                width={brandingConfig.logoWidth}
                height={brandingConfig.logoHeight}
                fetchPriority="high"
                loading="eager"
                className={`${brandingConfig.logoSizeClass} object-contain`}
              />
            </div>
          )}
          <div className="space-y-2">
            <h1 
              className="font-bold text-center" 
              style={{ 
                fontSize: `${brandingConfig.appNameSize}px`, 
                color: brandingConfig.appNameColor,
                fontFamily: brandingConfig.appNameFont,
              }}
            >
              {brandingConfig.appName}
            </h1>
            <p 
              className="text-center max-w-md mx-auto leading-relaxed" 
              style={{ 
                fontSize: `${brandingConfig.taglineSize}px`, 
                color: brandingConfig.taglineColor,
                fontFamily: brandingConfig.taglineFont,
              }}
            >
              {brandingConfig.tagline}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Local Auth Form - only shown when loginStyle is 'local_accounts' */}
          {showLocalAuth && (
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12" 
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Button>
              </form>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground" style={{ backgroundColor: brandingConfig.boxBackgroundColor }}>
                    Or continue with
                  </span>
                </div>
              </div>
            </>
          )}
          
          {/* Google Sign In Button - always shown */}
          <Button
            variant="outline"
            className="w-full h-12 text-base border"
            style={{
              backgroundColor: brandingConfig.googleButtonBackgroundColor,
              color: brandingConfig.googleButtonTextColor,
            }}
            onClick={handleGoogleSignIn}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}