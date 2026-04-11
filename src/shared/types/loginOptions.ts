export interface PublicLoginOptions {
  readonly defaultAuthMethod: 'email' | 'google' | 'google-external';
  readonly emailPassword: boolean;
  readonly googleLogin: boolean;
}
