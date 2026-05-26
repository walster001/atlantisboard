import type { Router } from 'express';
import { z } from 'zod';
import {
  getAdminConfig,
  isExternalMysqlCredentialsStored,
  sanitizeAdminConfigForClient,
  updateAdminConfig,
} from '../../services/adminService.js';
import {
  decryptOptionalCredential,
  DEFAULT_VERIFICATION_QUERY,
  splitMysqlHostInput,
  testExternalMySQLConnection,
  type TestMySQLInput,
} from '../../services/mysqlService.js';
import { sendTestEmail } from '../../services/emailService.js';
import type { AuthenticatedRequest } from '../../../shared/types/express.js';

const testExternalMysqlSavedSchema = z.object({
  useSavedCredentials: z.literal(true),
});

const testExternalMysqlInlineSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  verificationQuery: z.string().optional(),
});

export function registerConfigRoutes(router: Router): void {
  router.get('/config', async (_req, res, next) => {
    try {
      const config = await getAdminConfig();
      res.json({ config: sanitizeAdminConfigForClient(config) });
    } catch (error) {
      next(error);
    }
  });

  // Test external MySQL (Bun SQL) using submitted credentials or server-stored secrets only
  router.post('/config/test-external-mysql', async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const savedParsed = testExternalMysqlSavedSchema.safeParse(body);
      let mysqlTestInput: TestMySQLInput;

      if (savedParsed.success) {
        const cfg = await getAdminConfig();
        if (!isExternalMysqlCredentialsStored(cfg.externalMySQL)) {
          res.status(400).json({
            error: {
              message: 'External database is not fully configured',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        const ext = cfg.externalMySQL;
        let password = await decryptOptionalCredential(ext.password ?? '');
        if (password === '') {
          res.status(400).json({
            error: {
              message: 'Database password is required to test the connection',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }
        const hostParsed = splitMysqlHostInput(ext.host ?? '', ext.port ?? 3306);
        let verificationQuery = (ext.verificationQuery || DEFAULT_VERIFICATION_QUERY).trim();
        verificationQuery = await decryptOptionalCredential(verificationQuery);
        mysqlTestInput = {
          host: hostParsed.host,
          port: hostParsed.port,
          database: ext.database ?? '',
          username: await decryptOptionalCredential(ext.username ?? ''),
          password,
          verificationQuery,
        };
      } else {
        const parsed = testExternalMysqlInlineSchema.parse(body);
        let password = parsed.password ?? '';

        if (password === '') {
          const saved = await getAdminConfig();
          const stored = saved.externalMySQL.password;
          if (stored) {
            password = await decryptOptionalCredential(stored);
          }
        }

        if (password === '') {
          res.status(400).json({
            error: {
              message: 'Database password is required to test the connection',
              code: 'VALIDATION_ERROR',
              statusCode: 400,
            },
          });
          return;
        }

        const hostParsed = splitMysqlHostInput(parsed.host, parsed.port ?? 3306);
        mysqlTestInput = {
          host: hostParsed.host,
          port: hostParsed.port,
          database: parsed.database,
          username: parsed.username,
          password,
        };
        if (parsed.verificationQuery !== undefined) {
          mysqlTestInput.verificationQuery = parsed.verificationQuery;
        }
      }

      const result = await testExternalMySQLConnection(mysqlTestInput);

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });

  router.put('/config', async (req, res, next) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const config = await updateAdminConfig(
        req.body as Record<string, unknown>,
        authReq.user.id,
      );
      res.json({ config: sanitizeAdminConfigForClient(config) });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: {
            message: error.message,
            code: 'NOT_FOUND',
            statusCode: 404,
          },
        });
        return;
      }
      next(error);
    }
  });

  const testSmtpEmailSchema = z.object({
    recipientEmail: z.string().email(),
  });

  router.post('/email/test', async (req, res, next) => {
    try {
      const { recipientEmail } = testSmtpEmailSchema.parse(req.body);
      const result = await sendTestEmail(recipientEmail);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            errors: error.issues,
          },
        });
        return;
      }
      next(error);
    }
  });
}
