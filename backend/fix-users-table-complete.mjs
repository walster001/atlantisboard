#!/usr/bin/env node
// Complete fix for users table issue
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: join(__dirname, '.env') });

const prisma = new PrismaClient();

async function fixUsersTable() {
  try {
    console.log('🔧 Complete fix for users table...\n');

    // 1. Test connection
    console.log('1️⃣  Testing database connection...');
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      console.log('   ✅ Connection successful\n');
    } catch (error) {
      console.error('   ❌ Connection failed:', error.message);
      console.error('\n💡 Check your DATABASE_URL in backend/.env');
      process.exit(1);
    }

    // 2. Check if users table exists
    console.log('2️⃣  Checking if users table exists...');
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists;
    `;
    
    const exists = Array.isArray(tableCheck) && tableCheck[0]?.exists === true;
    
    if (!exists) {
      console.log('   ❌ Table does not exist. Creating it...\n');
      
      // Create users table
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
      
      console.log('   ✅ Users table created\n');
      
      // Create index
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
      `);
      console.log('   ✅ Index created\n');
    } else {
      console.log('   ✅ Table exists\n');
      
      // Check structure
      console.log('   📊 Verifying table structure...');
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;
      
      const columnNames = Array.isArray(columns) ? columns.map(c => c.column_name) : [];
      console.log(`   Found ${columnNames.length} columns: ${columnNames.join(', ')}`);
      
      // Check for email_verified
      if (!columnNames.includes('email_verified')) {
        console.log('   ⚠️  email_verified column missing, adding it...');
        await prisma.$executeRawUnsafe(`
          ALTER TABLE public.users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
        `);
        console.log('   ✅ Column added\n');
      } else {
        console.log('   ✅ email_verified column exists\n');
      }
    }

    // 3. Test Prisma can access the table
    console.log('3️⃣  Testing Prisma access to users table...');
    try {
      const count = await prisma.user.count();
      console.log(`   ✅ Prisma can access table (${count} users)\n`);
    } catch (error) {
      console.error('   ❌ Prisma cannot access table:', error.message);
      console.log('\n   🔧 Regenerating Prisma client...\n');
      
      // Regenerate Prisma client
      execSync('npx prisma generate', { stdio: 'inherit' });
      
      // Test again
      console.log('\n   🔄 Testing again...');
      const count = await prisma.user.count();
      console.log(`   ✅ Prisma can now access table (${count} users)\n`);
    }

    // 4. Regenerate Prisma client to ensure sync
    console.log('4️⃣  Regenerating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('   ✅ Prisma client regenerated\n');

    // 5. Final test
    console.log('5️⃣  Final verification...');
    const finalTest = await prisma.user.findFirst({
      take: 1
    });
    console.log('   ✅ Prisma can query users table successfully\n');

    console.log('════════════════════════════════════════');
    console.log('✅ Users table fix complete!');
    console.log('════════════════════════════════════════');
    console.log('\n🔄 Restart your backend server:');
    console.log('   ./fix-and-start.sh\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixUsersTable();

