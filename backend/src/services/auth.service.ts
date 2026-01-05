import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import { passwordService } from './password.service.js';
import { jwtService } from './jwt.service.js';
import { mysqlVerificationService } from './mysql-verification.service.js';
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';
import { getErrorMessage, isTableMissingError } from '../lib/typeGuards.js';
import { z } from 'zod';

/**
 * Safely check if a table exists in the database
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

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

class AuthService {
  /**
   * Safely check if tables exist before querying
   */
  private async ensureTablesExist(): Promise<void> {
    const usersExists = await tableExists('users');
    const profilesExists = await tableExists('profiles');
    
    if (!usersExists || !profilesExists) {
      throw new Error(
        'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
      );
    }
  }

  /**
   * Check if this will be the first user in the system.
   * Should be called within a transaction to ensure atomicity.
   * Returns true if there are no existing profiles (this will be the first).
   */
  private async isFirstUser(tx: Prisma.TransactionClient): Promise<boolean> {
    try {
      const count = await tx.profile.count();
      return count === 0;
    } catch (error: unknown) {
      // If table doesn't exist or query fails, assume this is the first user
      if (isTableMissingError(error)) {
        return true;
      }
      throw error;
    }
  }

  /**
   * Idempotent: Ensure the first user (if only one exists) is an admin.
   * This handles the case where a user exists but wasn't made admin initially.
   * Should be called within a transaction to ensure atomicity.
   */
  private async ensureFirstUserIsAdmin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    try {
      const profileCount = await tx.profile.count();
      
      // If there's only one profile and it's this user, make them admin
      if (profileCount === 1) {
        await tx.profile.update({
          where: { id: userId },
          data: { isAdmin: true },
        });
      }
    } catch (error: unknown) {
      // Silently fail - this is a best-effort operation
      // Don't throw as this is idempotent and non-critical
      console.warn('[AuthService] Could not ensure first user is admin:', getErrorMessage(error));
    }
  }

  async signUp(data: z.infer<typeof signUpSchema>) {
    const validated = signUpSchema.parse(data);

    // Ensure tables exist before querying
    await this.ensureTablesExist();

    // Check if user already exists
    let existingUser;
    try {
      existingUser = await prisma.user.findUnique({
        where: { email: validated.email },
      });
    } catch (error: unknown) {
      if (isTableMissingError(error)) {
        throw new Error(
          'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
        );
      }
      throw error;
    }

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await passwordService.hash(validated.password);

    // Create user and profile in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: validated.email,
          passwordHash,
          provider: 'email',
          emailVerified: false,
        },
      });

      // Check if this is the first user - make them an admin
      const isFirst = await this.isFirstUser(tx);

      const profile = await tx.profile.create({
        data: {
          id: user.id,
          email: validated.email,
          fullName: validated.fullName,
          isAdmin: isFirst,
        },
      });

      // Idempotent: If this is the only user and somehow not admin, make them admin
      await this.ensureFirstUserIsAdmin(tx, user.id);

      return { user, profile };
    });

    // Generate tokens
    const accessToken = await jwtService.generateAccessToken(
      result.user.id,
      result.user.email
    );
    const refreshToken = await jwtService.generateRefreshToken(
      result.user.id,
      result.user.email
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.profile.fullName,
        isAdmin: result.profile.isAdmin,
      },
      accessToken,
      refreshToken,
    };
  }

  async signIn(data: z.infer<typeof signInSchema>) {
    const validated = signInSchema.parse(data);

    // Ensure tables exist before querying
    await this.ensureTablesExist();

    // Find user
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: validated.email },
        include: { profile: true },
      });
    } catch (error: unknown) {
      if (isTableMissingError(error)) {
        throw new Error(
          'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
        );
      }
      throw error;
    }

    // Idempotent: If this is the only user and not admin, make them admin
    if (user && user.profile) {
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await this.ensureFirstUserIsAdmin(tx, user.id);
        });
        // Refresh user data after potential admin update
        user = await prisma.user.findUnique({
          where: { email: validated.email },
          include: { profile: true },
        });
      } catch (error: unknown) {
        // Silently fail - this is best-effort
        console.warn('[AuthService] Could not ensure first user is admin on signin:', getErrorMessage(error));
      }
    }

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isValid = await passwordService.verify(validated.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const accessToken = await jwtService.generateAccessToken(user.id, user.email);
    const refreshToken = await jwtService.generateRefreshToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.profile?.fullName ?? null,
        isAdmin: user.profile?.isAdmin ?? false,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshToken: string) {
    const payload = await jwtService.verifyRefreshToken(refreshToken);

    // Ensure tables exist before querying
    await this.ensureTablesExist();

    // Get user
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { profile: true },
      });
    } catch (error: unknown) {
      if (isTableMissingError(error)) {
        throw new Error(
          'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
        );
      }
      throw error;
    }

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Generate new tokens
    const accessToken = await jwtService.generateAccessToken(user.id, user.email);
    const newRefreshToken = await jwtService.generateRefreshToken(user.id, user.email);

    // Revoke old refresh token
    await jwtService.revokeRefreshToken(refreshToken);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async signOut(refreshToken: string) {
    await jwtService.revokeRefreshToken(refreshToken);
  }

  async signOutAll(userId: string) {
    await jwtService.revokeAllUserTokens(userId);
  }

  async verifyEmailForGoogleAuth(email: string): Promise<{ verified: boolean; message?: string }> {
    // Check app settings for login style
    let settings;
    try {
      settings = await prisma.appSettings.findUnique({
        where: { id: 'default' },
      });
    } catch (error: unknown) {
      // If tables don't exist, default to allowing all (for initial setup)
      if (isTableMissingError(error)) {
        return { verified: true };
      }
      throw error;
    }

    if (settings?.loginStyle !== 'google_verified') {
      // Not in verified mode, allow all
      return { verified: true };
    }

    // Verify against MySQL
    return mysqlVerificationService.verifyEmail(email);
  }

  async findOrCreateGoogleUser(googleId: string, email: string, name?: string, avatarUrl?: string) {
    // Ensure tables exist before querying
    await this.ensureTablesExist();

    // Check if user exists by provider ID
    let user;
    try {
      user = await prisma.user.findFirst({
        where: {
          provider: 'google',
          providerId: googleId,
        },
        include: { profile: true },
      });
    } catch (error: unknown) {
      if (isTableMissingError(error)) {
        throw new Error(
          'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
        );
      }
      throw error;
    }

    if (user) {
      // Idempotent: If this is the only user and not admin, make them admin
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await this.ensureFirstUserIsAdmin(tx, user.id);
        });
        // Refresh user data after potential admin update
        user = await prisma.user.findFirst({
          where: {
            provider: 'google',
            providerId: googleId,
          },
          include: { profile: true },
        });
      } catch (error: unknown) {
        // Silently fail - this is best-effort
        console.warn('[AuthService] Could not ensure first user is admin:', getErrorMessage(error));
      }

      // Update profile if needed
      if (name || avatarUrl) {
        await prisma.profile.update({
          where: { id: user.id },
          data: {
            fullName: name ?? undefined,
            avatarUrl: avatarUrl ?? undefined,
          },
        });
      }

      // Generate tokens
      const accessToken = await jwtService.generateAccessToken(user.id, user.email);
      const refreshToken = await jwtService.generateRefreshToken(user.id, user.email);

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.profile?.fullName ?? null,
          isAdmin: user.profile?.isAdmin ?? false,
        },
        accessToken,
        refreshToken,
      };
    }

    // Check if user exists by email (might have signed up with email first)
    try {
      user = await prisma.user.findUnique({
        where: { email },
        include: { profile: true },
      });
    } catch (error: unknown) {
      if (isTableMissingError(error)) {
        throw new Error(
          'Database tables do not exist. Please run: cd backend && npm run prisma:seed'
        );
      }
      throw error;
    }

    if (user) {
      // Idempotent: If this is the only user and not admin, make them admin
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await this.ensureFirstUserIsAdmin(tx, user.id);
        });
        // Refresh user data after potential admin update
        user = await prisma.user.findUnique({
          where: { email },
          include: { profile: true },
        });
      } catch (error: unknown) {
        // Silently fail - this is best-effort
        console.warn('[AuthService] Could not ensure first user is admin:', getErrorMessage(error));
      }

      // Link Google account
      await prisma.user.update({
        where: { id: user.id },
        data: {
          provider: 'google',
          providerId: googleId,
          emailVerified: true,
        },
      });

      // Update profile
      if (name || avatarUrl) {
        await prisma.profile.update({
          where: { id: user.id },
          data: {
            fullName: name ?? undefined,
            avatarUrl: avatarUrl ?? undefined,
          },
        });
      }

      const accessToken = await jwtService.generateAccessToken(user.id, user.email);
      const refreshToken = await jwtService.generateRefreshToken(user.id, user.email);

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.profile?.fullName ?? null,
          isAdmin: user.profile?.isAdmin ?? false,
        },
        accessToken,
        refreshToken,
      };
    }

    // Create new user
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: {
          email,
          provider: 'google',
          providerId: googleId,
          emailVerified: true,
        },
      });

      // Check if this is the first user - make them an admin
      const isFirst = await this.isFirstUser(tx);

      const profile = await tx.profile.create({
        data: {
          id: newUser.id,
          email,
          fullName: name,
          avatarUrl: avatarUrl,
          isAdmin: isFirst,
        },
      });

      // Idempotent: If this is the only user and somehow not admin, make them admin
      await this.ensureFirstUserIsAdmin(tx, newUser.id);

      return { user: newUser, profile };
    });

    const accessToken = await jwtService.generateAccessToken(result.user.id, result.user.email);
    const refreshToken = await jwtService.generateRefreshToken(result.user.id, result.user.email);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.profile.fullName,
        isAdmin: result.profile.isAdmin,
      },
      accessToken,
      refreshToken,
    };
  }
}

export const authService = new AuthService();

