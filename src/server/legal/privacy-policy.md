# Privacy Notice — Atlantisboard

**Last updated:** 31 May 2026  
**Applies to:** Atlantisboard application (open-source software, MIT License)

---

## About this notice

This Privacy Notice is **bundled with Atlantisboard** and shown in the application so you understand **what data the software collects and processes** when you use it.

Atlantisboard is **self-hosted software**. It runs on a server chosen by your **organisation or instance administrator** (your “**Instance Administrator**”). We—the Atlantisboard open-source project—**do not operate your instance**, **do not receive your data**, and **do not control** how or where it is hosted. We provide this notice to describe the **application’s behaviour** wherever it is installed.

By selecting **“I agree”** (or equivalent) on first sign-in, you confirm that you have read this notice and understand how the application handles information as described below. If you do not agree, do not create an account or sign in.

> This notice is intended to meet transparency expectations under the **EU/EEA GDPR**, **UK GDPR**, **Swiss FADP**, and comparable international privacy laws. It is **not legal advice**. Your Instance Administrator remains responsible for hosting, configuration, and responding to privacy requests about data on their systems.

---

## 1. Who is responsible for your data?


| Role                                    | Who                                                                                                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instance Administrator**              | The person or organisation that installed and runs Atlantisboard for you. They decide **where** data is stored, **which features** are enabled (e.g. Google Sign-In, email, push notifications), and **how long** backups and logs are kept. |
| **Atlantisboard project (MIT licence)** | Provides the software and this notice. **Does not** access, collect, or sell personal data from your use of a third-party instance.                                                                                                          |


**Privacy requests** (access, deletion, correction, etc.) about data on a specific instance must be directed to your **Instance Administrator**, not to the open-source repository issue tracker.

**Where to find your administrator:** Ask your employer, IT department, or the person who invited you to the boards you use. The login page may also show branding or contact details they configured.

---

## 2. What this application does with your information

The sections below describe processing **performed by the Atlantisboard application** on the instance you use. What actually happens may depend on features your Instance Administrator has turned on.

### 2.1 Account and profile

When you register or sign in, the application may store:

- Email address, username, and display name  
- A **password hash** (not your plaintext password) if you use email/password sign-in  
- Profile picture (uploaded by you or supplied by Google Sign-In, if enabled)  
- Google account identifier and profile picture URL, if you use **Sign in with Google**  
- Preferences (theme, language, notification settings)  
- Email verification and password-reset tokens (temporary, security-related)  
- Login security data (e.g. last login time, failed login counters, short-term account lockout)  
- **Web Push** subscription details (browser endpoint and keys), only if you enable push notifications

### 2.2 Boards, workspaces, and collaboration

When you use Kanban features, the application stores content you and other authorised users create, including:

- Workspace and board names, settings, and membership roles  
- Lists, cards, titles, descriptions, labels, dates, checklists, and assignees  
- Comments on cards  
- **File attachments** (files and metadata such as filename, size, uploader)  
- Invitations to boards or workspaces

**Important:** Cards and attachments may contain personal data that **you or others enter** (e.g. names, contact details, HR or project information). You are responsible for what you upload and share within your organisation’s policies.

Administrators may also import data from **Trello or Wekan**, which can create placeholder user records linked to imported email or name fields.

### 2.3 Activity and security logs

- **Board activity log:** A history of certain actions on a board (who did what, when). Board managers can configure how long this is kept; the application default is **30 days** unless changed.  
- **Server security logs:** Authentication and admin actions may be recorded in server log files (including user identifier and sometimes **IP address**). These logs are for security and troubleshooting; they are not shown as a user-facing audit export unless your administrator provides them.

### 2.4 Technical data (security and operation)

To run securely, the application also processes:

- **IP address** (e.g. for rate limiting abuse and security logging)  
- **Session and authentication tokens** (see Section 4)  
- Real-time connection data for live board updates (Socket.io)  
- Temporary copies of uploaded files during **malware scanning** (see Section 6)

### 2.5 Data on your device

In your browser or installed app (PWA), the application may store:

- **IndexedDB:** Cached board and user data for speed and limited offline use  
- **Service Worker cache:** App assets and some responses for offline/PWA behaviour  
- **Cookies** for sign-in and security (see Section 4)

In **production**, sign-in uses **HttpOnly cookies**. Development installs may store a token in browser storage instead.

You can clear much of this data via browser settings (“site data”) or by signing out, depending on how your administrator configured the instance.

---

## 3. Where your data is stored

All account, board, and attachment data for your instance is stored on **infrastructure chosen by your Instance Administrator**, typically including:

- A **MongoDB** database (main application data)  
- **Redis** (sessions, rate limits, caches)  
- **Object storage** compatible with S3/MinIO (attachments, avatars, branding files, backups)

We do **not** operate cloud storage for your instance. Data location (country/region) depends entirely on where your administrator hosts the server.

---

## 4. Cookies and similar technologies


| Name / type                   | Purpose                                         | Typical duration                     |
| ----------------------------- | ----------------------------------------------- | ------------------------------------ |
| `sessionId` (HttpOnly cookie) | Keeps you signed in; supports secure OAuth flow | Up to **7 days**                     |
| `token` (HttpOnly cookie)     | Authentication in production                    | Configurable; often about **1 hour** |
| `csrf-token` (cookie)         | Protects against cross-site request forgery     | Aligned with your session            |
| IndexedDB / Service Worker    | Offline cache and PWA                           | Until cleared by you or the app      |


**Strictly necessary** cookies and storage are required to sign in and use the service. The application **does not include** built-in advertising or third-party analytics (such as Google Analytics).

You can block cookies in browser settings, but **sign-in will not work** without the essential cookies above.

---

## 5. Why the application processes your data

Your Instance Administrator determines the **legal basis** under local law. In typical workplace or team deployments, processing is usually for:


| Purpose                        | Examples                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Providing the service**      | Accounts, boards, real-time collaboration, attachments                             |
| **Security**                   | Sign-in, sessions, CSRF protection, rate limits, malware scanning, account lockout |
| **Communications you request** | Email verification, password reset, notifications (if enabled)                     |
| **Activity history**           | Board activity log visible to authorised members                                   |
| **Optional sign-in**           | Google OAuth, if your administrator enabled it                                     |


The application **does not sell** your personal data and **does not use** it for third-party advertising.

---

## 6. Malware scanning of uploads

If enabled on your instance, uploaded files may be scanned for malware using **ClamAV** before they are stored. File content is read temporarily on the server and checked by a scanner your administrator runs (often on the same network). Infected uploads are blocked. This is a **security measure**, not marketing profiling.

---

## 7. Third parties you may interact with

Depending on administrator configuration, data may be sent **outside the Atlantisboard server** to:


| Third party                      | When                                           | What                                                                                                                                                                    |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google**                       | You choose “Sign in with Google”               | Google processes your sign-in under [Google’s Privacy Policy](https://policies.google.com/privacy). The app receives your email, name, and profile picture from Google. |
| **Email (SMTP) provider**        | Password reset, verification, or notifications | Your email address and message content, via mail server settings chosen by your administrator                                                                           |
| **Web Push services**            | You enable browser push notifications          | Your browser/vendor routes encrypted push messages; the app stores a push subscription on your user record                                                              |
| **External database** (optional) | Google Sign-In restricted to an allowlist      | Your email may be checked against an external MySQL database configured by your administrator                                                                           |


Links in user-created content (cards, comments) may take you to **other websites**; those sites have their own privacy practices.

---

## 8. How long data is kept

Retention is set by your **Instance Administrator** and in-app settings. Application defaults include:


| Data                    | Typical retention                                                      |
| ----------------------- | ---------------------------------------------------------------------- |
| Your account            | Until you or an administrator deletes it                               |
| Board activity log      | Often **30 days** by default; board/workspace settings may change this |
| Sign-in session         | Up to **7 days** (session cookie)                                      |
| Authentication token    | Often about **1 hour** (configurable)                                  |
| Server logs and backups | Defined by administrator policy                                        |


Scheduled jobs in the application can delete expired activity log entries automatically.

---

## 9. Your choices and rights

### 9.1 In the application

- Update profile fields (where exposed in settings)  
- Adjust notification preferences  
- Enable or disable push notifications in your browser  
- Sign out and clear local browser data

### 9.2 Under privacy law

Depending on where you live, you may have rights such as **access**, **correction**, **deletion**, **restriction**, **portability**, **objection**, and **withdrawal of consent** (where processing is consent-based). You may also **complain to a supervisory authority**.

Because we do not operate your instance, **contact your Instance Administrator** to exercise these rights. They can use admin tools (e.g. account deletion, exports, log access) according to their policies and applicable law.

**EU/EEA authorities:** [European Data Protection Board — member list](https://edpb.europa.eu/about-edpb/about-edpb/members_en)  
**UK:** [Information Commissioner’s Office](https://ico.org.uk)

### 9.3 California and US state residents

If your Instance Administrator is subject to **CCPA/CPRA** or similar laws, you may have additional rights to know, delete, and correct personal information. Contact your **Instance Administrator**. The Atlantisboard application **does not sell** personal information by design.

---

## 10. Security

The application includes technical measures such as:

- HttpOnly and Secure cookies (in production)  
- CSRF protection on mutating requests  
- Strong password hashing (Argon2id)  
- Rate limiting (including by IP address)  
- Role-based access to workspaces and boards  
- Optional malware scanning on uploads  
- Encryption of selected administrator secrets at rest

No system is perfectly secure. Your Instance Administrator is responsible for updates, network security, TLS, and backup protection.

---

## 11. Children

Atlantisboard is a **general collaboration tool**, not directed at children. Your Instance Administrator should not allow registration below the minimum age required in your country (**16** in the EU, or **13** in some jurisdictions with parental consent). If you believe a child has registered in error, contact your **Instance Administrator**.

---

## 12. International transfers

If your Instance Administrator hosts data outside your country, your data may be transferred internationally. Safeguards (such as standard contractual clauses) are the **administrator’s responsibility**. Ask them where your instance is hosted if you need this information.

---

## 13. Changes to this notice

When you download or upgrade Atlantisboard, this notice may be updated. Material changes may require you to **review and agree again** on sign-in. The **“Last updated”** date at the top shows the current version bundled with the software.

Your Instance Administrator may also publish supplementary policies for their organisation; those apply **in addition** where relevant.

---

## 14. First sign-in acknowledgment

When you first sign in (or after a material update to this notice), the application may ask you to confirm:

> **I have read the Privacy Notice and understand how Atlantisboard processes my information on this instance as described above.**

You must agree to continue using the application **on that instance**, unless your administrator has configured a different lawful basis or process in your jurisdiction.

You may **decline** by not signing in or by closing the prompt; you will not be able to use authenticated features without agreeing, where acknowledgment is required.

---

## 15. Open-source software

Atlantisboard is provided under the **MIT License**. The software is supplied **“as is”**, without warranty. Copyright holders and contributors of the open-source project are **not liable** for your Instance Administrator’s hosting choices or for data processed on instances they do not operate.

---

## 16. Summary table (quick reference)


| Topic              | What the app does                                                       |
| ------------------ | ----------------------------------------------------------------------- |
| **Account**        | Stores email, username, profile, preferences, optional Google/push data |
| **Content**        | Stores boards, cards, comments, attachments you create or share         |
| **Logs**           | Board activity (configurable retention); security events in server logs |
| **Device**         | Cookies, IndexedDB, Service Worker cache                                |
| **Third parties**  | Google (optional sign-in), email/push (if enabled by admin)             |
| **Selling data**   | **No** — not built into the application                                 |
| **Analytics**      | **No** third-party analytics built into the application                 |
| **Who to contact** | Your **Instance Administrator** for access/deletion/hosting questions   |


