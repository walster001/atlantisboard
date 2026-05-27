import { resolve } from 'path';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';
import hbs from 'nodemailer-express-handlebars';
import { AdminConfig, type IEmailBranding, type IAppScreenBranding, type ILoginScreenBranding } from '../models/AdminConfig.js';
import { getBrandingObjectStream, type BrandingUploadKind } from './brandingService.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

const EMAILS_DIR = resolve(process.cwd(), 'src', 'server', 'emails');
const LAYOUTS_DIR = resolve(EMAILS_DIR, 'layouts');
const CUSTOM_LAYOUT_PATH = resolve(LAYOUTS_DIR, 'custom.handlebars');
const LOGO_CID = 'brand-logo';

let cachedCustomLayoutHash: string | null = null;

interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  fromAddress: string;
  fromName: string;
}

interface LeanAdminBranding {
  appScreenBranding?: IAppScreenBranding | undefined;
  loginScreenBranding?: ILoginScreenBranding | undefined;
}

interface ResolvedConfig {
  smtp: SmtpTransportConfig;
  emailBranding: IEmailBranding | undefined;
  branding: LeanAdminBranding;
}

/**
 * Single DB read that resolves SMTP config, email branding, and the raw
 * admin config (for logo resolution) in one query.
 */
async function resolveAll(): Promise<ResolvedConfig | null> {
  const config = await AdminConfig.findOne().lean();
  const smtp = config?.smtp;

  let smtpConfig: SmtpTransportConfig | null = null;

  if (smtp?.enabled && smtp.host && smtp.username && smtp.password) {
    let decryptedPassword: string;
    try {
      decryptedPassword = await decrypt(smtp.password);
    } catch {
      logger.error('SMTP password decryption failed — re-save the password in Admin → Email settings');
      return null;
    }
    smtpConfig = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.username, pass: decryptedPassword },
      fromAddress: smtp.fromAddress ?? 'noreply@example.com',
      fromName: smtp.fromName ?? 'Atlantisboard',
    };
  }

  if (!smtpConfig) {
    const envHost = process.env.SMTP_HOST;
    const envUser = process.env.SMTP_USER;
    const envPass = process.env.SMTP_PASS;

    if (envHost && envUser && envPass) {
      smtpConfig = {
        host: envHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: envUser, pass: envPass },
        fromAddress: process.env.SMTP_FROM_ADDRESS ?? 'noreply@example.com',
        fromName: process.env.SMTP_FROM_NAME ?? 'Atlantisboard',
      };
    }
  }

  if (!smtpConfig) return null;

  return {
    smtp: smtpConfig,
    emailBranding: config?.emailBranding,
    branding: {
      appScreenBranding: config?.appScreenBranding,
      loginScreenBranding: config?.loginScreenBranding,
    },
  };
}

/**
 * Writes the custom layout to disk only when the content has actually changed.
 */
function syncCustomLayout(branding: IEmailBranding | undefined): string {
  const html = branding?.customLayoutHtml;
  if (!html) return 'main';

  const hash = Buffer.from(html).toString('base64url').slice(0, 32);
  if (hash === cachedCustomLayoutHash) return 'custom';

  try {
    mkdirSync(LAYOUTS_DIR, { recursive: true });

    if (existsSync(CUSTOM_LAYOUT_PATH)) {
      const existing = readFileSync(CUSTOM_LAYOUT_PATH, 'utf-8');
      if (existing === html) {
        cachedCustomLayoutHash = hash;
        return 'custom';
      }
    }

    writeFileSync(CUSTOM_LAYOUT_PATH, html, 'utf-8');
    cachedCustomLayoutHash = hash;
    return 'custom';
  } catch (err) {
    logger.warn({ err }, 'Failed to write custom email layout cache file — falling back to default');
    return 'main';
  }
}

function blendToWhite(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const blend = (c: number) => Math.round(c * factor + 255 * (1 - factor));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}

function buildBrandingContext(branding: IEmailBranding | undefined): Record<string, string> {
  const bg = branding?.backgroundColor ?? '#f2efe5';
  const text = branding?.textColor ?? '#38322d';
  return {
    backgroundColor: bg,
    textColor: text,
    buttonColor: branding?.buttonColor ?? '#1a1a1a',
    buttonTextColor: branding?.buttonTextColor ?? '#ffffff',
    linkColor: branding?.linkColor ?? '#4da6d8',
    footerText: branding?.footerText ?? '',
    infoBoxBg: blendToWhite(bg, 0.85),
    separatorColor: blendToWhite(text, 0.2),
  };
}

/**
 * SMTP TLS verification is enabled by default. Set `SMTP_TLS_INSECURE=true` only in
 * non-production to connect to local/dev mail sinks with self-signed certificates.
 */
export function buildSmtpTlsOptions(): NonNullable<SMTPTransport.Options['tls']> {
  const insecureRequested = process.env.SMTP_TLS_INSECURE === 'true';
  const production = process.env.NODE_ENV === 'production';
  if (production && insecureRequested) {
    logger.warn('SMTP_TLS_INSECURE is ignored in production; TLS certificate verification stays enabled');
  }
  if (!production && insecureRequested) {
    return {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    };
  }
  return { rejectUnauthorized: true };
}

function createTransport(cfg: SmtpTransportConfig, layoutName: string = 'main'): Transporter<SMTPTransport.SentMessageInfo> {
  const opts: SMTPTransport.Options & { family?: number } = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    family: 4,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: buildSmtpTlsOptions(),
  };

  const transport = nodemailer.createTransport(opts);

  transport.use(
    'compile',
    hbs({
      viewEngine: {
        extname: '.handlebars',
        layoutsDir: LAYOUTS_DIR,
        defaultLayout: layoutName,
        helpers: {
          defaultVal(value: unknown, fallback: unknown): unknown {
            return (value != null && value !== '') ? value : fallback;
          },
        },
      },
      viewPath: EMAILS_DIR,
      extName: '.handlebars',
    }),
  );

  return transport;
}

/**
 * Creates a transient nodemailer transport from persisted SMTP settings.
 * Returns null if SMTP is not configured or enabled.
 */
export async function getSmtpTransport(): Promise<Transporter<SMTPTransport.SentMessageInfo> | null> {
  const resolved = await resolveAll();
  if (!resolved) return null;

  const layoutName = syncCustomLayout(resolved.emailBranding);
  return createTransport(resolved.smtp, layoutName);
}

function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
}

async function fetchBrandingAsBuffer(
  kind: BrandingUploadKind,
  assetPath: string,
): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const pattern = new RegExp(`/branding/${kind}/([a-f0-9-]{36}\\.\\w+)$`);
  const match = assetPath.match(pattern);
  if (!match) return null;
  const fileName = match[1];

  const result = await getBrandingObjectStream(kind, fileName);
  if (!result) return null;

  const chunks: Buffer[] = [];
  for await (const chunk of result.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array));
  }
  return { buffer: Buffer.concat(chunks), contentType: result.contentType, fileName };
}

/**
 * Reads the homepage navbar icon from MinIO using the already-loaded admin
 * config (avoids an extra DB query). Respects the "use login favicon" toggle.
 */
async function resolveLogoAttachment(
  brandingConfig: LeanAdminBranding,
): Promise<Mail.Attachment | null> {
  try {
    const app = brandingConfig.appScreenBranding;
    const login = brandingConfig.loginScreenBranding;

    let asset: { buffer: Buffer; contentType: string; fileName: string } | null = null;

    if (app?.homepageNavbarUseLoginFavicon !== false) {
      const faviconPath = login?.faviconUrl?.trim();
      if (faviconPath) {
        asset = await fetchBrandingAsBuffer('favicon', faviconPath);
      }
    }

    if (!asset) {
      const iconPath = app?.homepageNavbarIconUrl?.trim();
      if (iconPath) {
        asset = await fetchBrandingAsBuffer('home-nav-icon', iconPath);
      }
    }

    if (!asset) return null;

    return {
      filename: asset.fileName,
      content: asset.buffer,
      cid: LOGO_CID,
      contentType: asset.contentType,
      contentDisposition: 'inline' as const,
    };
  } catch (err) {
    logger.warn({ err }, 'Could not embed logo in email — sending without it');
    return null;
  }
}

interface TemplateMail {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

/**
 * Sends a templated email using the configured SMTP transport.
 * Returns true on success, false if SMTP is not configured.
 */
export async function sendEmail(mail: TemplateMail): Promise<boolean> {
  const resolved = await resolveAll();
  if (!resolved) {
    logger.warn('Cannot send email: SMTP is not configured');
    return false;
  }

  const { smtp: cfg, emailBranding: branding, branding: brandingConfig } = resolved;
  const layoutName = syncCustomLayout(branding);
  const transport = createTransport(cfg, layoutName);
  const logoAttachment = await resolveLogoAttachment(brandingConfig);

  const attachments: Mail.Attachment[] = [];
  if (logoAttachment) attachments.push(logoAttachment);

  try {
    await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
      to: mail.to,
      subject: mail.subject,
      template: mail.template,
      context: {
        subject: mail.subject,
        appUrl: getAppUrl(),
        appName: cfg.fromName,
        logoCid: logoAttachment ? `cid:${LOGO_CID}` : null,
        ...buildBrandingContext(branding),
        ...mail.context,
      },
      attachments,
    } as Record<string, unknown>);

    return true;
  } finally {
    transport.close();
  }
}

/**
 * Sends a test email to verify SMTP configuration.
 */
export async function sendTestEmail(recipientEmail: string): Promise<{ ok: boolean; message: string }> {
  const resolved = await resolveAll();
  if (!resolved) {
    return { ok: false, message: 'SMTP is not configured or not enabled' };
  }

  const { smtp: cfg, emailBranding: branding, branding: brandingConfig } = resolved;
  const layoutName = syncCustomLayout(branding);
  const transport = createTransport(cfg, layoutName);

  try {
    const logoAttachment = await resolveLogoAttachment(brandingConfig);
    const attachments: Mail.Attachment[] = [];
    if (logoAttachment) attachments.push(logoAttachment);

    const subject = `${cfg.fromName} — SMTP Test Email`;

    await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
      to: recipientEmail,
      subject,
      template: 'test',
      context: {
        subject,
        appUrl: getAppUrl(),
        appName: cfg.fromName,
        logoCid: logoAttachment ? `cid:${LOGO_CID}` : null,
        ...buildBrandingContext(branding),
        host: cfg.host,
        port: cfg.port,
      },
      attachments,
    } as Record<string, unknown>);
    return { ok: true, message: 'Test email sent successfully' };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const code = typeof err.code === 'string' ? err.code : undefined;
    const errMsg = error instanceof Error ? error.message : String(err.message ?? err.reason ?? code ?? 'Unknown error');

    logger.error({ code, message: errMsg, command: err.command }, 'Failed to send test email');

    if (code === 'ESOCKET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
      return {
        ok: false,
        message: `Connection to ${cfg.host}:${cfg.port} failed (${code}). Check the host/port and that outbound connections are not blocked.`,
      };
    }
    if (code === 'EAUTH') {
      return {
        ok: false,
        message: 'Authentication failed. Check your username and password (Gmail requires an App Password).',
      };
    }

    return { ok: false, message: `Failed to send test email: ${errMsg}` };
  } finally {
    transport.close();
  }
}

/**
 * Sends a password reset email with the reset link.
 * Fire-and-forget: logs errors but does not throw.
 */
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  try {
    const baseUrl = getAppUrl();
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const sent = await sendEmail({
      to,
      subject: 'Password Reset Request',
      template: 'password-reset',
      context: {
        resetLink,
        expiresIn: '10 minutes',
      },
    });

    if (!sent) {
      logger.warn({ to }, 'Password reset email not sent: SMTP not configured');
    }
  } catch (error) {
    logger.error({ error, to }, 'Failed to send password reset email');
  }
}

/**
 * Sends an email verification link after registration.
 * Fire-and-forget: logs errors but does not throw.
 */
export async function sendVerificationEmail(
  to: string,
  verificationToken: string,
  displayName?: string,
): Promise<void> {
  try {
    const baseUrl = getAppUrl();
    const verifyLink = `${baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    const sent = await sendEmail({
      to,
      subject: 'Verify Your Email',
      template: 'verify-email',
      context: {
        verifyLink,
        displayName,
        expiresIn: '10 minutes',
      },
    });

    if (!sent) {
      logger.warn({ to }, 'Verification email not sent: SMTP not configured');
    }
  } catch (error) {
    logger.error({ error, to }, 'Failed to send verification email');
  }
}
