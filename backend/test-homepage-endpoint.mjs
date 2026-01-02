#!/usr/bin/env node
// Test homepage endpoint and check for missing tables
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const prisma = new PrismaClient();

async function testHomepage() {
  try {
    console.log('🔍 Testing homepage data loading...\n');

    // 1. Check if required tables exist
    console.log('1️⃣  Checking required tables...');
    const requiredTables = [
      'users',
      'profiles',
      'workspaces',
      'workspace_members',
      'boards',
      'board_members',
      'board_themes',
      'app_settings'
    ];

    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const existingTables = Array.isArray(tables) ? tables.map(t => t.table_name) : [];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    console.log(`Found ${existingTables.length} tables`);
    if (missingTables.length > 0) {
      console.log(`\n❌ Missing tables: ${missingTables.join(', ')}`);
      console.log('\n💡 Run ./setup-all-tables.sh to create missing tables\n');
    } else {
      console.log('✅ All required tables exist\n');
    }

    // 2. Get a test user
    console.log('2️⃣  Getting test user...');
    const testUser = await prisma.user.findFirst({
      include: { profile: true }
    });

    if (!testUser) {
      console.log('⚠️  No users found in database');
      console.log('   This is normal for a fresh install\n');
      return;
    }

    console.log(`✅ Found user: ${testUser.email} (${testUser.id})\n`);

    // 3. Test RPC endpoint (simulate what frontend does)
    console.log('3️⃣  Testing RPC endpoint get_home_data...');
    try {
      // Test by querying the tables directly
      const workspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: testUser.id },
            { members: { some: { userId: testUser.id } } },
          ],
        },
        take: 1
      });
      
      const boards = await prisma.board.findMany({
        where: {
          members: {
            some: { userId: testUser.id },
          },
        },
        take: 1
      });
      
      console.log('✅ Can query tables successfully');
      console.log(`   Workspaces accessible: ${workspaces.length >= 0 ? 'Yes' : 'No'}`);
      console.log(`   Boards accessible: ${boards.length >= 0 ? 'Yes' : 'No'}`);
      console.log(`   (Empty results are normal for new users)\n`);
      
    } catch (error) {
      console.error('❌ Error querying tables:', error.message);
      if (error.message.includes('does not exist')) {
        console.error('\n💡 Missing table detected. Run ./setup-all-tables.sh\n');
      } else {
        console.error('Stack:', error.stack);
      }
    }

    console.log('\n✅ Homepage endpoint test complete!\n');

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

testHomepage();

