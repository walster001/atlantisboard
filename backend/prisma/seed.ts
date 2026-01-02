import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed app_settings (required for app to function)
  // Source: supabase/migrations/20251218122201_7ce7bb8e-272b-4040-a3e5-4b2a1b7b122b.sql
  console.log('Seeding app_settings...');
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {}, // Don't update if exists
    create: { id: 'default' }, // All other fields use schema defaults
  });
  console.log('App settings seeded.');

  // 2. Seed board_themes (required for board creation dialog)
  // Source: supabase/migrations/20251220051910_c64dae24-206c-4b30-b44f-fa072ea8b38e.sql
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
