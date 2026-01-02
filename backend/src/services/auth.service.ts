import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';
import { passwordService } from './password.service.js';
import { jwtService } from './jwt.service.js';
import { mysqlVerificationService } from './mysql-verification.service.js';
import { ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';
import { z } from 'zod';

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
   * Check if this will be the first user in the system.
   * Should be called within a transaction to ensure atomicity.
   */
  private async isFirstUser(tx: Prisma.TransactionClient): Promise<boolean> {
    const count = await tx.profile.count();
    return count === 0;
  }

  async signUp(data: z.infer<typeof signUpSchema>) {
    const validated = signUpSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

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

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      include: { profile: true },
    });

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

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { profile: true },
    });

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
    const settings = await prisma.appSettings.findUnique({
      where: { id: 'default' },
    });

    if (settings?.loginStyle !== 'google_verified') {
      // Not in verified mode, allow all
      return { verified: true };
    }

    // Verify against MySQL
    return mysqlVerificationService.verifyEmail(email);
  }

  async findOrCreateGoogleUser(googleId: string, email: string, name?: string, avatarUrl?: string) {
    // Check if user exists by provider ID
    let user = await prisma.user.findFirst({
      where: {
        provider: 'google',
        providerId: googleId,
      },
      include: { profile: true },
    });

    if (user) {
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
    user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (user) {
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

