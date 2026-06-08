/**
 * Centralized type definitions for global objects and unknown types
 */

// Bun Runtime Types
declare global {
  /** iOS Safari home-screen web app flag (non-standard; not on the default TS `Navigator`). */
  interface Navigator {
    readonly standalone?: boolean;
  }

  interface BunCsrfApi {
    generate: (secret: string, options: { encoding: string; expiresIn: number }) => string;
    verify: (
      token: string,
      options: { secret: string; encoding: string; maxAge: number },
    ) => boolean;
  }

  /** Bun built-in SQL client (MySQL, PostgreSQL, SQLite). */
  interface BunSqlClient {
    unsafe<T = unknown>(query: string, values?: readonly unknown[]): Promise<T>;
    close(options?: { timeout?: number }): Promise<void>;
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  }

  interface BunSqlConstructor {
    new (connectionString: string | URL): BunSqlClient;
  }

  interface BunGlobal {
    file(arg0: string): unknown;
    CSRF?: BunCsrfApi;
    SQL: BunSqlConstructor;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- namespace augments express
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

