import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Post-OAuth redirect (e.g. `/invite/:token`). Set on GET /auth/google, cleared after callback. */
    oauthReturnTo?: string;
    /** One-time OAuth user id pending JWT exchange (production HttpOnly cookie flow). */
    oauthPendingUserId?: string;
    /** Per-session secret for Bun.CSRF token generation (AUTH-001). */
    csrfSecret?: string;
  }
}
