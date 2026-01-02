#!/usr/bin/env node
// Setup complete database schema using Prisma
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function setupSchema() {
  try {
    console.log('🔧 Setting up database schema...\n');

    // Create profiles table
    console.log('📊 Creating profiles table...');
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
    console.log('✅ Profiles table created\n');

    // Create refresh_tokens table
    console.log('📊 Creating refresh_tokens table...');
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
    console.log('✅ Refresh tokens table created\n');

    // Create users table if it doesn't exist
    console.log('📊 Ensuring users table exists...');
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
    console.log('✅ Users table verified\n');

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

    // Create indexes (one at a time)
    console.log('📊 Creating indexes...');
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider, provider_id);
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON public.refresh_tokens(token);
    `;
    console.log('✅ Indexes created\n');

    console.log('🔧 Regenerating Prisma client...\n');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\n✅ Database schema setup complete!');
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

setupSchema();

