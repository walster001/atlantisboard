/**
 * Centralized type definitions for global objects and unknown types
 */

// Bun Runtime Types
declare global {
  interface BunGlobal {
    password: {
      hash(
        password: string,
        options?: {
          algorithm?: 'argon2id' | 'bcrypt' | 'scrypt';
          memoryCost?: number;
          timeCost?: number;
        }
      ): Promise<string>;
      verify(password: string, hash: string): Promise<boolean>;
    };
    Database: {
      open(connectionString: string): BunDatabase;
    };
  }

  interface BunDatabase {
    query(query: string, params?: unknown[]): unknown[];
    close(): void;
  }

  const Bun: BunGlobal;
}

// Express Request extension for authenticated requests
declare namespace Express {
  interface Request {
    user?: {
      id: string;
      email: string;
      username: string;
    };
  }
}

export {};

