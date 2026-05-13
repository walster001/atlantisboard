# Hosting overview: growth and moving parts

[← Wiki home](Home.md)

Atlantisboard is not one magic box — it talks to a **database**, a **cache/session store**, and **file storage** for uploads and branding. When you plan growth, think about each piece.

---

## What runs together

- **Web app** — serves the pages and the versioned programming interface.  
- **Background worker** — scheduled housekeeping; on some setups this runs as a **second process** instead of inside the web app.  
- **Database** — holds boards, cards, users, permissions.  
- **Redis** — sessions and shared state between processes.  
- **Object storage** — attachments, avatars, backgrounds, branding files.

---

## Live updates

Live collaboration uses a **websocket** connection from each open browser tab plus database listeners on the server. If live updates stop after a server upgrade, your admin should check whether the database supports the listener mode they enabled.

---

## One server vs many

- A **single modest server** is enough for many teams.  
- When traffic grows, people often put **multiple copies** of the web app behind a **load balancer**. Websockets and signed-in sessions then need **sticky routing** or another strategy so one user keeps hitting the same app instance — your platform team sets this.  
- **Redis** can be clustered for large deployments.  
- **Database** is usually one managed cluster (cloud or self-hosted) with backups.

---

## Security habits

- Put **HTTPS** in front of the app at a reverse proxy.  
- Only forward trusted **client IP** headers from that proxy, or rate limits and audits lie.  
- Keep **secrets** (sign-in keys, session encryption, storage keys) in environment files or a vault — never in chat or screenshots.

Next: [Linux production install](linux-production-install.md) or [API sign-in](api-and-authentication.md).
