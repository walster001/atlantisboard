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

