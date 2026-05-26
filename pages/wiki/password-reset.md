---
layout: wiki
title: "Password Reset & Email Verification"
description: "How to reset a forgotten password and verify your email address after registration."
parent: "Accounts & Authentication"
nav_order: 24
permalink: /wiki/password-reset/
---

# Password Reset & Email Verification

This page covers two related workflows: recovering access to your account when you forget your password, and verifying your email address after registration.

Both features require that the administrator has configured a working SMTP server in [Email (SMTP) Configuration](/wiki/admin-email/).

---

## Forgot Password Flow

If you forget your password, Atlantisboard provides a self-service reset workflow.

### Step-by-Step

1. **Click "Forgot password?"** — On the login page, click the "Forgot password?" link below the sign-in form.

   ![Forgot password modal](/assets/wiki/auth-forgot-password.png)

2. **Enter your email address** — Type the email address associated with your account and submit the form.

3. **Check your inbox** — Atlantisboard sends a password reset email containing a unique, time-limited reset link. Check your spam or junk folder if the email does not appear in your inbox within a few minutes.

4. **Set a new password** — Click the reset link in the email to open the password reset page. Enter your new password and confirm it.

   ![Reset password page](/assets/wiki/auth-reset-password.png)

   Your new password must meet the same strength requirements as registration:
   - Minimum **12 characters**
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character

   The 5-segment strength meter provides real-time feedback as you type.

5. **Auto-redirect** — After successfully resetting your password, you are automatically redirected to the login page after **2 seconds**. Sign in with your new password.

### Important Notes

- The reset link is **single-use** — once clicked, it cannot be used again.
- If the link expires before you use it, return to the login page and request a new one.
- For security, the "Forgot password" form does not reveal whether an email address is registered. You will see a confirmation message regardless of whether the address exists in the system.
- Password reset emails require a configured SMTP server. If no SMTP is configured, the reset feature is unavailable — contact your administrator.

---

## Email Verification

When mandatory email verification is enabled by the administrator (in [Login Options](/wiki/admin-login-options/)), new users must verify their email address before they can sign in.

### Verification Flow

1. **Register an account** — Complete the registration form as described in [Registration & Sign-In](/wiki/accounts-auth/).
2. **Check your email** — A verification email is sent automatically to the address you registered with. The email contains a verification link.
3. **Click the verification link** — This confirms your email address and activates your account.
4. **Sign in** — Once verified, return to the login page and sign in normally.

### Resend Verification

If the verification email does not arrive or the token expires:

- A **Resend verification** option is available on the post-registration screen.
- You can also request a new verification email from the login page if your account is not yet verified.
- Verification tokens expire after **10 minutes**, so resend if needed.

### Verification Status

- Your verification status is visible to administrators in the [User Management](/wiki/admin-users/) panel under the **Email Verified** column.
- Unverified accounts cannot sign in when mandatory verification is enabled.
- If mandatory verification is later disabled by the administrator, unverified accounts can sign in without completing verification.

---

## Troubleshooting

### "I didn't receive the email"

- Check your **spam/junk** folder.
- Ensure the administrator has configured a working SMTP server (see [Email Configuration](/wiki/admin-email/)).
- Verify that the **From Address** configured in SMTP settings is not blocked by your email provider.
- Ask your administrator to send a test email from the SMTP panel to confirm email delivery is working.

### "The link has expired"

- Password reset and verification tokens are time-limited for security.
- Request a new link by repeating the forgot-password or resend-verification flow.

### "Account is locked"

- If your account is locked due to failed login attempts, a password reset alone will not unlock it. Contact your administrator to unlock your account from the [User Management](/wiki/admin-users/) panel, then reset your password if needed.

---

## Related Pages

- [Registration & Sign-In](/wiki/accounts-auth/) — account registration and the sign-in process.
- [Email (SMTP) Configuration](/wiki/admin-email/) — SMTP setup required for password reset and verification emails.
- [Login Options](/wiki/admin-login-options/) — enable or disable mandatory email verification.
- [User Management](/wiki/admin-users/) — administrators can view verification status and unlock accounts.
- [Password & Security](/wiki/user-security/) — change your password from within the app.
