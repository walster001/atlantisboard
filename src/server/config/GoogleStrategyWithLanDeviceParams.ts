import type { Request } from 'express';
import {
  Strategy as BaseGoogleStrategy,
  type AuthenticateOptionsGoogle,
} from 'passport-google-oauth20';
import {
  buildGoogleOAuthCallbackUrlAtRequest,
  resolveGoogleOAuthRuntimeSettings,
} from '../../shared/utils/googleOAuthCallbackUrl.js';

type GoogleAuthOptions = AuthenticateOptionsGoogle & {
  readonly device_id?: string;
  readonly device_name?: string;
  readonly callbackURL?: string;
};

type GoogleStrategyWithCallback = BaseGoogleStrategy & {
  readonly _callbackURL?: string;
};

/**
 * Forwards `device_id` / `device_name` from `passport.authenticate('google', options)` into
 * Google's authorization URL (the stock strategy drops unknown keys).
 */
export class GoogleStrategyWithLanDeviceParams extends BaseGoogleStrategy {
  override authenticate(req: Request, options: GoogleAuthOptions): void {
    const runtime = resolveGoogleOAuthRuntimeSettings({
      FORCE_HTTPS: process.env.FORCE_HTTPS,
      OAUTH_REDIRECT_BASE: process.env.OAUTH_REDIRECT_BASE,
      APP_URL: process.env.APP_URL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
    });
    const strategy = this as GoogleStrategyWithCallback;
    const configuredCallback = options.callbackURL ?? strategy._callbackURL;
    const callbackURL = buildGoogleOAuthCallbackUrlAtRequest({
      configuredCallback,
      host: req.get('host'),
      protocol: req.protocol,
      forwardedProto: req.get('x-forwarded-proto') ?? undefined,
      forceHttps: runtime.forceHttps,
      publicBaseUrl: runtime.publicBaseUrl,
    });
    super.authenticate(req, {
      ...options,
      ...(callbackURL !== undefined ? { callbackURL } : {}),
      proxy: true,
    });
  }

  override authorizationParams(options: GoogleAuthOptions): Record<string, unknown> {
    const params = super.authorizationParams(options) as Record<string, unknown>;
    const id = options.device_id;
    const name = options.device_name;
    if (typeof id === 'string' && id.trim() !== '') {
      params.device_id = id.trim();
    }
    if (typeof name === 'string' && name.trim() !== '') {
      params.device_name = name.trim();
    }
    return params;
  }
}
