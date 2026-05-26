export interface SmtpProviderPreset {
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
}

export const SMTP_PROVIDER_PRESETS = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
  },
  mailgun: {
    label: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 465,
    secure: true,
  },
  postmark: {
    label: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 465,
    secure: true,
  },
  ses: {
    label: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 465,
    secure: true,
  },
  sendgrid: {
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 465,
    secure: true,
  },
  brevo: {
    label: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 465,
    secure: true,
  },
} as const satisfies Record<string, SmtpProviderPreset>;

export type SmtpProviderKey = keyof typeof SMTP_PROVIDER_PRESETS;

export const SMTP_PROVIDER_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  ...Object.entries(SMTP_PROVIDER_PRESETS).map(([key, preset]) => ({
    value: key,
    label: preset.label,
  })),
] as const;
