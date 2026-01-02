#!/usr/bin/env node
// Fix emailVerified column using Prisma
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function fixEmailVerified() {
  try {
    console.log('🔧 Checking database schema...\n');

    // Check if column exists by trying to query it
    try {
      await prisma.$queryRaw`
        SELECT email_verified FROM users LIMIT 1;
      `;
      console.log('✅ email_verified column already exists');
    } catch (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Column missing. Adding email_verified column...\n');
        
        // Add the column
        await prisma.$executeRaw`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
        `;
        
        console.log('✅ Column added successfully\n');
      } else {
        throw error;
      }
    }

    console.log('🔧 Regenerating Prisma client...\n');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\n✅ Database schema fixed!');
    console.log('🔄 Restart your backend server for changes to take effect\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmailVerified();

