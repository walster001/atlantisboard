/**
 * Admin Routes - Admin-only operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { prisma } from '../db/client.js';
import { z } from 'zod';
import { permissionService } from '../lib/permissions/service.js';
import { mysqlVerificationService } from '../services/mysql-verification.service.js';
import mysql from 'mysql2/promise';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

const saveMysqlConfigSchema = z.object({
  db_host: z.string().min(1),
  db_name: z.string().min(1),
  db_user: z.string().min(1),
  db_password: z.string().min(1),
  verification_query: z.string().optional(),
});

const testMysqlConnectionSchema = z.object({
  db_host: z.string().min(1),
  db_name: z.string().min(1),
  db_user: z.string().min(1),
  db_password: z.string().min(1),
  verification_query: z.string().optional(),
});

/**
 * POST /api/admin/mysql-config
 * Save MySQL configuration (encrypted)
 */
router.post('/mysql-config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check admin permission
    const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false);
    await permissionService.requirePermission('app.admin.access', context);

    const validated = saveMysqlConfigSchema.parse(req.body);
    const { db_host, db_name, db_user, db_password, verification_query } = validated;

    // Validate verification query - must contain email placeholder
    const query = verification_query || 'SELECT 1 FROM users WHERE email = ? LIMIT 1';
    if (!query.includes('?')) {
      throw new ValidationError('Verification query must contain ? placeholder for email');
    }

    // Encrypt credentials using the MySQL verification service
    const encrypted = await mysqlVerificationService.encryptCredentials({
      db_host,
      db_name,
      db_user,
      db_password,
    });

    // Save to database
    await prisma.mysqlConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        dbHostEncrypted: encrypted.db_host_encrypted,
        dbNameEncrypted: encrypted.db_name_encrypted,
        dbUserEncrypted: encrypted.db_user_encrypted,
        dbPasswordEncrypted: encrypted.db_password_encrypted,
        verificationQuery: query,
        iv: encrypted.iv,
        isConfigured: true,
      },
      update: {
        dbHostEncrypted: encrypted.db_host_encrypted,
        dbNameEncrypted: encrypted.db_name_encrypted,
        dbUserEncrypted: encrypted.db_user_encrypted,
        dbPasswordEncrypted: encrypted.db_password_encrypted,
        verificationQuery: query,
        iv: encrypted.iv,
        isConfigured: true,
        updatedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/mysql-config/test
 * Test MySQL connection
 */
router.post('/mysql-config/test', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check admin permission
    const context = permissionService.buildContext(req.userId!, req.user?.isAdmin ?? false);
    await permissionService.requirePermission('app.admin.access', context);

    const validated = testMysqlConnectionSchema.parse(req.body);
    const { db_host, db_name, db_user, db_password, verification_query } = validated;

    // Parse host and port
    let hostname = db_host;
    let port = 3306;
    if (db_host.includes(':')) {
      const parts = db_host.split(':');
      hostname = parts[0];
      port = parseInt(parts[1], 10);
    }

    // Attempt MySQL connection
    let connection: mysql.Connection | null = null;
    
    try {
      connection = await mysql.createConnection({
        host: hostname,
        port,
        user: db_user,
        password: db_password,
        database: db_name,
        connectTimeout: 10000, // 10 second timeout
      });

      // Simple query to verify connection
      await connection.query('SELECT 1');
      
      // If verification query is provided, test it too
      let queryTestResult: { success: boolean; message: string } | null = null;
      if (verification_query) {
        try {
          // Replace ? with a test email to validate query syntax
          const testQuery = verification_query.replace('?', "'test@example.com'");
          await connection.query(testQuery);
          queryTestResult = { success: true, message: 'Verification query executed successfully.' };
        } catch (queryError: any) {
          const queryErrorStr = String(queryError);
          let queryErrorMsg = 'Verification query failed';
          
          if (queryErrorStr.includes("doesn't exist")) {
            queryErrorMsg = 'Table or column in query does not exist.';
          } else if (queryErrorStr.includes('syntax')) {
            queryErrorMsg = 'SQL syntax error in verification query.';
          } else {
            queryErrorMsg = `Query error: ${queryErrorStr.substring(0, 100)}`;
          }
          queryTestResult = { success: false, message: queryErrorMsg };
        }
      }
      
      await connection.end();
      
      // Build response message
      let message = 'Connection successful! Database is reachable.';
      if (queryTestResult) {
        if (queryTestResult.success) {
          message += ' Verification query is valid.';
        } else {
          message = `Connection successful, but verification query failed: ${queryTestResult.message}`;
        }
      }
      
      res.json({
        success: queryTestResult ? queryTestResult.success : true,
        connection_success: true,
        query_success: queryTestResult?.success ?? null,
        message,
      });
    } catch (mysqlError: any) {
      if (connection) {
        await connection.end();
      }
      
      let errorMessage = 'Connection failed';
      const errorString = String(mysqlError);
      
      if (errorString.includes('Access denied')) {
        errorMessage = 'Access denied. Check username and password.';
      } else if (errorString.includes('Unknown database')) {
        errorMessage = `Database "${db_name}" does not exist.`;
      } else if (errorString.includes('ETIMEDOUT') || errorString.includes('timeout')) {
        errorMessage = 'Connection timed out. Check host address and firewall settings.';
      } else if (errorString.includes('ENOTFOUND') || errorString.includes('getaddrinfo')) {
        errorMessage = 'Host not found. Check the database host address.';
      } else if (errorString.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused. Check if MySQL is running and port is correct.';
      } else {
        errorMessage = `Connection failed: ${errorString.substring(0, 100)}`;
      }
      
      res.json({
        success: false,
        message: errorMessage,
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;

