#!/usr/bin/env node
// Check database state and connection
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: join(__dirname, '.env') });

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database state...\n');
    
    // Check DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL not set in .env file');
      process.exit(1);
    }
    
    // Mask password in URL for display
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`📊 Database URL: ${maskedUrl}\n`);

    // Test connection
    console.log('🔌 Testing database connection...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful\n');

    // Check what tables exist
    console.log('📊 Checking existing tables...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tableNames = Array.isArray(tables) ? tables.map(t => t.table_name) : [];
    console.log(`Found ${tableNames.length} tables:`);
    tableNames.forEach(name => console.log(`  - ${name}`));
    console.log('');

    // Check if users table exists
    const usersExists = tableNames.includes('users');
    if (usersExists) {
      console.log('✅ users table exists');
      
      // Check users table structure
      console.log('\n📊 Checking users table structure...');
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;
      
      console.log('Columns:');
      if (Array.isArray(columns)) {
        columns.forEach(col => {
          console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
        });
      }
      
      // Check for email_verified
      const hasEmailVerified = Array.isArray(columns) && columns.some(c => c.column_name === 'email_verified');
      if (!hasEmailVerified) {
        console.log('\n⚠️  email_verified column missing!');
      } else {
        console.log('\n✅ email_verified column exists');
      }
    } else {
      console.log('❌ users table does NOT exist');
      console.log('\n💡 Run ./create-tables-safely.sh to create it');
    }

    // Check Prisma schema mapping
    console.log('\n📊 Checking Prisma schema...');
    const schemaPath = join(__dirname, 'prisma', 'schema.prisma');
    const fs = await import('fs');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    if (schema.includes('model User')) {
      console.log('✅ User model found in schema');
      if (schema.includes('@@map("users")')) {
        console.log('✅ Table mapping configured (users)');
      } else {
        console.log('⚠️  Table mapping not found');
      }
      if (schema.includes('emailVerified') && schema.includes('@map("email_verified")')) {
        console.log('✅ emailVerified field mapping configured');
      } else {
        console.log('⚠️  emailVerified field mapping may be missing');
      }
    }

    console.log('\n✅ Database check complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'P1001') {
      console.error('\n💡 Cannot reach database server. Check:');
      console.error('   1. Database server is running');
      console.error('   2. DATABASE_URL in .env is correct');
      console.error('   3. Network/firewall allows connection');
    } else if (error.code === 'P1000') {
      console.error('\n💡 Authentication failed. Check DATABASE_URL credentials');
    } else if (error.message.includes('does not exist')) {
      console.error('\n💡 Table missing. Run ./create-tables-safely.sh');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();

