import {
  Strategy as BaseGoogleStrategy,
  type AuthenticateOptionsGoogle,
} from 'passport-google-oauth20';

type GoogleAuthOptions = AuthenticateOptionsGoogle & {
  readonly device_id?: string;
  readonly device_name?: string;
};

/**
 * Forwards `device_id` / `device_name` from `passport.authenticate('google', options)` into
 * Google's authorization URL (the stock strategy drops unknown keys).
 */
export class GoogleStrategyWithLanDeviceParams extends BaseGoogleStrategy {
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
