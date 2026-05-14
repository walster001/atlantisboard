# What runs on the server

[← Wiki home](Home.md)

This page is a **big picture** for operators. For commands, ports, and environment variables, use the [developer setup](../developer/setup.md) guide.

---

## Main pieces

- **Web application** — serves the pages users see.  
- **Database** — stores boards, cards, users, permissions.  
- **Redis** — shared memory the app uses for sessions and related features.  
- **File storage** — attachments, avatars, backgrounds, and branding files.

---

## Background work

Some housekeeping runs on a **schedule**. Your deployment might run that work in the **main** web process or in a **separate worker process** — your administrator follows the setup guide for your environment.

---

## Growing beyond one machine

Many teams run one modest server for a long time. If traffic grows, operators often add **more copies** of the web app behind a **load balancer** and keep the database and Redis on reliable managed services. Planning **HTTPS** and **backups** matters more than exotic architecture at first.

Next: [Linux production checklist](linux-production-install.md).
