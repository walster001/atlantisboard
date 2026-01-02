/**
 * Script to delete a user from the database
 * Usage: node scripts/delete-user.mjs <email>
 * 
 * This script will:
 * 1. Find the user by email
 * 2. Delete the user (which will cascade delete the profile due to onDelete: Cascade)
 * 3. Also delete any refresh tokens for that user
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in backend directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/delete-user.mjs <email>');
  process.exit(1);
}

async function deleteUser() {
  try {
    console.log(`Looking for user with email: ${email}`);
    
    // First, find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      console.log(`User with email ${email} not found.`);
      process.exit(0);
    }

    console.log(`Found user: ${user.id}`);
    if (user.profile) {
      console.log(`  Profile ID: ${user.profile.id}`);
      console.log(`  Full Name: ${user.profile.fullName || 'N/A'}`);
      console.log(`  Is Admin: ${user.profile.isAdmin}`);
    }

    // Delete refresh tokens first (they have foreign key to user)
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });
    console.log(`  Deleted ${deletedTokens.count} refresh token(s)`);

    // Delete the user (this will cascade delete the profile)
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`✅ Successfully deleted user ${email} and their profile`);
  } catch (error) {
    console.error('Error deleting user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteUser();

