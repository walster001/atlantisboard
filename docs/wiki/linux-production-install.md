# Linux production checklist

[← Wiki home](Home.md)

Use this as a **human checklist**. Exact commands, ports, and secret names live in [developer setup](../developer/setup.md) in this repository.

---

## Before you start

- You can sign in to the Linux host with **sudo** when needed.  
- You decided **Docker** versus **bare metal** (Bun running the built app).  
- You have a **domain** or internal hostname and plan for **HTTPS**.

---

## Ordered steps

1. Install **Bun** at the version the project requires and **Docker** plus **Compose** if you use containers.  
2. Copy the example environment file to a real **.env** and replace every placeholder secret with strong random values your team stores safely.  
3. Point **database**, **Redis**, and **file storage** settings at services that are already running **or** start them with the production compose file shipped in the repo.  
4. Confirm the database setup matches what the **developer setup** guide says about live updates (some features expect a replica-style deployment).  
5. **Build** the application image or run the production **build** script, then **start** the web process and any **worker** process your guide recommends.  
6. Put **HTTPS** in front of the app with a reverse proxy; only forward trusted headers from that proxy.  
7. Open the site in a browser, create the **first admin** account if prompted, create a test board, and upload a small file.  
8. Turn on **backups** and verify you can restore to a test machine.  
9. Document your own **support** contacts and upgrade cadence for your users.

---

## Ongoing

Watch **disk space**, **backups**, and **updates** to dependencies. Re-read release notes before each upgrade.

Back to [Wiki home](Home.md).
