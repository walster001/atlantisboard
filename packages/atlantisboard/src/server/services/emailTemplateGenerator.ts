import type { IEmailBranding } from '../models/AdminConfig.js';

const DEFAULT_BG = '#f2efe5';
const DEFAULT_TEXT = '#38322d';

/**
 * Generates a complete handlebars layout HTML string from email branding
 * settings. The output is stored in AdminConfig and written to a cache
 * file at send time so nodemailer-express-handlebars can reference it as
 * `defaultLayout: 'custom'`.
 *
 * Colors are baked in as literals so the layout works without relying on
 * context variables. Handlebars expressions (`{{subject}}`, `{{appName}}`,
 * `{{logoCid}}`, `{{{body}}}`, `{{footerText}}`) are preserved verbatim.
 */
export function generateEmailLayout(branding: IEmailBranding): string {
  const bg = branding.backgroundColor ?? DEFAULT_BG;
  const text = branding.textColor ?? DEFAULT_TEXT;
  const footer = branding.footerText?.trim() || '';

  const footerBlock = footer
    ? `{{{footerText}}}`
    : `{{#if footerText}}{{{footerText}}}{{else}}This email was sent by {{appName}}.{{/if}}`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>{{subject}}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${bg};border-radius:12px;overflow:hidden;">

          <!-- Logo + App name (stacked, centered) -->
          <tr>
            <td align="center" style="padding:28px 40px 0;">
              {{#if logoCid}}
              <img src="{{logoCid}}" alt="" width="100" height="100" style="display:block;margin:0 auto 8px;width:100px;height:100px;object-fit:contain;border:0;" />
              {{/if}}
              <span style="font-size:40px;font-weight:600;color:${text};letter-spacing:0.3px;">{{appName}}</span>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="padding:24px 40px 32px;">
              {{{body}}}
            </td>
          </tr>

          <!-- Footer text -->
          <tr>
            <td align="center" style="padding:0 40px 28px;">
              <p style="margin:0;font-size:12px;color:${text};opacity:0.5;line-height:1.5;">
                ${footerBlock}
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
