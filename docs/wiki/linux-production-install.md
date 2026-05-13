# Linux production install — step by step

[← Wiki home](Home.md)

This is a **checklist** for someone comfortable on Linux (Ubuntu-style paths assumed; adapt for your distro). Your exact URLs and passwords belong in your own runbook, not in this wiki.

---

## 1. Prepare the machine

- Fresh or dedicated Linux host with **sudo** access.  
- Install **Bun** at the version required by the project (see the project README engines line).  
- Install **Docker** and **Docker Compose** plugin if you deploy with containers (recommended in this repo).  
- Open **firewall** ports only for what you need — normally 443 to the world, and internal ports for database or storage if they stay on the same machine.

---

## 2. Get the release

Choose one path:

- **Clone** the repository at a release tag your team trusts, **or**  
- Unpack a **release bundle** your team built with the project’s release script (see README for the bundle workflow).

---

## 3. Configure environment

- Copy the example environment file to a real one in the project root (the file is named like **env example** in the repository root — copy it to **.env**).  
- Fill in strong random values wherever the example says to change secrets for production.  
- Set the public **site URL** and **allowed browser origins** so sign-in redirects and browser security rules match how users reach you.  
- Point **database**, **Redis**, and **object storage** settings at services you already run, or use the production compose file that starts them beside the app.

---

## 4. Database expectations

Live collaboration features expect a **replica-set style** MongoDB deployment (common with Atlas or a three-node cluster). A single-node dev database might not be enough — read the environment hints in the example file and your operator notes.

---

## 5. Build and start (Docker path)

- Use the production **Docker compose** file in the repository root (the one labeled for production, not the dev stack).  
- Build the application image from the supplied **Dockerfile**.  
- Start the stack in detached mode.  
- Optional: run the **production deploy** shell script from the **scripts** folder — it checks prerequisites, validates that secrets are not left at default values, builds, starts compose, and pings health checks.

Wait until health checks pass before sending users to the site.

---

## 6. Build and start (no Docker path)

- Install JavaScript dependencies with the Bun install command from the README.  
- Run the production **build** script from package metadata.  
- Run the **start** command to launch the web server from the built output.  
- Start the **worker** process separately unless your environment variable explicitly allows cron-style work inside the web process (the README explains the tradeoff).

Use **systemd** units, **supervisor**, or your orchestrator to restart processes on reboot — the repository does not ship systemd samples today, so your team writes those few lines.

---

## 7. Reverse proxy and TLS

- Terminate HTTPS at **nginx**, **Caddy**, **Traefik**, or your cloud load balancer.  
- Forward plain HTTP to the app on localhost only.  
- Tell the proxy to send **forwarded protocol** headers so OAuth return URLs use https.  
- Restrict which machines can talk to Redis, MongoDB, and MinIO ports.

---

## 8. Smoke test

- Open the public URL — you should see the sign-in page with your branding.  
- Register the **first admin** account (first registration often becomes app admin).  
- Create a workspace and board; drag a card; upload a small attachment.  
- Open **Admin configuration** and save a harmless setting to prove persistence.

---

## 9. Backups before real users

- Run a backup from admin or your scripted job.  
- Practice a **restore** on a staging machine quarterly.

---

## 10. Ongoing care

- Watch disk space for uploads and backups.  
- Upgrade on a schedule; read release notes.  
- Run security audits on dependencies when you upgrade (your developers use the Bun audit command in their workflow).

If anything in this list disagrees with your team’s README, **trust the README** — it tracks the repo.

Next: [API sign-in and endpoints](api-and-authentication.md).
