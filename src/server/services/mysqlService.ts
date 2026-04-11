import { SQL } from 'bun';
import { AdminConfig } from '../models/AdminConfig.js';
import { decrypt } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  verificationQuery: string;
}

export const DEFAULT_VERIFICATION_QUERY = 'SELECT 1 FROM users WHERE email = ? LIMIT 1';

export function splitMysqlHostInput(raw: string, defaultPort: number): { host: string; port: number } {
  const t = raw.trim();
  const lastColon = t.lastIndexOf(':');
  if (lastColon > 0) {
    const maybePort = t.slice(lastColon + 1);
    if (/^\d{1,5}$/.test(maybePort)) {
      return { host: t.slice(0, lastColon), port: Number(maybePort) };
    }
  }
  return { host: t, port: defaultPort };
}

export function validateVerificationSql(raw: string): string | null {
  const q = raw.trim();
  if (q.length === 0) {
    return 'Verification query is required';
  }
  const withoutTrailingSemicolon = q.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return 'Only a single SQL statement is allowed';
  }
  if (!/^\s*select\b/i.test(withoutTrailingSemicolon)) {
    return 'Query must be a SELECT statement';
  }
  const lower = withoutTrailingSemicolon.toLowerCase();
  if (lower.includes('--') || lower.includes('/*')) {
    return 'Comments are not allowed in the verification query';
  }
  const placeholders = (withoutTrailingSemicolon.match(/\?/g) ?? []).length;
  if (placeholders !== 1) {
    return 'Use exactly one ? placeholder for the user email';
  }
  return null;
}

function buildMysqlUrl(cfg: Pick<MySQLConfig, 'host' | 'port' | 'database' | 'username' | 'password'>): string {
  const u = encodeURIComponent(cfg.username);
  const p = encodeURIComponent(cfg.password);
  return `mysql://${u}:${p}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

export async function decryptOptionalCredential(value: string): Promise<string> {
  if (!value) {
    return value;
  }
  try {
    return await decrypt(value);
  } catch {
    return value;
  }
}

export async function getMySQLConfig(): Promise<MySQLConfig | null> {
  try {
    const config = await AdminConfig.findOne();
    if (!config || !config.externalMySQL.enabled) {
      return null;
    }

    if (!config.externalMySQL.host || !config.externalMySQL.database) {
      logger.warn('External MySQL is enabled but connection details are missing');
      return null;
    }

    let username = config.externalMySQL.username || '';
    let password = config.externalMySQL.password || '';

    username = await decryptOptionalCredential(username);
    password = await decryptOptionalCredential(password);

    const parsed = splitMysqlHostInput(
      config.externalMySQL.host,
      config.externalMySQL.port || 3306
    );

    let verificationQuery = (
      config.externalMySQL.verificationQuery || DEFAULT_VERIFICATION_QUERY
    ).trim();
    verificationQuery = await decryptOptionalCredential(verificationQuery);
    const vErr = validateVerificationSql(verificationQuery);
    if (vErr) {
      logger.warn({ vErr }, 'Invalid verification SQL in admin config');
      return null;
    }

    return {
      host: parsed.host,
      port: parsed.port,
      database: config.externalMySQL.database,
      username,
      password,
      verificationQuery,
    };
  } catch (error) {
    logger.error({ error }, 'Error getting MySQL config');
    return null;
  }
}

/**
 * Returns true if the email matches the configured verification query (at least one row).
 */
export async function verifyUserInMySQL(email: string): Promise<boolean> {
  const config = await getMySQLConfig();
  if (!config) {
    return false;
  }

  try {
    const url = buildMysqlUrl(config);
    const mysql = new SQL(url);
    const result = await mysql.unsafe(config.verificationQuery, [email]);
    const rows = normalizeSqlRows(result);
    return rows.length > 0;
  } catch (error) {
    logger.error({ error, email }, 'Error verifying user in external MySQL');
    return false;
  }
}

function normalizeSqlRows(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result && typeof result === 'object' && 'rows' in result) {
    const r = (result as { rows: unknown }).rows;
    return Array.isArray(r) ? r : [];
  }
  return [];
}

export interface TestMySQLInput {
  host: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  verificationQuery?: string;
}

export async function testExternalMySQLConnection(input: TestMySQLInput): Promise<{
  ok: boolean;
  message: string;
}> {
  const parsed = splitMysqlHostInput(input.host, input.port ?? 3306);
  const queryText = (input.verificationQuery || DEFAULT_VERIFICATION_QUERY).trim();
  const vErr = validateVerificationSql(queryText);
  if (vErr) {
    return { ok: false, message: vErr };
  }

  const cfg: MySQLConfig = {
    host: parsed.host,
    port: parsed.port,
    database: input.database,
    username: input.username,
    password: input.password,
    verificationQuery: queryText,
  };

  try {
    const url = buildMysqlUrl(cfg);
    const mysql = new SQL(url);
    await mysql`SELECT 1 AS ping`;
    await mysql.unsafe(queryText, ['__kanboard_connection_test__@invalid.local']);
    return { ok: true, message: 'Connection successful. Verification query executed.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    logger.warn({ error, host: cfg.host }, 'External MySQL test connection failed');
    return { ok: false, message };
  }
}
