import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type InviteStatus = 'loading' | 'needs_auth' | 'redeeming' | 'success' | 'already_member' | 'error';
type ErrorType = 'invalid_token' | 'expired' | 'already_used' | 'deleted' | 'generic';
type LoginStyle = 'local_accounts' | 'google_only' | 'google_verified';

interface AppSettings {
  custom_login_logo_enabled: boolean;
  custom_login_logo_url: string | null;
  custom_login_logo_size: string;
  custom_app_name_enabled: boolean;
  custom_app_name: string | null;
  custom_app_name_size: number;
  custom_app_name_color: string;
  custom_app_name_font: string;
  custom_tagline_enabled: boolean;
  custom_tagline: string | null;
  custom_tagline_size: number;
  custom_tagline_color: string;
  custom_tagline_font: string;
  custom_login_background_enabled: boolean;
  custom_login_background_type: string;
  custom_login_background_color: string;
  custom_login_background_image_url: string | null;
  custom_login_box_background_color: string;
  custom_google_button_background_color: string;
  custom_google_button_text_color: string;
  login_style: LoginStyle;
}

interface CustomFont {
  id: string;
  name: string;
  font_url: string;
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

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signInWithEmail, signUpWithEmail, verificationError, clearVerificationError } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<InviteStatus>('loading');
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // Branding state
  const [pageData, setPageData] = useState<AuthPageData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  
  // Local auth state
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authFormLoading, setAuthFormLoading] = useState(false);

  // Store token in sessionStorage for post-auth redemption
  useEffect(() => {
    if (token) {
      sessionStorage.setItem('pendingInviteToken', token);
    }
  }, [token]);

  // Fetch branding settings
  useEffect(() => {
    const fetchPageData = async () => {
      try {
        const { data, error } = await supabase.rpc('get_auth_page_data');
        if (error) throw error;
        const result = data as unknown as AuthPageData;
        setPageData(result);
      } catch (error) {
        setPageData({ settings: null, fonts: [] });
      } finally {
        setDataLoading(false);
      }
    };
    fetchPageData();
  }, []);

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
            src: url('${font.font_url}') format('woff2'), url('${font.font_url}') format('woff'), url('${font.font_url}') format('truetype');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);
      }
    });
    requestAnimationFrame(() => setFontsLoaded(true));
  }, [pageData?.fonts]);

  const getFontFamily = useCallback((fontKey: string | undefined) => {
    if (!fontKey || fontKey === 'default') return 'Inter, sans-serif';
    const font = pageData?.fonts?.find(f => f.id === fontKey);
    return font ? `'${font.name}', sans-serif` : 'Inter, sans-serif';
  }, [pageData?.fonts]);

  // Redeem the invite token
  const redeemToken = useCallback(async () => {
    if (!token || !user) return;

    setStatus('redeeming');

    try {
      const { data, error } = await supabase.functions.invoke('redeem-invite-token', {
        body: { token },
      });

      // Clear stored token after attempt
      sessionStorage.removeItem('pendingInviteToken');

      if (error) {
        throw error;
      }

      if (!data.success) {
        setErrorType(data.error as ErrorType);
        setErrorMessage(data.message);
        setStatus('error');
        return;
      }

      setBoardId(data.boardId);
      
      if (data.alreadyMember) {
        setStatus('already_member');
        toast({
          title: 'Already a member',
          description: 'You are already a member of this board.',
        });
      } else {
        setStatus('success');
        toast({
          title: 'Success!',
          description: 'You have been added to the board as a viewer.',
        });
      }
    } catch (error: any) {
      console.error('Error redeeming invite:', error);
      sessionStorage.removeItem('pendingInviteToken');
      
      if (error.message) {
        try {
          const parsed = JSON.parse(error.message);
          setErrorType(parsed.error as ErrorType);
          setErrorMessage(parsed.message);
        } catch {
          setErrorType('generic');
          setErrorMessage(error.message || 'An unexpected error occurred');
        }
      } else {
        setErrorType('generic');
        setErrorMessage('An unexpected error occurred');
      }
      setStatus('error');
    }
  }, [token, user, toast]);

  // Determine what to show based on auth state
  useEffect(() => {
    if (authLoading || dataLoading) {
      setStatus('loading');
      return;
    }

    if (!user) {
      setStatus('needs_auth');
      return;
    }

    // User is authenticated, attempt to redeem
    redeemToken();
  }, [authLoading, dataLoading, user, redeemToken]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    clearVerificationError();
    
    // Redirect to homepage after OAuth - token is stored in sessionStorage for redemption there
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    
    if (error) {
      console.error('Google sign in error:', error);
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsSigningIn(false);
    }
  };

  // Handle verification errors from google_verified login style
  useEffect(() => {
    if (verificationError) {
      toast({
        title: 'Access Denied',
        description: verificationError,
        variant: 'destructive',
      });
      setIsSigningIn(false);
    }
  }, [verificationError, toast]);

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthFormLoading(true);
    
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
            description: 'You are now signed in. Processing your invitation...',
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
      setAuthFormLoading(false);
    }
  }, [email, password, fullName, isSignUp, signInWithEmail, signUpWithEmail, toast]);

  const goToBoard = () => {
    if (boardId) {
      navigate(`/board/${boardId}`);
    }
  };

  const goHome = () => {
    navigate('/');
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'expired':
        return <Clock className="h-16 w-16 text-amber-500" />;
      case 'already_used':
        return <XCircle className="h-16 w-16 text-destructive" />;
      case 'invalid_token':
      case 'deleted':
        return <XCircle className="h-16 w-16 text-destructive" />;
      default:
        return <AlertTriangle className="h-16 w-16 text-destructive" />;
    }
  };

  const getErrorTitle = () => {
    switch (errorType) {
      case 'expired':
        return 'Invite Expired';
      case 'already_used':
        return 'Link Already Used';
      case 'invalid_token':
      case 'deleted':
        return 'Invalid Invite Link';
      default:
        return 'Error';
    }
  };

  const getErrorDescription = () => {
    switch (errorType) {
      case 'expired':
        return 'This invite link has expired.';
      case 'already_used':
        return 'This link has already been used.';
      case 'invalid_token':
      case 'deleted':
        return 'This invite link is invalid or has been deleted.';
      default:
        return errorMessage || 'An unexpected error occurred.';
    }
  };

  // Get login style from settings
  const loginStyle = pageData?.settings?.login_style || 'google_only';
  const showLocalAuth = loginStyle === 'local_accounts';
  const showGoogleAuth = loginStyle !== 'local_accounts' || loginStyle === 'local_accounts'; // Google always shown

  // Memoize computed branding values
  const brandingConfig = useMemo(() => {
    const settings = pageData?.settings;
    const showCustomLogo = settings?.custom_login_logo_enabled && settings?.custom_login_logo_url;
    const showCustomAppName = settings?.custom_app_name_enabled && settings?.custom_app_name;
    const showCustomTagline = settings?.custom_tagline_enabled && settings?.custom_tagline;
    const useCustomBackground = settings?.custom_login_background_enabled;
    
    return {
      showCustomLogo,
      logoUrl: settings?.custom_login_logo_url,
      logoSize: logoSizeMap[settings?.custom_login_logo_size || 'medium'] || logoSizeMap.medium,
      logoSizeClass: (logoSizeMap[settings?.custom_login_logo_size || 'medium'] || logoSizeMap.medium).className,
      logoWidth: (logoSizeMap[settings?.custom_login_logo_size || 'medium'] || logoSizeMap.medium).width,
      logoHeight: (logoSizeMap[settings?.custom_login_logo_size || 'medium'] || logoSizeMap.medium).height,
      appName: showCustomAppName ? settings!.custom_app_name : 'KanBoard',
      tagline: showCustomTagline ? settings!.custom_tagline : 'Sign in to accept your invitation',
      appNameSize: settings?.custom_app_name_size || 24,
      appNameColor: settings?.custom_app_name_color || '#000000',
      appNameFont: getFontFamily(settings?.custom_app_name_font),
      taglineSize: settings?.custom_tagline_size || 14,
      taglineColor: settings?.custom_tagline_color || '#6b7280',
      taglineFont: getFontFamily(settings?.custom_tagline_font),
      useCustomBackground,
      backgroundType: settings?.custom_login_background_type || 'color',
      backgroundColor: settings?.custom_login_background_color || '#f3f4f6',
      backgroundImageUrl: settings?.custom_login_background_image_url,
      boxBackgroundColor: settings?.custom_login_box_background_color || '#ffffff',
      googleButtonBackgroundColor: settings?.custom_google_button_background_color || '#ffffff',
      googleButtonTextColor: settings?.custom_google_button_text_color || '#000000',
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

  if (authLoading || dataLoading) {
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
            {status === 'needs_auth' && (
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
            )}
            {status !== 'needs_auth' && (
              <p className="text-muted-foreground">
                {status === 'loading' && 'Checking invitation...'}
                {status === 'redeeming' && 'Processing invitation...'}
                {status === 'success' && 'Welcome to the board!'}
                {status === 'already_member' && "You're already on this board"}
                {status === 'error' && getErrorTitle()}
              </p>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Loading */}
          {(status === 'loading' || status === 'redeeming') && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {status === 'loading' ? 'Checking invitation...' : 'Adding you to the board...'}
              </p>
            </div>
          )}

          {/* Needs Authentication */}
          {status === 'needs_auth' && (
            <>
              {/* Local Auth Form - only shown when login_style is 'local_accounts' */}
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
                      disabled={authFormLoading}
                    >
                      {authFormLoading ? (
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
              
              {/* Google Sign In Button */}
              {showGoogleAuth && (
                <Button
                  variant="outline"
                  className="w-full h-12 text-base border"
                  style={{
                    backgroundColor: brandingConfig.googleButtonBackgroundColor,
                    color: brandingConfig.googleButtonTextColor,
                  }}
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-center text-muted-foreground">
                You've been successfully added to the board as a viewer.
              </p>
              <Button onClick={goToBoard} size="lg" className="w-full">
                Go to Board
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Already Member */}
          {status === 'already_member' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <CheckCircle className="h-16 w-16 text-blue-500" />
              <p className="text-center text-muted-foreground">
                You're already a member of this board.
              </p>
              <Button onClick={goToBoard} size="lg" className="w-full">
                Go to Board
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-6 py-4">
              {getErrorIcon()}
              <p className="text-center text-muted-foreground">
                {getErrorDescription()}
              </p>
              <Button onClick={goHome} variant="outline" size="lg" className="w-full">
                Go to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
