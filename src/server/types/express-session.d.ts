import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Post-OAuth redirect (e.g. `/invite/:token`). Set on GET /auth/google, cleared after callback. */
    oauthReturnTo?: string;
  }
}
