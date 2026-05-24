export type RegistrationMode = 'open' | 'invite-only' | 'disabled';

export interface PublicLoginOptions {
  readonly defaultAuthMethod: 'email' | 'google' | 'google-external';
  readonly emailPassword: boolean;
  readonly googleLogin: boolean;
  readonly registrationMode: RegistrationMode;
  /** Whether new account creation is allowed for the active login method (bootstrap always open). */
  readonly registrationOpen: boolean;
  /**
   * When `GOOGLE_OAUTH_BROWSER_ORIGIN` is set, absolute URL to begin Google OAuth on that host
   * (Google Cloud does not allow private-IP redirect URIs; use a local-only hostname in `/etc/hosts`).
   */
  readonly googleOAuthStartUrl?: string;
}
