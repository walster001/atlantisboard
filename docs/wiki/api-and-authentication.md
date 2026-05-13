# API sign-in and endpoints (for integrations)

[← Wiki home](Home.md)

This page is for **operators and integrators** who need to know how a signed-in browser or another program talks to the server. It avoids secret values and internal implementation detail.

---

## Base address

All JSON programming endpoints live under one versioned prefix on your server host, for example:

**your-site** + **`/api/v1/`** + route

A simple **health** check may exist **outside** that prefix (your admin can hit it for uptime monitors).

---

## How sign-in tokens work (conceptual)

1. A person signs in with **email and password** or **Google**.  
2. The server returns a **token** the app stores.  
3. Later requests send that token so the server knows **who** is calling and **which permissions** apply.

Tokens can be sent in more than one way because browsers, mobile apps, and `<img>` tags behave differently:

- The **Authorization** header with a **Bearer** token (common for scripts and mobile).  
- A **secure cookie** named like **token** (common after web sign-in).  
- A **query parameter** on the same name in narrow cases such as showing a private image in an HTML image tag.

**Sessions** — a separate HTTP-only session cookie still exists for parts of the sign-in dance (for example Google redirect flow and cross-site request protection). Day-to-day board actions after login usually rely on the bearer-style token above.

**Logout** — clears client state; integrations should delete stored tokens when a user signs out.

---

## Cross-site request protection

Write operations from browser pages expect a **CSRF** pattern: the client fetches a token from a dedicated GET endpoint and sends it back on mutating requests. Automations that are not a browser should use patterns your developers document (often header-based exemptions or service accounts — confirm with your team).

---

## Real-time socket

Live updates use a **websocket** connection. The client passes the same sign-in token during the socket handshake. Events are named after things that changed (**card updated**, **board patched**, and similar). You do not need the socket for simple read-only scripts if you poll HTTP instead — but polling is heavier.

---

## Endpoint map (by area)

Paths below are all under **`/api/v1`**. Methods are typical REST patterns unless noted.

| Area | What it is for |
|------|----------------|
| **Auth** | Login options, branding metadata, register, login, logout, **who am I**, forgot password, reset password, verify email, Google start and callback. |
| **CSRF** | Fetch a CSRF token before forms that need it. |
| **Public assets** | Branding images, board backgrounds, inline import icons, hosted fonts — often readable without a session depending on file. |
| **Workspaces** | Create, rename, archive workspaces; membership and roles. |
| **Boards** | Board CRUD, permissions, members, reorder on home, background uploads, bulk color tweaks, large **snapshot** reads for the board view. |
| **Lists** | Create, rename, reorder, archive lists on a board. |
| **Cards** | Card CRUD, move between lists, duplicate, assignees, reminders, reorder within list. |
| **Labels** | Board-level label definitions and assigning labels on cards. |
| **Checklists** | Checklists and checklist items on cards. |
| **Comments** | Comment threads on cards. |
| **Attachments** | Upload, delete, and fetch card files via storage-backed URLs. |
| **Activities** | Audit-style feeds for boards or cards where policy allows. |
| **Invites** | Create, list, delete, accept invitations. |
| **Import** | Start imports (Trello JSON, etc.) and poll job status. |
| **Export** | Download board exports (JSON, CSV, depending on server). |
| **Users** | Profile, preferences, avatar upload, user search for admins or pickers; public avatar image by user id for `<img>` tags. |
| **Admin** | Entire subtree restricted to **app administrators**: backup jobs, site config, metrics probes, user security tooling, branding uploads, font uploads, roles, permission sets, app-admin membership, placeholder accounts, and similar power tools. |

For the exact path of each operation, your developers look at the server **routes** folder in the repository — this wiki stays at the overview level on purpose.

---

## Rate limits

Sensitive flows (sign-in, password reset, uploads) may be **rate limited** per IP. If an integration hits **429** responses, slow down and contact your admin to tune fair use.

---

## What not to publish

Never paste **live tokens**, **cookie dumps**, or **admin export archives** into tickets or public wikis. Rotate keys if they leak.

Back to [Wiki home](Home.md).
