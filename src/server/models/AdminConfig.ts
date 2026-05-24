import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type DefaultAuthMethod = 'email' | 'google' | 'google-external';

export interface IAuthMethods {
  emailPassword: boolean;
  googleOAuth: boolean;
  googleOAuthExternalMySQL: boolean;
}

export interface IGoogleOAuth {
  clientId?: string;
  clientSecret?: string;
  /** Full callback URL; server uses process.env.GOOGLE_CALLBACK_URL when set, else this, else default path. */
  callbackUrl?: string;
  enabled: boolean;
}

export interface IExternalMySQL {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  /** Parameterized SELECT; exactly one `?` for the Google user's email. */
  verificationQuery?: string;
  enabled: boolean;
}

export interface ILoginScreenBranding {
  appName?: string;
  logo?: string;
  tagline?: string;
  backgroundEnabled?: boolean;
  backgroundType?: 'solid' | 'gradient';
  backgroundColor?: string;
  backgroundGradientEnd?: string;
  loginBoxStyle?: 'box' | 'fullscreen';
  loginBoxBackgroundColor?: string;
  googleButtonBackgroundColor?: string;
  googleButtonTextColor?: string;
  /** Email/password/remember-me labels */
  loginInputTitleColor?: string;
  /** Forgot password, Sign up */
  loginLinkTitleColor?: string;
  loginSignInButtonTextColor?: string;
  loginSignInButtonColor?: string;
  logoEnabled?: boolean;
  logoSizePx?: number;
  appNameEnabled?: boolean;
  appNameFontFamily?: string;
  appNameFontSizePx?: number;
  appNameColor?: string;
  taglineEnabled?: boolean;
  taglineFontFamily?: string;
  taglineFontSizePx?: number;
  taglineColor?: string;
  faviconEnabled?: boolean;
  faviconUrl?: string;
  browserTabTitleEnabled?: boolean;
  browserTabTitle?: string;
}

export interface IAppScreenBranding {
  homepageNavbarIconUrl?: string;
  homepageNavbarUseLoginFavicon?: boolean;
  homepageNavbarIconSizePx?: number;
  homepageNavbarLabel?: string;
  homepageNavbarLabelInheritAppName?: boolean;
  homepageNavbarTextColor?: string;
  homepageNavbarColor?: string;
  homepageBackgroundMode?: 'color' | 'image';
  homepageBackgroundColor?: string;
  homepageBackgroundImageUrl?: string;
  boardNavbarIconUrl?: string;
  boardNavbarIconSameAsHomepage?: boolean;
  boardNavbarIconSizePx?: number;
  /** Built-in Poppins stack when unset; `system-ui, sans-serif` for system-only; else a catalog `fontFamilyValue`. */
  defaultUiFontFamily?: string;
}

export interface IRateLimiting {
  authEndpoints: {
    attempts: number;
    windowMinutes: number;
  };
  fileUploads: {
    attempts: number;
    windowMinutes: number;
  };
  generalAPI: {
    attempts: number;
    windowMinutes: number;
  };
}

export interface IVapidKeys {
  publicKey?: string;
  privateKey?: string;
}

export interface IBackupSettings {
  /** How long full backups are kept (by folder timestamp). */
  retentionDays: number;
  /** Default directory where local backup archives are written. */
  location?: string;
  /** Automatic full-backup interval in days (1..3650). */
  scheduleFrequencyDays?: number;
  /** Whether scheduled backups are enabled. */
  scheduleEnabled?: boolean;
  /** Timestamp of the last successful scheduled backup run. */
  lastScheduledRunAt?: Date;
}

export type RegistrationMode = 'open' | 'invite-only' | 'disabled';

export interface IAdminConfig extends Document {
  authMethods: IAuthMethods;
  googleOAuth: IGoogleOAuth;
  externalMySQL: IExternalMySQL;
  defaultAuthMethod: DefaultAuthMethod;
  registrationMode: RegistrationMode;
  loginScreenBranding: ILoginScreenBranding;
  appScreenBranding: IAppScreenBranding;
  rateLimiting: IRateLimiting;
  vapidKeys?: IVapidKeys;
  backupSettings?: IBackupSettings;
  updatedBy: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const AuthMethodsSchema = new Schema<IAuthMethods>(
  {
    emailPassword: { type: Boolean, default: true },
    googleOAuth: { type: Boolean, default: false },
    googleOAuthExternalMySQL: { type: Boolean, default: false },
  },
  { _id: false }
);

const GoogleOAuthSchema = new Schema<IGoogleOAuth>(
  {
    clientId: String,
    clientSecret: String,
    callbackUrl: String,
    enabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const ExternalMySQLSchema = new Schema<IExternalMySQL>(
  {
    host: String,
    port: Number,
    database: String,
    username: String,
    password: String,
    verificationQuery: {
      type: String,
      default: 'SELECT 1 FROM users WHERE email = ? LIMIT 1',
    },
    enabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const LoginScreenBrandingSchema = new Schema<ILoginScreenBranding>(
  {
    appName: String,
    logo: String,
    tagline: String,
    backgroundEnabled: { type: Boolean, default: false },
    backgroundType: { type: String, enum: ['solid', 'gradient'], default: 'solid' },
    backgroundColor: { type: String, default: '#1f68b5' },
    backgroundGradientEnd: { type: String, default: '#e7f5ff' },
    loginBoxStyle: {
      type: String,
      enum: ['box', 'fullscreen'],
      default: 'box',
    },
    loginBoxBackgroundColor: { type: String, default: '#ffffff' },
    googleButtonBackgroundColor: { type: String, default: '#ffffff' },
    googleButtonTextColor: { type: String, default: '#000000' },
    loginInputTitleColor: { type: String, default: '#495057' },
    loginLinkTitleColor: { type: String, default: '#228be6' },
    loginSignInButtonTextColor: { type: String, default: '#ffffff' },
    loginSignInButtonColor: { type: String, default: '#228be6' },
    logoEnabled: { type: Boolean, default: false },
    logoSizePx: { type: Number, default: 300 },
    appNameEnabled: { type: Boolean, default: false },
    appNameFontFamily: { type: String, default: 'system-ui, sans-serif' },
    appNameFontSizePx: { type: Number, default: 44 },
    appNameColor: { type: String, default: '#1f68b5' },
    taglineEnabled: { type: Boolean, default: false },
    taglineFontFamily: { type: String, default: 'system-ui, sans-serif' },
    taglineFontSizePx: { type: Number, default: 20 },
    taglineColor: { type: String, default: '#868e96' },
    faviconEnabled: { type: Boolean, default: false },
    faviconUrl: String,
    browserTabTitleEnabled: { type: Boolean, default: false },
    browserTabTitle: String,
  },
  { _id: false }
);

const AppScreenBrandingSchema = new Schema<IAppScreenBranding>(
  {
    homepageNavbarIconUrl: String,
    homepageNavbarUseLoginFavicon: { type: Boolean, default: true },
    homepageNavbarIconSizePx: { type: Number, default: 40 },
    homepageNavbarLabel: String,
    homepageNavbarLabelInheritAppName: { type: Boolean, default: false },
    homepageNavbarTextColor: String,
    homepageNavbarColor: String,
    homepageBackgroundMode: {
      type: String,
      enum: ['color', 'image'],
      default: 'color',
    },
    homepageBackgroundColor: String,
    homepageBackgroundImageUrl: String,
    boardNavbarIconUrl: String,
    boardNavbarIconSameAsHomepage: { type: Boolean, default: false },
    boardNavbarIconSizePx: { type: Number, default: 40 },
    defaultUiFontFamily: String,
  },
  { _id: false }
);

const RateLimitingSchema = new Schema<IRateLimiting>(
  {
    authEndpoints: {
      attempts: { type: Number, default: 900 },
      windowMinutes: { type: Number, default: 1 },
    },
    fileUploads: {
      attempts: { type: Number, default: 10 },
      windowMinutes: { type: Number, default: 1 },
    },
    generalAPI: {
      attempts: { type: Number, default: 1000 },
      windowMinutes: { type: Number, default: 1 },
    },
  },
  { _id: false }
);

const VapidKeysSchema = new Schema<IVapidKeys>(
  {
    publicKey: String,
    privateKey: String,
  },
  { _id: false }
);

const BackupSettingsSchema = new Schema<IBackupSettings>(
  {
    retentionDays: { type: Number, default: 14, min: 1, max: 3650 },
    location: { type: String, trim: true, maxlength: 1200 },
    scheduleFrequencyDays: { type: Number, min: 1, max: 3650 },
    scheduleEnabled: { type: Boolean, default: false },
    lastScheduledRunAt: { type: Date },
  },
  { _id: false }
);

const AdminConfigSchema = new Schema<IAdminConfig>(
  {
    authMethods: {
      type: AuthMethodsSchema,
      default: () => ({
        emailPassword: true,
        googleOAuth: false,
        googleOAuthExternalMySQL: false,
      }),
    },
    googleOAuth: {
      type: GoogleOAuthSchema,
      default: () => ({ enabled: false }),
    },
    externalMySQL: {
      type: ExternalMySQLSchema,
      default: () => ({ enabled: false }),
    },
    defaultAuthMethod: {
      type: String,
      enum: ['email', 'google', 'google-external'],
      default: 'email',
    },
    registrationMode: {
      type: String,
      enum: ['open', 'invite-only', 'disabled'],
      default: 'open',
    },
    loginScreenBranding: {
      type: LoginScreenBrandingSchema,
      default: () => ({}),
    },
    appScreenBranding: {
      type: AppScreenBrandingSchema,
      default: () => ({}),
    },
    rateLimiting: {
      type: RateLimitingSchema,
      default: () => ({
        authEndpoints: { attempts: 900, windowMinutes: 1 },
        fileUploads: { attempts: 10, windowMinutes: 1 },
        generalAPI: { attempts: 1000, windowMinutes: 1 },
      }),
    },
    vapidKeys: {
      type: VapidKeysSchema,
      default: undefined,
    },
    backupSettings: {
      type: BackupSettingsSchema,
      default: () => ({ retentionDays: 14, scheduleEnabled: false }),
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  }
);

// Ensure only one AdminConfig document exists
AdminConfigSchema.index({}, { unique: true });

export const AdminConfig: Model<IAdminConfig> = mongoose.model<IAdminConfig>(
  'AdminConfig',
  AdminConfigSchema
);

// Initialize default config if none exists
export async function initializeAdminConfig(): Promise<IAdminConfig> {
  const existingConfig = await AdminConfig.findOne();
  if (existingConfig) {
    return existingConfig;
  }

  // Create default config with system user (will need to be updated when admin is created)
  const defaultConfig = new AdminConfig({
    updatedBy: new mongoose.Types.ObjectId(), // Placeholder
  });
  return await defaultConfig.save();
}

