import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type InviteStatus = 'loading' | 'needs_auth' | 'redeeming' | 'success' | 'already_member' | 'error';
type ErrorType = 'invalid_token' | 'expired' | 'already_used' | 'generic';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<InviteStatus>('loading');
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Store token in sessionStorage for post-auth redemption
  useEffect(() => {
    if (token) {
      sessionStorage.setItem('pendingInviteToken', token);
    }
  }, [token]);

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
      
      // Try to parse error response
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
    if (authLoading) {
      setStatus('loading');
      return;
    }

    if (!user) {
      setStatus('needs_auth');
      return;
    }

    // User is authenticated, attempt to redeem
    redeemToken();
  }, [authLoading, user, redeemToken]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    const { error } = await signInWithGoogle();
    if (error) {
      console.error('Google sign in error:', error);
      toast({
        title: 'Sign in failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsSigningIn(false);
    }
    // If successful, the page will redirect through OAuth flow
    // and return here, where redeemToken will be called
  };

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
      case 'already_used':
        return <Clock className="h-16 w-16 text-amber-500" />;
      case 'invalid_token':
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
        return 'Invite Already Used';
      case 'invalid_token':
        return 'Invalid Invite Link';
      default:
        return 'Error';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Board Invitation</CardTitle>
          <CardDescription>
            {status === 'needs_auth' && 'Sign in to accept this invitation'}
            {status === 'loading' && 'Checking invitation...'}
            {status === 'redeeming' && 'Processing invitation...'}
            {status === 'success' && 'Welcome to the board!'}
            {status === 'already_member' && 'You\'re already on this board'}
            {status === 'error' && getErrorTitle()}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
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
            <div className="flex flex-col items-center gap-6 py-4">
              <p className="text-center text-muted-foreground">
                You've been invited to join a board. Sign in with Google to accept the invitation.
              </p>
              <Button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                size="lg"
                className="w-full"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
            </div>
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
                {errorMessage}
              </p>
              <Button onClick={goHome} variant="outline" size="lg" className="w-full">
                Go to Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
