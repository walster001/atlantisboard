# AtlantisBoard Database Schema

This folder contains the complete database schema for self-hosted deployments.

## Files

- `schema.sql` - Complete database schema (~1900 lines) including:
  - 2 ENUMs (board_role, permission_key)
  - 23 Tables with all columns and constraints
  - All foreign key relationships
  - All indexes
  - 30+ database functions
  - 4 triggers (auth, audit logging)
  - 82 RLS policies

## Usage

```bash
psql $DATABASE_URL < supabase/db/schema.sql
```

See `SELF_HOSTING.md` in the project root for complete setup instructions.
