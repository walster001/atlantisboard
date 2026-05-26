import { resolve } from 'path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';
import hbs from 'nodemailer-express-handlebars';
import { AdminConfig } from '../models/AdminConfig.js';
import { getBrandingObjectStream, type BrandingUploadKind } from './brandingService.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

const EMAILS_DIR = resolve(process.cwd(), 'src', 'server', 'emails');
const LOGO_CID = 'brand-logo';

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

/**
 * Resolves SMTP config from the DB admin settings, falling back to
 * environment variables for backward compatibility.
 */
async function resolveSmtpConfig(): Promise<SmtpTransportConfig | null> {
  const config = await AdminConfig.findOne();
  const smtp = config?.smtp;

  if (smtp?.enabled && smtp.host && smtp.username && smtp.password) {
    let decryptedPassword: string;
    try {
      decryptedPassword = await decrypt(smtp.password);
    } catch {
      logger.error('SMTP password decryption failed — re-save the password in Admin → Email settings');
      return null;
    }
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.username,
        pass: decryptedPassword,
      },
      fromAddress: smtp.fromAddress ?? 'noreply@example.com',
      fromName: smtp.fromName ?? 'Atlantisboard',
    };
  }

  const envHost = process.env.SMTP_HOST;
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;

  if (envHost && envUser && envPass) {
    return {
      host: envHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: envUser,
        pass: envPass,
      },
      fromAddress: process.env.SMTP_FROM_ADDRESS ?? 'noreply@example.com',
      fromName: process.env.SMTP_FROM_NAME ?? 'Atlantisboard',
    };
  }

  return null;
}

function createTransport(cfg: SmtpTransportConfig): Transporter<SMTPTransport.SentMessageInfo> {
  const opts: SMTPTransport.Options & { family?: number } = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    family: 4,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    },
  };

  const transport = nodemailer.createTransport(opts);

  transport.use(
    'compile',
    hbs({
      viewEngine: {
        extname: '.handlebars',
        layoutsDir: resolve(EMAILS_DIR, 'layouts'),
        defaultLayout: 'main',
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
  const cfg = await resolveSmtpConfig();
  if (!cfg) return null;

  return createTransport(cfg);
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
 * Reads the homepage navbar icon from MinIO and returns a nodemailer CID
 * attachment. Respects the "use login favicon" toggle — when enabled, the
 * login screen favicon is used instead of the dedicated navbar icon.
 */
async function resolveLogoAttachment(): Promise<Mail.Attachment | null> {
  try {
    const config = await AdminConfig.findOne().lean();
    const app = config?.appScreenBranding;
    const login = config?.loginScreenBranding;

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
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    logger.warn('Cannot send email: SMTP is not configured');
    return false;
  }

  const transport = createTransport(cfg);
  const logoAttachment = await resolveLogoAttachment();

  const attachments: Mail.Attachment[] = [];
  if (logoAttachment) attachments.push(logoAttachment);

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
      ...mail.context,
    },
    attachments,
  } as Record<string, unknown>);

  return true;
}

/**
 * Sends a test email to verify SMTP configuration.
 */
export async function sendTestEmail(recipientEmail: string): Promise<{ ok: boolean; message: string }> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    return { ok: false, message: 'SMTP is not configured or not enabled' };
  }

  const transport = createTransport(cfg);

  try {
    const logoAttachment = await resolveLogoAttachment();
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
        expiresIn: '1 hour',
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
    const verifyLink = `${baseUrl}/api/v1/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;

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
