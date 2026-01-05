#!/usr/bin/env node
// Safely create tables by checking existence first
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function tableExists(tableName) {
  try {
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists;
    `;
    return Array.isArray(result) && result[0]?.exists === true;
  } catch {
    return false;
  }
}

async function createTablesSafely() {
  try {
    console.log('🔧 Creating database tables safely...\n');

    // Users table
    if (!(await tableExists('users'))) {
      console.log('📊 Creating users table...');
      await prisma.$executeRawUnsafe(`
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
      `);
      console.log('✅ Users table created\n');
    } else {
      console.log('✅ Users table already exists\n');
    }

    // Profiles table
    const profilesExists = await tableExists('profiles');
    const usersExists = await tableExists('users');
    
    if (!profilesExists && usersExists) {
      console.log('📊 Creating profiles table...');
      await prisma.$executeRawUnsafe(`
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
      `);
      console.log('✅ Profiles table created\n');
    } else if (profilesExists) {
      console.log('✅ Profiles table already exists\n');
    }

    // Refresh tokens table
    const refreshTokensExists = await tableExists('refresh_tokens');
    
    if (!refreshTokensExists && usersExists) {
      console.log('📊 Creating refresh_tokens table...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE public.refresh_tokens (
          id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id uuid NOT NULL,
          token text NOT NULL UNIQUE,
          expires_at timestamp with time zone NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Refresh tokens table created\n');
    } else if (refreshTokensExists) {
      console.log('✅ Refresh tokens table already exists\n');
    }

    // Ensure email_verified column exists
    if (usersExists) {
      console.log('📊 Checking email_verified column...');
      const columns = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        AND column_name = 'email_verified';
      `;
      
      if (!Array.isArray(columns) || columns.length === 0) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE public.users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
        `);
        console.log('✅ email_verified column added\n');
      } else {
        console.log('✅ email_verified column exists\n');
      }
    }

    // Create indexes
    console.log('📊 Creating indexes...');
    const indexes = [
      { name: 'idx_users_email', sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);' },
      { name: 'idx_users_provider', sql: 'CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider, provider_id);' },
      { name: 'idx_refresh_tokens_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);' },
      { name: 'idx_refresh_tokens_token', sql: 'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON public.refresh_tokens(token);' },
    ];

    for (const index of indexes) {
      try {
        await prisma.$executeRawUnsafe(index.sql);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.log(`⚠️  Could not create index ${index.name}: ${error.message}`);
        }
      }
    }
    console.log('✅ Indexes created\n');

    console.log('🔧 Regenerating Prisma client...\n');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\n✅ Essential tables setup complete!');
    console.log('💡 Run ./setup-all-tables.sh to create remaining tables (workspaces, boards, etc.)\n');

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

createTablesSafely();

