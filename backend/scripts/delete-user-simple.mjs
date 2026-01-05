/**
 * Simple script to delete a user - uses the email hardcoded below
 * Run in WSL: node scripts/delete-user-simple.mjs
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const email = 'matthewwaldhuter@gmail.com';

async function deleteUser() {
  try {
    console.log(`Looking for user with email: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      console.log(`✅ User with email ${email} not found. Already deleted or doesn't exist.`);
      return;
    }

    console.log(`Found user: ${user.id}`);
    if (user.profile) {
      console.log(`  Profile ID: ${user.profile.id}`);
      console.log(`  Full Name: ${user.profile.fullName || 'N/A'}`);
      console.log(`  Is Admin: ${user.profile.isAdmin}`);
    }

    // Delete refresh tokens first
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });
    console.log(`  Deleted ${deletedTokens.count} refresh token(s)`);

    // Delete the user (cascades to profile)
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`✅ Successfully deleted user ${email} and their profile`);
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteUser().catch(console.error);

