# Implementation Questions - Gap Analysis Findings

Based on the gap analysis of `specifications.md` and `.cursor/rules/atlantisboardrules.mdc`, the following questions need clarification before implementing missing features.

**Instructions**: Please fill in your answers in the "**YOUR ANSWER:**" sections below. You can delete options you don't want or add additional details.

---

## 1. User Notification Preferences

### 1.1 Notification Preferences Structure
**Question**: How should user notification preferences be structured in the database?

**Clarifications needed**:
- Should preferences be per notification type (reminders, assignments, comments, mentions)?
- Should each type have multiple delivery methods (in-app, email, push, SMS)?
- Should there be global notification on/off plus per-type preferences?
- Should email notifications be configurable per type?

**YOUR ANSWER:**
```
[Write your answer here]
- Per-type preferences: [Yes]
- If yes, notification types: [reminders, assignments, comments, mentions, invites]
- Delivery methods per type: [in-app, email, push, SMS (future)]
- Global notification toggle: [Yes]
- Email notifications configurable: [Yes]
```

---

### 1.2 Notification Storage
**Question**: Should notifications be stored in a separate collection or embedded in user documents?

**Clarifications needed**:
- Separate Notifications collection for all notifications?
- Or embed notifications in User document?
- Should notifications have read/unread status?
- Should notifications be automatically deleted after read?
- Retention period for notifications?

**YOUR ANSWER:**
```
[Write your answer here]
- Storage: [Separate collection]
- Read/unread status: [Yes]
- Auto-delete after read: [No]
- If retention, period: 1 days (e.g., 30, 90)
```

---

## 2. Card Duplication

### 2.1 Card Duplication Behavior
**Question**: How should card duplication work?

**Clarifications needed**:
- Duplicate to same list or allow choosing target list?
- Should duplicated card copy all properties (labels, checklists, attachments, comments)?
- Should duplicated card copy assignees?
- Should duplicated card copy due dates and reminders?
- Position of duplicated card (same position, end of list, custom)?

**YOUR ANSWER:**
```
[Write your answer here]
- Target list: [Choose list]
- Copy all properties: [Yes]
- Copy assignees: [Yes]
- Copy due dates: [Yes]
- Copy reminders: [Yes]
- Position: [Same position]
```

---

## 3. Workspace Archiving

### 3.1 Workspace Archiving Behavior
**Question**: How should workspace archiving work?

**Clarifications needed**:
- Should archiving hide workspace from normal view?
- Should archived workspaces be accessible to admins?
- Should archiving archive all boards in workspace?
- Can archived workspaces be restored?
- Should archived workspaces be automatically deleted after X days?

**YOUR ANSWER:**
```
[Write your answer here]
- Hide from normal view: [Yes]
- Accessible to admins: [Yes]
- Archive all boards: [Yes]
- Restorable: [Yes]
- Auto-delete after period: [Yes] - If yes, after: 5 days
```

---

## 4. Admin Configuration Storage

### 4.1 Admin Configuration Structure
**Question**: How should admin configuration be stored and managed?

**Clarifications needed**:
- Single global configuration or per-instance?
- Should configuration be versioned/have history?
- Who can modify admin configuration (only super admin)?
- Should configuration changes be logged in audit trail?
- Should sensitive config (OAuth secrets, MySQL passwords) be encrypted?

**YOUR ANSWER:**
```
[Write your answer here]
- Storage: [Single Global Configuration]
- Configuration history: [No]
- Who can modify: [App Admin/Admin/Custom roles with the right granular permissions]
- Audit trail for changes: [Yes]
- Encrypt sensitive data: [Yes]
```

---

## 5. Background Jobs & Worker Process

### 5.1 Background Job Implementation
**Question**: How should background jobs be implemented and tracked?

**Clarifications needed**:
- Should background jobs be tracked in database (WorkerJobs collection)?
- Should jobs have retry logic?
- Maximum retry attempts?
- Should failed jobs be logged for debugging?
- Should there be a job queue or direct scheduling?
- How should job failures be handled (notify admin, log only)?

**YOUR ANSWER:**
```
[Write your answer here]
- Track in database: [No]
- Retry logic: [Yes] - If yes, max retries: [3]
- Log failed jobs: [No]
- Job queue system: [No] - If yes, which: [Specify]
- Failure handling: [Both]
```

---

### 5.2 Cron Job Configuration
**Question**: What scheduled tasks should run as cron jobs?

**Clarifications needed**:
- Activity log cleanup (daily, weekly)?
- Import job cleanup (auto-delete after 2 days)?
- Reminder delivery (how frequently check for due reminders)?
- Notification cleanup (delete old notifications)?
- Other scheduled tasks?

**YOUR ANSWER:**
```
[Write your answer here]
- Activity log cleanup: [Yes] - If yes, frequency: [Weekly]
- Import job cleanup: [Yes] - If yes, frequency: [Daily]
- Reminder delivery check: [Yes] - If yes, frequency: [Every 15 minutes]
- Notification cleanup: [Yes] - If yes, frequency: [Weekly]
- Other tasks: [Cleanup orphaned card attachments from imports/cards, frequency:Daily]


---

## 6. Redis Configuration

### 6.1 Redis Usage
**Question**: How should Redis be configured and used?

**Clarifications needed**:
- Should Redis be required or optional?
- Use Redis for session storage only or also caching?
- Should Redis be in Docker Compose for local development?
- Redis connection pooling configuration?
- Redis persistence requirements (RDB, AOF)?

**YOUR ANSWER:**
```
[Write your answer here]
- Redis required: [Required]
- Usage: [Session + caching]
- Docker Compose setup: [Yes]
- Connection pooling: [Yes] - If yes, pool size: [5]
- Persistence: [Both]
```

---

## 7. MinIO Configuration

### 7.1 MinIO Setup
**Question**: How should MinIO be configured for file storage?

**Clarifications needed**:
- Should MinIO be in Docker Compose for local development?
- Default bucket configuration?
- MinIO access key/secret key management?
- Should MinIO support versioning?
- Should MinIO support lifecycle policies (auto-delete old files)?

**YOUR ANSWER:**
```
[Write your answer here]
- Docker Compose setup: [Yes]
- Default bucket name: [4 Default Buckets, import-inline (for custom wekan inline button images), card-attachments (for attachments on cards ordered by folders with card-id as foldername), branding (for whitelabelling, custom login logos, navbar logos, any branding for the app go in here, fonts (for custom fonts)]
- Access key management: [Both]
- Versioning support: [No]
- Lifecycle policies: [No] - If yes, auto-delete after: [Number] days
```

---

## 8. File Upload Specifications

### 8.1 File Upload Details
**Question**: What are the detailed specifications for file uploads?

**Clarifications needed**:
- Should uploads support progress tracking?
- Should uploads support resumable uploads (for large files)?
- File serving strategy (presigned URLs, direct serve, CDN)?
- Should file uploads be validated for malware/viruses?
- Should there be file type restrictions (even though spec says "no restrictions")?

**YOUR ANSWER:**
```
[Write your answer here]
- Progress tracking: [Yes]
- Resumable uploads: [Yes]
- Serving strategy: [Direct serve, verifying against if user trying to access is authenticated, apart from the branding folder, branding should be public]
- Malware scanning: [Yes]
- File type restrictions: [No] - If yes, allowed types: [Specify]
```

---

## 9. Notification Management API

### 9.1 Notification Endpoints
**Question**: What notification management endpoints are needed?

**Clarifications needed**:
- Get all notifications or paginated?
- Filter notifications by type?
- Mark all as read functionality?
- Delete old notifications automatically?
- Notification preferences update endpoint?

**YOUR ANSWER:**
```
[Write your answer here]
- Get notifications: [All] - If paginated, page size: [Number]
- Filter by type: [Yes]
- Mark all as read: [Yes]
- Auto-delete old: [Yes] - If yes, after: [10] days
- Preferences endpoint: [Yes]
```

---

## 10. Activity Log Cleanup

### 10.1 Activity Log Retention Implementation
**Question**: How should activity log cleanup be implemented?

**Clarifications needed**:
- Should cleanup be automatic (cron job) or manual?
- Should cleanup respect configurable retention period per workspace/board?
- Should cleanup be logged in audit trail?
- Should there be a way to export activities before cleanup?

**YOUR ANSWER:**
```
[Write your answer here]
- Cleanup method: [Both]
- Respect per-workspace retention: [Yes]
- Log cleanup in audit trail: [Yes]
- Export before cleanup: [No]
```

---

## 11. Rate Limiting Strategy

### 11.1 Comprehensive Rate Limiting
**Question**: What should be the comprehensive rate limiting strategy?

**Clarifications needed**:
- Rate limits for authentication endpoints?
- Rate limits for file uploads?
- Rate limits for API endpoints (general)?
- Rate limits per user or per IP?
- Should rate limits be configurable by admin?

**YOUR ANSWER:**
```
[Write your answer here]
- Auth endpoints limit: [900] attempts per [1] minutes (e.g., 5 per 15)
- File upload limit: [10] uploads per [1] minutes per user
- General API limit: [1000] requests per [1] minutes per user
- Rate limit scope: [Both]
- Admin configurable: [Yes]
```

---

## 12. Account Lockout

### 12.1 Account Lockout Implementation
**Question**: How should account lockout work?

**Clarifications needed**:
- Number of failed attempts before lockout?
- Lockout duration (temporary or permanent until admin unlock)?
- Should lockout be per IP or per account?
- Should there be exponential backoff (increasing lockout duration)?
- Unlock mechanism (automatic after time, admin unlock, email unlock)?

**YOUR ANSWER:**
```
[Write your answer here]
- Failed attempts threshold: [3] (e.g., 5)
- Lockout duration: [Permanent until unlock]
- If temporary, duration: [Number] minutes (e.g., 15, 30, 60)
- Lockout scope: [Both]
- Exponential backoff: [No]
- Unlock mechanism: [Admin unlock]
```

---

## 13. Inconsistencies Resolution

### 13.1 CSV Import Error Handling
**Question**: How should CSV import errors be handled?

**Options**:
- [ ] Continue processing and collect all errors (report at end)
- [ ] Stop on first critical error and rollback
- [x] Stop on first error (any error) and rollback
- [ ] Partial import (skip errors, continue with valid rows)

**YOUR ANSWER:**
```
[Write your answer here]
- Error handling strategy: [Continue and collect/Stop on critical/Stop on any/Partial import]
- If stop, rollback: [Stop on first error and rollback]
```

---

### 13.2 PWA Features
**Question**: What PWA features should be in scope vs future?

**Clarifications needed**:
- Basic PWA (manifest.json, service worker) - current or future?
- Advanced PWA features (offline sync, push notifications, install prompt) - current or future?
- Should basic PWA be required for MVP?

**YOUR ANSWER:**
```
[Write your answer here]
- Basic PWA (manifest, service worker): [Current]
- Advanced PWA features: [Current]
- Required for MVP: [Yes]
```

---

### 13.3 Audit Logs
**Question**: Should audit logs be in scope or future enhancement?

**Clarifications needed**:
- Audit logs are mentioned in Security section as required
- But also listed in Future Enhancements
- Should audit logs be required for MVP?

**YOUR ANSWER:**
```
[Write your answer here]
- Audit logs scope: [Required for MVP]
- If required, minimum features: [User A added user B to board, changed permissions role, User A used invite link to join the board as {viewer} permissions role]
```

---

## 14. Guest Access Support

### 14.1 Guest Access Implementation
**Question**: Should guest access be implemented or removed from specifications?

**Clarifications needed**:
- Currently mentioned but no details provided
- Should guests have limited permissions?
- Should guests be able to create accounts?
- Should guests have expiration (temporary access)?

**YOUR ANSWER:**
```
[Write your answer here]
- Implement guest access: [No]
---

## 15. Custom Permission Sets

### 15.1 Custom Permission Sets
**Question**: Should custom permission sets be implemented or use fixed roles only?

**Clarifications needed**:
- Currently mentioned but no schema or details
- Should admins be able to create custom permission sets?
- Or should we use fixed roles (Admin, Manager, Member, Viewer) only?

**YOUR ANSWER:**
```
[Write your answer here]
- Implement custom permission sets: [Yes]
- If yes:
  - Who can create: [All admins]
  - Permission granularity: [Create permission strings for all actions any authenticated user could perform, for example boards.user.view, admin.modifyrole, admin.viewpermission.roles, add toggle switches and a 'Permissions Roles' tab in the admin configuration
```

---

## 16. Board Views

### 16.1 Board View Implementation
**Question**: What board views should be implemented?

**Clarifications needed**:
- Kanban view (primary) - already specified
- List view (Primary)- mentioned but no details
- Calendar view - marked as "future" but should be clarified

**YOUR ANSWER:**
```
[Write your answer here]
- List view: [Current]
- Calendar view: [Remove]
- If current, implementation details: [List view and kanban view are the same thing, but we should not implement swimlanes, keep it simple just columns]
```

---

## 17. Email Notifications

### 17.1 Email Notification Implementation
**Question**: Should email notifications be fully implemented or removed?

**Clarifications needed**:
- Mentioned as "configurable" but no implementation details
- No email service configuration specified
- No email templates specified
- Should email be required or optional?

**YOUR ANSWER:**
```
[Write your answer here]
- Implement email notifications: [No]
- If yes:
  - Email service: [nodemailer/Other] - If other, specify: [Service name]
  - Email templates: [Yes/No]
  - Email delivery tracking: [Yes/No]
  - Required or optional: [Required/Optional]
- If no: Remove email notification mentions
```

---

## 18. Missing Dependencies

### 18.1 Additional Packages
**Question**: Should these packages be added to the tech stack?

**Clarifications needed**:
- Helmet.js (mentioned in security but not in tech stack)
- express-rate-limit (mentioned but not in tech stack)
- Any other missing packages? Check for anything mentioned in this document that requires a package. 

**YOUR ANSWER:**
```
[Write your answer here]
- Add Helmet.js (Latest): [Yes]
- Add express-rate-limit (Latest): [Yes]
- Other packages: [Use latest Pompelmi for Malware-Filescanning, Use latest resumable.js with minios tus protocol for resumable uploads]
```

---

## 19. Wekan Label Colors

### 19.1 Wekan Color Reference
**Question**: How should Wekan label colors be handled?

**Clarifications needed**:
- Specification mentions "analyze Wekan CSS for exact colors"
- Should we include specific color values?
- Or remove the reference and use standard color palette?

**YOUR ANSWER:**
```
[Write your answer here]
- Include Wekan colors: [Yes]
- If yes:
  - Source: [Analyze Wekan CSS]
```

---

## 20. Placeholder User Conversion

### 20.1 Placeholder User Management
**Question**: Should there be manual placeholder user conversion endpoints?

**Clarifications needed**:
- Auto-conversion on signup is specified
- Should admins be able to manually convert placeholders?
- Should there be a merge endpoint for merging placeholders with existing users?

**YOUR ANSWER:**
```
[Write your answer here]
- Manual conversion endpoint: [Yes]
- Merge endpoint: [Yes]
- Who can convert/merge: [All admins]
```

---

## Priority Questions

**High Priority** (needed for core functionality):
1. ✅ User Notification Preferences - Structure and storage
2. ✅ Card Duplication - Behavior and API
3. ✅ Workspace Archiving - Implementation
4. ✅ Redis Configuration - Setup and usage
5. ✅ MinIO Configuration - Setup and usage
6. ✅ Background Jobs - Implementation and tracking
7. ✅ CSV Import Error Handling - Resolve inconsistency

**Medium Priority** (needed for complete feature set):
8. ✅ Admin Configuration Storage - Structure
9. ✅ File Upload Specifications - Detailed requirements
10. ✅ Notification Management API - Endpoints needed
11. ✅ Activity Log Cleanup - Implementation
12. ✅ Rate Limiting Strategy - Comprehensive approach
13. ✅ Account Lockout - Implementation details

**Low Priority** (nice to have or clarification):
14. ✅ PWA Features - Current vs future
15. ✅ Audit Logs - Scope clarification
16. ✅ Guest Access - Implement or remove
17. ✅ Custom Permission Sets - Implement or remove
18. ✅ Board Views - Implementation details
19. ✅ Email Notifications - Implement or remove
20. ✅ Missing Dependencies - Add to tech stack
21. ✅ Wekan Label Colors - Reference handling
22. ✅ Placeholder User Conversion - Manual operations

---

## Instructions for Filling Out

1. **Read each question carefully** - The questions are designed to help define the exact behavior of each feature.

2. **Fill in the "YOUR ANSWER:" sections** - You can:
   - Delete options you don't want
   - Add additional details or clarifications
   - Specify exact values (numbers, times, etc.)
   - Add "Other" options if needed

3. **Be specific** - The more specific your answers, the better I can implement the features correctly.

4. **Priority order** - You can fill out sections in any order, but the high-priority sections (1-7) should be completed first.

5. **Questions?** - If you're unsure about any question, you can leave it blank and I'll ask for clarification, or you can provide multiple options and I'll implement the most flexible solution.

---

**Once you've filled in your answers, I'll update both `specifications.md` and `.cursorrules` with complete implementation details based on your responses.**

