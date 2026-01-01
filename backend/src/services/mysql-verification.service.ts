import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';

class MySQLVerificationService {
  private async encryptData(data: string, keyHex: string): Promise<{ encrypted: string; iv: string }> {
    const keyBytes = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    // Append auth tag to encrypted data (matching Web Crypto API behavior)
    const encryptedWithTag = Buffer.concat([encrypted, authTag]);
    
    return {
      encrypted: encryptedWithTag.toString('base64'),
      iv: iv.toString('base64'),
    };
  }

  async encryptCredentials(credentials: {
    db_host: string;
    db_name: string;
    db_user: string;
    db_password: string;
  }): Promise<{
    db_host_encrypted: string;
    db_name_encrypted: string;
    db_user_encrypted: string;
    db_password_encrypted: string;
    iv: string;
  }> {
    if (!env.MYSQL_ENCRYPTION_KEY) {
      throw new Error('MYSQL_ENCRYPTION_KEY not configured');
    }

    // Encrypt all fields with same IV for simplicity
    const { encrypted: hostEncrypted, iv } = await this.encryptData(credentials.db_host, env.MYSQL_ENCRYPTION_KEY);
    const { encrypted: nameEncrypted } = await this.encryptData(credentials.db_name, env.MYSQL_ENCRYPTION_KEY);
    const { encrypted: userEncrypted } = await this.encryptData(credentials.db_user, env.MYSQL_ENCRYPTION_KEY);
    const { encrypted: passwordEncrypted } = await this.encryptData(credentials.db_password, env.MYSQL_ENCRYPTION_KEY);

    return {
      db_host_encrypted: hostEncrypted,
      db_name_encrypted: nameEncrypted,
      db_user_encrypted: userEncrypted,
      db_password_encrypted: passwordEncrypted,
      iv,
    };
  }

  private async decryptData(
    encryptedBase64: string,
    ivBase64: string,
    keyHex: string
  ): Promise<string> {
    // Web Crypto API (used in original encryption) appends the auth tag to the ciphertext
    // Node.js crypto requires the auth tag to be set separately
    const keyBytes = Buffer.from(keyHex, 'hex');
    const encryptedWithTag = Buffer.from(encryptedBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');

    // AES-GCM auth tag is always 16 bytes and is appended to the ciphertext by Web Crypto API
    const authTagLength = 16;
    if (encryptedWithTag.length < authTagLength) {
      throw new Error('Invalid encrypted data: too short');
    }

    // Extract auth tag (last 16 bytes) and ciphertext (everything else)
    const encrypted = encryptedWithTag.slice(0, -authTagLength);
    const authTag = encryptedWithTag.slice(-authTagLength);

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  async verifyEmail(email: string): Promise<{ verified: boolean; message?: string }> {
    if (!env.MYSQL_ENCRYPTION_KEY) {
      return { verified: false, message: 'MySQL verification not configured' };
    }

    try {
      // Get MySQL config from database
      const config = await prisma.mysqlConfig.findUnique({
        where: { id: 'default' },
      });

      if (!config || !config.isConfigured) {
        return { verified: false, message: 'MySQL verification not configured' };
      }

      if (!config.dbHostEncrypted || !config.iv) {
        return { verified: false, message: 'MySQL configuration incomplete' };
      }

      // Decrypt credentials
      const dbHost = await this.decryptData(
        config.dbHostEncrypted,
        config.iv,
        env.MYSQL_ENCRYPTION_KEY
      );
      const dbName = await this.decryptData(
        config.dbNameEncrypted!,
        config.iv,
        env.MYSQL_ENCRYPTION_KEY
      );
      const dbUser = await this.decryptData(
        config.dbUserEncrypted!,
        config.iv,
        env.MYSQL_ENCRYPTION_KEY
      );
      const dbPassword = await this.decryptData(
        config.dbPasswordEncrypted!,
        config.iv,
        env.MYSQL_ENCRYPTION_KEY
      );

      // Connect to MySQL
      const connection = await mysql.createConnection({
        host: dbHost,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        connectTimeout: 10000,
      });

      try {
        // Execute verification query
        const query = config.verificationQuery || 'SELECT 1 FROM users WHERE email = ? LIMIT 1';
        const [rows] = await connection.execute(query, [email]);

        const verified = Array.isArray(rows) && rows.length > 0;

        await connection.end();

        return {
          verified,
          message: verified ? 'User verified' : 'User does not exist in database',
        };
      } catch (queryError) {
        await connection.end();
        console.error('MySQL query error:', queryError);
        return { verified: false, message: 'Database verification failed' };
      }
    } catch (error) {
      console.error('MySQL verification error:', error);
      return { verified: false, message: 'Verification service error' };
    }
  }
}

export const mysqlVerificationService = new MySQLVerificationService();

