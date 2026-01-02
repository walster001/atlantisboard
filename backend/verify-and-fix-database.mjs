#!/usr/bin/env node
// Verify database connection and fix missing tables
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function verifyAndFix() {
  try {
    console.log('🔍 Verifying database connection...\n');

    // Test connection
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful\n');

    // Check what tables exist
    console.log('📊 Checking existing tables...');
    const existingTables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tableNames = Array.isArray(existingTables) ? existingTables.map(t => t.table_name) : [];
    console.log('Existing tables:', tableNames.join(', ') || 'None');
    console.log('');

    // Required tables
    const requiredTables = [
      'users',
      'profiles',
      'refresh_tokens',
      'app_settings',
      'workspaces',
      'workspace_members',
      'board_themes',
      'boards',
      'board_members'
    ];

    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length > 0) {
      console.log(`❌ Missing tables: ${missingTables.join(', ')}\n`);
      console.log('🔧 Creating missing tables...\n');
      
      // Import and run the setup script
      const { setupAllTables } = await import('./setup-all-tables.mjs');
      // Actually, let's just create them directly here
      await createMissingTables(missingTables);
    } else {
      console.log('✅ All required tables exist\n');
    }

    // Verify users table structure
    console.log('📊 Verifying users table structure...');
    const usersColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    console.log('Users table columns:');
    if (Array.isArray(usersColumns)) {
      usersColumns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }
    console.log('');

    // Check for email_verified column
    const hasEmailVerified = Array.isArray(usersColumns) ? usersColumns.some(c => c.column_name === 'email_verified') : false;
    if (!hasEmailVerified) {
      console.log('⚠️  email_verified column missing, adding it...');
      await prisma.$executeRaw`
        ALTER TABLE public.users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
      `;
      console.log('✅ email_verified column added\n');
    }

    console.log('🔧 Regenerating Prisma client...\n');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\n✅ Database verification complete!');
    console.log('🔄 Restart your backend server for changes to take effect\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    
    // If users table doesn't exist, create it
    if (error.message.includes('does not exist') || error.message.includes('relation') && error.message.includes('users')) {
      console.log('\n🔧 Users table missing. Creating it now...\n');
      await createUsersTable();
      await createProfilesTable();
      await createRefreshTokensTable();
      
      console.log('🔧 Regenerating Prisma client...\n');
      execSync('npx prisma generate', { stdio: 'inherit' });
      
      console.log('\n✅ Basic tables created!');
      console.log('💡 Run ./setup-all-tables.sh to create all remaining tables\n');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function createUsersTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.users (
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
  console.log('✅ Users table created');
}

async function createProfilesTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.profiles (
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
  console.log('✅ Profiles table created');
}

async function createRefreshTokensTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.refresh_tokens (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL,
      token text NOT NULL UNIQUE,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
    );
  `;
  console.log('✅ Refresh tokens table created');
}

async function createMissingTables(missingTables) {
  // This would call the setup script logic
  // For now, just create the essential ones
  if (missingTables.includes('users')) {
    await createUsersTable();
  }
  if (missingTables.includes('profiles')) {
    await createProfilesTable();
  }
  if (missingTables.includes('refresh_tokens')) {
    await createRefreshTokensTable();
  }
}

verifyAndFix();

