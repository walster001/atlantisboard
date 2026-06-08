import { memo, useMemo } from 'react';
import { Box, Select, Text } from '@mantine/core';

export type EmailTemplateType = 'test' | 'password-reset' | 'verify-email' | 'board-activity-roundup';

interface EmailBrandingPreviewPaneProps {
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly buttonColor: string;
  readonly buttonTextColor: string;
  readonly linkColor: string;
  readonly footerText: string;
  readonly logoUrl: string | null;
  readonly appName: string;
  readonly selectedTemplate: EmailTemplateType;
  readonly onTemplateChange: (template: EmailTemplateType) => void;
}

const TEMPLATE_OPTIONS: ReadonlyArray<{ readonly value: EmailTemplateType; readonly label: string }> = [
  { value: 'test', label: 'Test Email' },
  { value: 'password-reset', label: 'Password Reset' },
  { value: 'verify-email', label: 'Verify Email' },
  { value: 'board-activity-roundup', label: 'Board Activity Roundup' },
];

function buildTemplateBody(
  template: EmailTemplateType,
  textColor: string,
  buttonColor: string,
  buttonTextColor: string,
  linkColor: string,
  backgroundColor: string,
  appName: string,
): string {
  const infoBoxBg = adjustOpacity(backgroundColor, 0.85);
  const separatorColor = adjustOpacity(textColor, 0.2);

  switch (template) {
    case 'test':
      return `
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${textColor};">SMTP Configuration Test</h2>
        <p style="margin:0 0 24px;font-size:15px;color:${textColor};line-height:1.6;">
          If you&#39;re reading this, your SMTP email configuration is working correctly.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin:0 0 24px;background-color:${infoBoxBg};border-radius:8px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;color:${textColor};font-weight:500;">
                &#10003;&ensp;Connection successful
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:${textColor};">
                Emails sent from ${appName} will be delivered via <strong>smtp.example.com</strong> on port <strong>587</strong>.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:${textColor};opacity:0.5;line-height:1.5;">
          This is an automated test email sent from the ${appName} admin configuration panel. No action is required.
        </p>`;

    case 'password-reset':
      return `
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${textColor};">Password Reset</h2>
        <p style="margin:0 0 24px;font-size:15px;color:${textColor};line-height:1.6;">
          We received a request to reset the password for your account. Click the button below to choose a new password.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td align="center" style="background-color:${buttonColor};border-radius:6px;">
              <span style="display:inline-block;padding:14px 32px;font-size:13px;font-weight:600;color:${buttonTextColor};text-transform:uppercase;letter-spacing:1.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                Reset Password
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px;font-size:14px;color:${textColor};opacity:0.7;line-height:1.6;">
          This link will expire in 10 minutes. If you didn&#39;t request a password reset, you can safely ignore this email — your password will remain unchanged.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid ${separatorColor};padding-top:16px;">
          <tr>
            <td>
              <p style="margin:0;font-size:12px;color:${textColor};opacity:0.5;line-height:1.5;">
                If the button doesn&#39;t work, copy and paste this URL into your browser:<br/>
                <a href="#" style="color:${linkColor};word-break:break-all;">https://app.example.com/reset-password?token=abc123</a>
              </p>
            </td>
          </tr>
        </table>`;

    case 'board-activity-roundup':
      return `
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${textColor};">Weekly board activity</h2>
        <p style="margin:0 0 16px;font-size:15px;color:${textColor};line-height:1.6;">
          Here is the complete activity log for <strong>Product Roadmap</strong> for Jan 1, 2026 – Jan 7, 2026.
          Scroll within the log below to review every event from the week.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin:0 0 16px;background-color:${infoBoxBg};border-radius:8px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;color:${textColor};font-weight:500;">
                12 activity events
              </p>
            </td>
          </tr>
        </table>
        <div style="width:100%;max-width:100%;box-sizing:border-box;max-height:420px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;border:1px solid ${separatorColor};border-radius:8px;padding:2px 10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;margin:0;">
            <colgroup>
              <col style="width:188px;" />
              <col />
            </colgroup>
            <tr>
              <td style="vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid ${separatorColor};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">Wed, Jan 7, 2026, 4:30 PM</td>
              <td style="vertical-align:top;padding:10px 0;border-bottom:1px solid ${separatorColor};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>Alex Rivera</strong> — moved card &quot;Launch checklist&quot; to Done</td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid ${separatorColor};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">Tue, Jan 6, 2026, 11:15 AM</td>
              <td style="vertical-align:top;padding:10px 0;border-bottom:1px solid ${separatorColor};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>Jordan Lee</strong> — added comment on &quot;Q1 planning&quot;</td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid ${separatorColor};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">Mon, Jan 5, 2026, 9:02 AM</td>
              <td style="vertical-align:top;padding:10px 0;border-bottom:1px solid ${separatorColor};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>Sam Patel</strong> — created list &quot;Backlog&quot;</td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid ${separatorColor};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">Sun, Jan 4, 2026, 3:48 PM</td>
              <td style="vertical-align:top;padding:10px 0;border-bottom:1px solid ${separatorColor};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>Jordan Lee</strong> — archived card &quot;Old draft&quot;</td>
            </tr>
            <tr>
              <td style="vertical-align:top;padding:10px 14px 10px 0;border-bottom:1px solid ${separatorColor};font-size:12px;line-height:1.45;color:${textColor};opacity:0.7;white-space:nowrap;">Sat, Jan 3, 2026, 1:20 PM</td>
              <td style="vertical-align:top;padding:10px 0;border-bottom:1px solid ${separatorColor};font-size:13px;line-height:1.55;color:${textColor};word-break:break-word;"><strong>Alex Rivera</strong> — added label &quot;Priority&quot; to &quot;Launch checklist&quot;</td>
            </tr>
          </table>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td align="center" style="background-color:${buttonColor};border-radius:6px;">
              <span style="display:inline-block;padding:14px 32px;font-size:13px;font-weight:600;color:${buttonTextColor};text-transform:uppercase;letter-spacing:1.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                Open board
              </span>
            </td>
          </tr>
        </table>`;

    case 'verify-email':
      return `
        <h2 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${textColor};">Verify Your Email</h2>
        <p style="margin:0 0 24px;font-size:15px;color:${textColor};line-height:1.6;">
          Welcome to ${appName}! Please verify your email address to get started.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            <td align="center" style="background-color:${buttonColor};border-radius:6px;">
              <span style="display:inline-block;padding:14px 32px;font-size:13px;font-weight:600;color:${buttonTextColor};text-transform:uppercase;letter-spacing:1.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                Verify Email
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px;font-size:14px;color:${textColor};opacity:0.7;line-height:1.6;">
          This link will expire in 10 minutes. If you didn&#39;t create an account, you can safely ignore this email.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid ${separatorColor};padding-top:16px;">
          <tr>
            <td>
              <p style="margin:0;font-size:12px;color:${textColor};opacity:0.5;line-height:1.5;">
                If the button doesn&#39;t work, copy and paste this URL into your browser:<br/>
                <a href="#" style="color:${linkColor};word-break:break-all;">https://app.example.com/verify?token=xyz789</a>
              </p>
            </td>
          </tr>
        </table>`;
  }
}

function adjustOpacity(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const blended = (c: number) => Math.round(c * factor + 255 * (1 - factor));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(blended(r))}${toHex(blended(g))}${toHex(blended(b))}`;
}

function buildPreviewHtml(
  backgroundColor: string,
  textColor: string,
  buttonColor: string,
  buttonTextColor: string,
  linkColor: string,
  footerText: string,
  selectedTemplate: EmailTemplateType,
  logoUrl: string | null,
  appName: string,
): string {
  const body = buildTemplateBody(selectedTemplate, textColor, buttonColor, buttonTextColor, linkColor, backgroundColor, appName);
  const footerContent = footerText.trim() || `This email was sent by ${appName}.`;
  const containerWidthPx = selectedTemplate === 'board-activity-roundup' ? 920 : 600;
  const bodyPadding = selectedTemplate === 'board-activity-roundup' ? '20px 16px 28px' : '24px 40px 32px';
  const headerPadding = selectedTemplate === 'board-activity-roundup' ? '28px 20px 0' : '28px 40px 0';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin:0; padding:0; background-color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="${containerWidthPx}" cellpadding="0" cellspacing="0" style="max-width:${containerWidthPx}px;width:100%;background-color:${backgroundColor};border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:${headerPadding};">
              ${logoUrl ? `<img src="${logoUrl}" alt="" width="100" height="100" style="display:block;margin:0 auto 8px;width:100px;height:100px;object-fit:contain;border:0;" />` : ''}
              <span style="font-size:40px;font-weight:600;color:${textColor};letter-spacing:0.3px;">${appName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:${bodyPadding};">
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 28px;">
              <p style="margin:0;font-size:12px;color:${textColor};opacity:0.5;line-height:1.5;">
                ${footerContent}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const EmailBrandingPreviewPane = memo(function EmailBrandingPreviewPane({
  backgroundColor,
  textColor,
  buttonColor,
  buttonTextColor,
  linkColor,
  footerText,
  logoUrl,
  appName,
  selectedTemplate,
  onTemplateChange,
}: EmailBrandingPreviewPaneProps) {
  const html = useMemo(
    () => buildPreviewHtml(backgroundColor, textColor, buttonColor, buttonTextColor, linkColor, footerText, selectedTemplate, logoUrl, appName),
    [backgroundColor, textColor, buttonColor, buttonTextColor, linkColor, footerText, selectedTemplate, logoUrl, appName],
  );

  return (
    <Box>
      <Text fw={600} size="sm" mb="sm">
        Live preview
      </Text>
      <Select
        data={TEMPLATE_OPTIONS}
        value={selectedTemplate}
        onChange={(v) => {
          if (
            v === 'test' ||
            v === 'password-reset' ||
            v === 'verify-email' ||
            v === 'board-activity-roundup'
          ) {
            onTemplateChange(v);
          }
        }}
        allowDeselect={false}
        mb="sm"
        size="sm"
        w={200}
      />
      <Box
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          title="Email branding preview"
          style={{ width: '100%', border: 'none', height: 580, display: 'block' }}
        />
      </Box>
    </Box>
  );
});
