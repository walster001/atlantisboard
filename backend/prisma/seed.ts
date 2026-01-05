import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

// Get the backend directory (parent of prisma directory)
// When seed runs, __dirname will be backend/prisma, so parent is backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, '..');

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
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

/**
 * Ensure all database tables exist by running Prisma db push
 * This is idempotent and safe to run multiple times
 * Explicitly verifies critical tables like 'users' exist
 */
async function ensureTablesExist() {
  console.log('🔧 Ensuring all database tables exist...');
  
  try {
    // Use Prisma db push to sync schema to database
    // This creates all tables, indexes, and constraints from schema.prisma
    // --skip-generate: Skip generating Prisma Client (assumes it's already generated)
    // --accept-data-loss: Accept data loss if schema changes require it
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      stdio: 'inherit',
      cwd: backendDir,
    });
    console.log('✅ Prisma db push completed.\n');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error running prisma db push:', errorMessage);
    console.log('⚠️  Attempting to verify tables manually...\n');
  }
  
  // Explicitly verify critical tables exist
  const criticalTables = [
    'users',
    'profiles',
    'refresh_tokens',
    'app_settings',
    'custom_fonts',
    'board_themes',
  ];
  
  console.log('🔍 Verifying critical tables exist...');
  const missingTables: string[] = [];
  
  for (const table of criticalTables) {
    const exists = await tableExists(table);
    if (!exists) {
      missingTables.push(table);
      console.log(`  ⚠️  Table '${table}' is missing`);
    } else {
      console.log(`  ✅ Table '${table}' exists`);
    }
  }
  
  if (missingTables.length > 0) {
    console.error(`\n❌ Missing critical tables: ${missingTables.join(', ')}`);
    console.error('   Please run: cd backend && npx prisma db push');
    throw new Error(`Missing tables: ${missingTables.join(', ')}`);
  }
  
  console.log('✅ All critical tables verified.\n');
}

async function main() {
  console.log('🌱 Starting database seeding...\n');
  
  // First, ensure all tables exist
  await ensureTablesExist();
  
  console.log('📦 Seeding data...');

  // 1. Seed app_settings (required for app to function)
  // Source: supabase/migrations/20251218122201_7ce7bb8e-272b-4940-a3e5-4b2a1b7b122b.sql
  // Schema: backend/prisma/schema.prisma - AppSettings model
  // The migration only inserts the id='default' row, all other fields use schema defaults
  console.log('Seeding app_settings...');
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {}, // Don't update if exists
    create: { id: 'default' }, // All other fields use schema defaults
  });
  console.log('App settings seeded.');

  // 2. Seed board_themes (required for board creation dialog)
  // Source: supabase/migrations/20251220051910_c64dae24-206c-4b30-b44f-fa072ea8b38e.sql
  // Schema: backend/prisma/schema.prisma - BoardTheme model
  // Note: cardWindowButtonColor, cardWindowButtonTextColor, cardWindowButtonHoverColor,
  // cardWindowButtonHoverTextColor, and cardWindowIntelligentContrast use schema defaults
  // (they are not in the migration INSERT statement)
  console.log('Seeding default board themes...');
  const themes = [
    {
      name: 'Ocean Blue',
      isDefault: true,
      navbarColor: '#0079bf',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#0079bf',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Sunset Orange',
      isDefault: true,
      navbarColor: '#d29034',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#d29034',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Forest Green',
      isDefault: true,
      navbarColor: '#519839',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#519839',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Ruby Red',
      isDefault: true,
      navbarColor: '#b04632',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#b04632',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Royal Purple',
      isDefault: true,
      navbarColor: '#89609e',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#89609e',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Hot Pink',
      isDefault: true,
      navbarColor: '#cd5a91',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#cd5a91',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Mint Green',
      isDefault: true,
      navbarColor: '#4bbf6b',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#4bbf6b',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
    {
      name: 'Teal',
      isDefault: true,
      navbarColor: '#00aecc',
      columnColor: '#f4f5f7',
      defaultCardColor: null,
      cardWindowColor: '#ffffff',
      cardWindowTextColor: '#172b4d',
      homepageBoardColor: '#00aecc',
      boardIconColor: '#ffffff',
      scrollbarColor: '#c1c7cd',
      scrollbarTrackColor: '#f4f5f7',
    },
  ];

  // Insert themes, skipping if they already exist (based on name)
  // Note: Since name is not unique, we check manually to avoid duplicates
  for (const theme of themes) {
    const existing = await prisma.boardTheme.findFirst({
      where: { name: theme.name },
    });

    if (!existing) {
      await prisma.boardTheme.create({
        data: theme,
      });
    }
  }

  console.log(`Seeded ${themes.length} default board themes.`);
  
  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
