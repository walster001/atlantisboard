import { z } from 'zod';
import type { Response } from 'express';
import multer from 'multer';
import { getBoardImportUploadMaxBytes } from '../../constants/uploads.js';
import { Board } from '../../models/Board.js';
import {
  hasPermission,
  hasWorkspacePermission,
  userCanUseImportDisplay,
  userHasPermissionInAnyWorkspace,
} from '../../utils/permissions.js';
import { importPreflightPayloadSchema } from '../../../shared/import/importPreflightSchema.js';
import {
  ImportJsonSourceMismatchError,
} from '../../../shared/import/detectImportJsonSource.js';

export const importUploadMaxBytes = getBoardImportUploadMaxBytes();

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: importUploadMaxBytes },
});

export const optionalDefaultUncolouredCardColour = z
  .union([z.literal(''), z.string().regex(/^#[0-9A-Fa-f]{6}$/)])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

export const importTrelloSchema = z.object({
  workspaceId: z.string().optional(),
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

export const importWekanSchema = z.object({
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

export const importAtlantisboardSchema = z.object({
  workspaceId: z.string().optional(),
});

export const importCSVSchema = z.object({
  boardId: z.string().min(1),
  delimiter: z.enum([',', '\t']).optional().default(','),
  defaultUncolouredCardColour: optionalDefaultUncolouredCardColour,
});

export function parseImportPreflightFromBody(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return importPreflightPayloadSchema.parse(parsed);
  } catch {
    throw new Error('Invalid preflight payload');
  }
}

export function respondIfImportJsonShapeError(res: Response, error: unknown): boolean {
  if (error instanceof ImportJsonSourceMismatchError) {
    res.status(400).json({
      error: {
        message: error.message,
        code: 'IMPORT_WRONG_JSON_SOURCE',
        statusCode: 400,
      },
    });
    return true;
  }
  if (
    error instanceof Error &&
    (error.message.includes('Could not tell') || error.message.includes('must contain a JSON object'))
  ) {
    res.status(400).json({
      error: {
        message: error.message,
        code: 'IMPORT_JSON_UNRECOGNIZED',
        statusCode: 400,
      },
    });
    return true;
  }
  return false;
}

export async function assertImportDisplayAllowed(
  res: Response,
  userId: string,
  isAppAdmin: boolean | undefined,
): Promise<boolean> {
  const allowed = await userCanUseImportDisplay(userId, isAppAdmin);
  if (!allowed) {
    res.status(403).json({
      error: {
        message: 'Insufficient permissions to use import',
        code: 'FORBIDDEN',
        statusCode: 403,
      },
    });
    return false;
  }
  return true;
}

export async function userCanStartAtlantisboardImport(
  userId: string,
  isAppAdmin: boolean | undefined,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  return userHasPermissionInAnyWorkspace(userId, 'import.atlantisboard');
}

export async function userCanStartBoardJsonImport(
  userId: string,
  isAppAdmin: boolean | undefined,
  permissionKey: 'import.trello' | 'import.wekan',
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }
  return userHasPermissionInAnyWorkspace(userId, permissionKey);
}

/** Board-scoped import authorization for CSV (404 when board missing or not allowed — AC-012). */
export async function userCanImportCsvToBoard(
  userId: string,
  isAppAdmin: boolean | undefined,
  boardId: string,
): Promise<boolean> {
  if (isAppAdmin === true) {
    return true;
  }

  const board = await Board.findById(boardId).select('workspaceId ownerId').lean();
  if (!board) {
    return false;
  }

  if (board.ownerId?.toString() === userId) {
    return true;
  }

  const [canTrelloOnBoard, canWekanOnBoard] = await Promise.all([
    hasPermission({ id: userId }, boardId, 'import.trello'),
    hasPermission({ id: userId }, boardId, 'import.wekan'),
  ]);
  if (canTrelloOnBoard || canWekanOnBoard) {
    return true;
  }

  const workspaceId = board.workspaceId?.toString();
  if (workspaceId != null && workspaceId !== '') {
    const [canTrelloWs, canWekanWs] = await Promise.all([
      hasWorkspacePermission(userId, workspaceId, 'import.trello'),
      hasWorkspacePermission(userId, workspaceId, 'import.wekan'),
    ]);
    if (canTrelloWs || canWekanWs) {
      return true;
    }
  }

  return false;
}
