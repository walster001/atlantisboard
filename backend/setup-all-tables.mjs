#!/usr/bin/env node
// Setup all required database tables from Prisma schema
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function setupAllTables() {
  try {
    console.log('🔧 Setting up all database tables...\n');

    // 1. Users table (already created, but ensure it has all columns)
    console.log('📊 Ensuring users table...');
    try {
      // Check if table exists first
      const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `;
      
      const exists = Array.isArray(tableExists) && tableExists[0]?.exists;
      
      if (!exists) {
        await prisma.$executeRaw`
          CREATE TABLE public.users (
            id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            email text NOT NULL UNIQUE,
            email_verified boolean NOT NULL DEFAULT false,
            password_hash text,
            provider text,
            provider_id text,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            updated_at timestamp with time zone NOT NULL DEFAULT now()
          );
        `;
        console.log('✅ Users table created\n');
      } else {
        console.log('✅ Users table already exists\n');
      }
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('23505')) {
        console.log('⚠️  Users table/type conflict detected, skipping...\n');
      } else {
        throw error;
      }
    }

    // 2. Profiles table
    console.log('📊 Creating profiles table...');
    try {
      const profilesExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'profiles'
        );
      `;
      
      if (!(Array.isArray(profilesExists) && profilesExists[0]?.exists)) {
        await prisma.$executeRaw`
          CREATE TABLE public.profiles (
        id uuid NOT NULL PRIMARY KEY,
        email text NOT NULL,
        full_name text,
        avatar_url text,
        is_admin boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE
        );
      `;
        console.log('✅ Profiles table created\n');
      } else {
        console.log('✅ Profiles table already exists\n');
      }
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('23505')) {
        console.log('⚠️  Profiles table conflict, skipping...\n');
      } else {
        throw error;
      }
    }

    // 3. Refresh tokens table
    console.log('📊 Creating refresh_tokens table...');
    try {
      const refreshTokensExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'refresh_tokens'
        );
      `;
      
      if (!(Array.isArray(refreshTokensExists) && refreshTokensExists[0]?.exists)) {
        await prisma.$executeRaw`
          CREATE TABLE public.refresh_tokens (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid NOT NULL,
        token text NOT NULL UNIQUE,
        expires_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
        );
      `;
        console.log('✅ Refresh tokens table created\n');
      } else {
        console.log('✅ Refresh tokens table already exists\n');
      }
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('23505')) {
        console.log('⚠️  Refresh tokens table conflict, skipping...\n');
      } else {
        throw error;
      }
    }

    // 4. App settings table
    console.log('📊 Creating app_settings table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.app_settings (
        id text NOT NULL PRIMARY KEY DEFAULT 'default',
        custom_login_logo_enabled boolean NOT NULL DEFAULT false,
        custom_login_logo_url text,
        custom_login_logo_size text NOT NULL DEFAULT 'medium',
        custom_home_logo_enabled boolean NOT NULL DEFAULT false,
        custom_home_logo_url text,
        custom_home_logo_size integer NOT NULL DEFAULT 40,
        custom_board_logo_enabled boolean NOT NULL DEFAULT false,
        custom_board_logo_url text,
        custom_board_logo_size integer NOT NULL DEFAULT 40,
        custom_app_name_enabled boolean NOT NULL DEFAULT false,
        custom_app_name text,
        custom_app_name_size integer NOT NULL DEFAULT 24,
        custom_app_name_color text NOT NULL DEFAULT '#000000',
        custom_app_name_font text DEFAULT 'default',
        custom_global_app_name_enabled boolean NOT NULL DEFAULT false,
        custom_global_app_name text,
        custom_tagline_enabled boolean NOT NULL DEFAULT false,
        custom_tagline text,
        custom_tagline_size integer NOT NULL DEFAULT 14,
        custom_tagline_color text NOT NULL DEFAULT '#6b7280',
        custom_tagline_font text DEFAULT 'default',
        custom_login_background_enabled boolean NOT NULL DEFAULT false,
        custom_login_background_type text NOT NULL DEFAULT 'color',
        custom_login_background_color text NOT NULL DEFAULT '#f3f4f6',
        custom_login_background_image_url text,
        custom_login_box_background_color text NOT NULL DEFAULT '#ffffff',
        custom_google_button_background_color text NOT NULL DEFAULT '#ffffff',
        custom_google_button_text_color text NOT NULL DEFAULT '#000000',
        login_style text NOT NULL DEFAULT 'google_only',
        audit_log_retention_days integer,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✅ App settings table created\n');

    // 5. Workspaces table
    console.log('📊 Creating workspaces table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.workspaces (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        description text,
        owner_id uuid NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Workspaces table created\n');

    // 6. Workspace members table
    console.log('📊 Creating workspace_members table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.workspace_members (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
        CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
        CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id)
      );
    `;
    console.log('✅ Workspace members table created\n');

    // 7. Board themes table
    console.log('📊 Creating board_themes table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.board_themes (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        navbar_color text NOT NULL DEFAULT '#0079bf',
        column_color text NOT NULL DEFAULT '#ffffff',
        board_icon_color text NOT NULL DEFAULT '#ffffff',
        homepage_board_color text NOT NULL DEFAULT '#0079bf',
        scrollbar_color text NOT NULL DEFAULT '#888888',
        scrollbar_track_color text NOT NULL DEFAULT '#f1f1f1',
        card_window_color text NOT NULL DEFAULT '#ffffff',
        card_window_text_color text NOT NULL DEFAULT '#000000',
        card_window_button_color text NOT NULL DEFAULT '#0079bf',
        card_window_button_text_color text NOT NULL DEFAULT '#ffffff',
        card_window_button_hover_color text,
        card_window_button_hover_text_color text,
        card_window_intelligent_contrast boolean NOT NULL DEFAULT false,
        default_card_color text,
        is_default boolean NOT NULL DEFAULT false,
        created_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT board_themes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Board themes table created\n');

    // 8. Boards table
    console.log('📊 Creating boards table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.boards (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        workspace_id uuid NOT NULL,
        name text NOT NULL,
        description text,
        background_color text DEFAULT '#0079bf',
        theme_id uuid,
        position integer NOT NULL DEFAULT 0,
        audit_log_retention_days integer,
        created_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT boards_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
        CONSTRAINT boards_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.board_themes(id) ON DELETE SET NULL,
        CONSTRAINT boards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Boards table created\n');

    // 9. Board members table
    console.log('📊 Creating board_members table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.board_members (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT board_members_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT board_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
        CONSTRAINT board_members_board_id_user_id_key UNIQUE (board_id, user_id)
      );
    `;
    console.log('✅ Board members table created\n');

    // 10. Board member audit log table
    console.log('📊 Creating board_member_audit_log table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.board_member_audit_log (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        action text NOT NULL,
        target_user_id uuid NOT NULL,
        actor_user_id uuid,
        old_role text,
        new_role text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT board_member_audit_log_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT board_member_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Board member audit log table created\n');

    // 11. Board invite tokens table
    console.log('📊 Creating board_invite_tokens table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.board_invite_tokens (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        token text NOT NULL UNIQUE,
        link_type text NOT NULL DEFAULT 'one_time',
        created_by uuid NOT NULL,
        expires_at timestamp with time zone,
        used_at timestamp with time zone,
        used_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT board_invite_tokens_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT board_invite_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
        CONSTRAINT board_invite_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Board invite tokens table created\n');

    // 12. Custom roles table
    console.log('📊 Creating custom_roles table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.custom_roles (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        description text,
        is_system boolean NOT NULL DEFAULT false,
        created_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Custom roles table created\n');

    // 13. Role permissions table
    console.log('📊 Creating role_permissions table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.role_permissions (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        role_id uuid,
        permission_key text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE,
        CONSTRAINT role_permissions_role_id_permission_key_key UNIQUE (role_id, permission_key)
      );
    `;
    console.log('✅ Role permissions table created\n');

    // 14. Board member custom roles table
    console.log('📊 Creating board_member_custom_roles table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.board_member_custom_roles (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        user_id uuid NOT NULL,
        custom_role_id uuid NOT NULL,
        workspace_id uuid,
        board_member_id uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT board_member_custom_roles_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT board_member_custom_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
        CONSTRAINT board_member_custom_roles_custom_role_id_fkey FOREIGN KEY (custom_role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE,
        CONSTRAINT board_member_custom_roles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
        CONSTRAINT board_member_custom_roles_board_member_id_fkey FOREIGN KEY (board_member_id) REFERENCES public.board_members(id) ON DELETE CASCADE,
        CONSTRAINT board_member_custom_roles_board_id_user_id_custom_role_id_key UNIQUE (board_id, user_id, custom_role_id)
      );
    `;
    console.log('✅ Board member custom roles table created\n');

    // 15. Columns table
    console.log('📊 Creating columns table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.columns (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        title text NOT NULL,
        position integer NOT NULL DEFAULT 0,
        color text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT columns_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Columns table created\n');

    // 16. Cards table
    console.log('📊 Creating cards table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.cards (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        column_id uuid NOT NULL,
        title text NOT NULL,
        description text,
        position integer NOT NULL DEFAULT 0,
        color text,
        priority text DEFAULT 'none',
        due_date timestamp with time zone,
        created_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT cards_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.columns(id) ON DELETE CASCADE,
        CONSTRAINT cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Cards table created\n');

    // 17. Card assignees table
    console.log('📊 Creating card_assignees table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.card_assignees (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        card_id uuid NOT NULL,
        user_id uuid NOT NULL,
        assigned_by uuid,
        assigned_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT card_assignees_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE,
        CONSTRAINT card_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
        CONSTRAINT card_assignees_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id),
        CONSTRAINT card_assignees_card_id_user_id_key UNIQUE (card_id, user_id)
      );
    `;
    console.log('✅ Card assignees table created\n');

    // 18. Card subtasks table
    console.log('📊 Creating card_subtasks table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.card_subtasks (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        card_id uuid NOT NULL,
        title text NOT NULL,
        completed boolean NOT NULL DEFAULT false,
        completed_at timestamp with time zone,
        completed_by uuid,
        position integer NOT NULL DEFAULT 0,
        checklist_name text DEFAULT 'Checklist',
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT card_subtasks_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE,
        CONSTRAINT card_subtasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Card subtasks table created\n');

    // 19. Card attachments table
    console.log('📊 Creating card_attachments table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.card_attachments (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        card_id uuid NOT NULL,
        file_name text NOT NULL,
        file_url text NOT NULL,
        file_type text,
        file_size integer,
        uploaded_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT card_attachments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE,
        CONSTRAINT card_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Card attachments table created\n');

    // 20. Labels table
    console.log('📊 Creating labels table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.labels (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        name text NOT NULL,
        color text NOT NULL,
        CONSTRAINT labels_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Labels table created\n');

    // 21. Card labels table (many-to-many)
    console.log('📊 Creating card_labels table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.card_labels (
        card_id uuid NOT NULL,
        label_id uuid NOT NULL,
        CONSTRAINT card_labels_pkey PRIMARY KEY (card_id, label_id),
        CONSTRAINT card_labels_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id) ON DELETE CASCADE,
        CONSTRAINT card_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE
      );
    `;
    console.log('✅ Card labels table created\n');

    // 22. Import pending assignees table
    console.log('📊 Creating import_pending_assignees table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.import_pending_assignees (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        card_id uuid NOT NULL,
        original_member_name text NOT NULL,
        original_member_id text,
        original_username text,
        mapped_user_id uuid,
        import_source text NOT NULL DEFAULT 'unknown',
        resolved_at timestamp with time zone,
        resolved_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT import_pending_assignees_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT import_pending_assignees_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Import pending assignees table created\n');

    // 23. Import pending attachments table
    console.log('📊 Creating import_pending_attachments table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.import_pending_attachments (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        board_id uuid NOT NULL,
        card_id uuid NOT NULL,
        original_name text NOT NULL,
        original_url text,
        original_type text,
        original_size integer,
        original_attachment_id text,
        uploaded_file_url text,
        import_source text NOT NULL DEFAULT 'unknown',
        resolved_at timestamp with time zone,
        resolved_by uuid,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT import_pending_attachments_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE,
        CONSTRAINT import_pending_attachments_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id)
      );
    `;
    console.log('✅ Import pending attachments table created\n');

    // 24. Custom fonts table
    console.log('📊 Creating custom_fonts table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.custom_fonts (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        font_url text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log('✅ Custom fonts table created\n');

    // 25. MySQL config table
    console.log('📊 Creating mysql_config table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.mysql_config (
        id text NOT NULL PRIMARY KEY DEFAULT 'default',
        db_host_encrypted text,
        db_name_encrypted text,
        db_user_encrypted text,
        db_password_encrypted text,
        iv text,
        verification_query text DEFAULT 'SELECT 1 FROM users WHERE email = ? LIMIT 1',
        is_configured boolean DEFAULT false,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      );
    `;
    console.log('✅ MySQL config table created\n');

    // Create indexes
    console.log('📊 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);',
      'CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider, provider_id);',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON public.refresh_tokens(token);',
      'CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);',
      'CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);',
      'CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON public.boards(workspace_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_members_board_id ON public.board_members(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON public.board_members(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_member_audit_log_board_id ON public.board_member_audit_log(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_invite_tokens_token ON public.board_invite_tokens(token);',
      'CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_member_custom_roles_board_id ON public.board_member_custom_roles(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_board_member_custom_roles_user_id ON public.board_member_custom_roles(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_columns_board_id ON public.columns(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_cards_column_id ON public.cards(column_id);',
      'CREATE INDEX IF NOT EXISTS idx_card_assignees_card_id ON public.card_assignees(card_id);',
      'CREATE INDEX IF NOT EXISTS idx_card_subtasks_card_id ON public.card_subtasks(card_id);',
      'CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON public.card_attachments(card_id);',
      'CREATE INDEX IF NOT EXISTS idx_labels_board_id ON public.labels(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_card_labels_card_id ON public.card_labels(card_id);',
      'CREATE INDEX IF NOT EXISTS idx_card_labels_label_id ON public.card_labels(label_id);',
      'CREATE INDEX IF NOT EXISTS idx_import_pending_assignees_board_id ON public.import_pending_assignees(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_import_pending_assignees_card_id ON public.import_pending_assignees(card_id);',
      'CREATE INDEX IF NOT EXISTS idx_import_pending_attachments_board_id ON public.import_pending_attachments(board_id);',
      'CREATE INDEX IF NOT EXISTS idx_import_pending_attachments_card_id ON public.import_pending_attachments(card_id);',
    ];

    for (const indexSql of indexes) {
      await prisma.$executeRawUnsafe(indexSql);
    }
    console.log('✅ Indexes created\n');

    // Ensure email_verified column exists
    console.log('📊 Ensuring email_verified column exists...');
    await prisma.$executeRaw`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email_verified'
        ) THEN
          ALTER TABLE public.users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `;
    console.log('✅ email_verified column verified\n');

    console.log('🔧 Regenerating Prisma client...\n');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\n✅ All database tables setup complete!');
    console.log('🔄 Restart your backend server for changes to take effect\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupAllTables();

