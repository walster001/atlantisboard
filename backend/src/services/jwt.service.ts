import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { UnauthorizedError } from '../middleware/errorHandler.js';

export interface TokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

class JWTService {
  async generateAccessToken(userId: string, email: string): Promise<string> {
    const payload: TokenPayload = {
      userId,
      email,
      type: 'access',
    };

    const options = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    } as SignOptions;
    return jwt.sign(payload, env.JWT_SECRET, options);
  }

  async generateRefreshToken(userId: string, email: string): Promise<string> {
    const payload: TokenPayload = {
      userId,
      email,
      type: 'refresh',
    };

    const options = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    } as SignOptions;
    const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, options);

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      
      if (payload.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw error;
    }
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      // Check if token exists in database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token },
      });

      if (!storedToken) {
        throw new UnauthorizedError('Refresh token not found');
      }

      if (storedToken.expiresAt < new Date()) {
        // Clean up expired token
        await prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
        throw new UnauthorizedError('Refresh token expired');
      }

      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw error;
    }
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}

export const jwtService = new JWTService();

