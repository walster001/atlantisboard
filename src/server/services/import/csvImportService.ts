import mongoose from 'mongoose';
import { parse } from 'papaparse';
import { z } from 'zod';
import { Board } from '../../models/Board.js';
import { List } from '../../models/List.js';
import { Card } from '../../models/Card.js';
import { ImportJob } from '../../models/ImportJob.js';
import { User } from '../../models/User.js';
import { logger } from '../../utils/logger.js';
import { createActivity } from '../activityService.js';
import { emitToUser } from '../../utils/socketIO.js';
import { parse as parseDate } from 'date-fns';
import { plainTextToCardDescriptionJson } from '../../../shared/utils/plainTextToCardDescriptionJson.js';
import {
  isHexCardColour,
  resolveImportedCardColour,
} from '../../../shared/utils/importDefaultCardColour.js';
import { CARD_TITLE_MAX_LENGTH } from '../../../shared/constants/entityTextLimits.js';

interface CSVRow {
  [key: string]: string | undefined;
}

const csvRowSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  list: z.string().optional(),
  column: z.string().optional(),
  labels: z.string().optional(),
  tags: z.string().optional(),
  dueDate: z.string().optional(),
  due_date: z.string().optional(),
  startDate: z.string().optional(),
  start_date: z.string().optional(),
  assignees: z.string().optional(),
  position: z.string().optional(),
  checklistItems: z.string().optional(),
  checklist_items: z.string().optional(),
  color: z.string().optional(),
  colour: z.string().optional(),
});

export async function importCSV(
  fileBuffer: Buffer,
  boardId: string,
  userId: string,
  delimiter: ',' | '\t' = ',',
  defaultUncolouredCardColour?: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days, matches ImportJob TTL
  const importJob = new ImportJob({
    userId,
    type: 'csv',
    status: 'processing',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    importErrors: [],
    expiresAt,
  });

  await importJob.save();
  const jobId = importJob._id.toString();

  try {
    // Verify board exists
    const board = await Board.findById(boardId);
    if (!board) {
      throw new Error('Board not found');
    }

    // Parse CSV
    const csvText = fileBuffer.toString('utf-8');
    const parseResult = parse<CSVRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${parseResult.errors.map((e) => e.message).join(', ')}`);
    }

    const rows = parseResult.data as CSVRow[];
    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Normalize column names (case-insensitive)
    const normalizedRows = rows.map((row) => {
      const normalized: CSVRow = {};
      for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase().trim();
        const strValue = typeof value === 'string' ? value : String(value ?? '');
        // Map common variations
        if (lowerKey === 'name' || lowerKey === 'card name' || lowerKey === 'card_name') {
          normalized.title = strValue;
        } else if (lowerKey === 'desc' || lowerKey === 'description' || lowerKey === 'card description') {
          normalized.description = strValue;
        } else if (lowerKey === 'list' || lowerKey === 'column' || lowerKey === 'list name') {
          normalized.list = strValue;
        } else if (lowerKey === 'labels' || lowerKey === 'tags' || lowerKey === 'label') {
          normalized.labels = strValue;
        } else if (lowerKey === 'due date' || lowerKey === 'due_date' || lowerKey === 'due') {
          normalized.dueDate = strValue;
        } else if (lowerKey === 'start date' || lowerKey === 'start_date' || lowerKey === 'start') {
          normalized.startDate = strValue;
        } else if (lowerKey === 'assignees' || lowerKey === 'assignee' || lowerKey === 'assigned to') {
          normalized.assignees = strValue;
        } else if (lowerKey === 'position' || lowerKey === 'pos' || lowerKey === 'order') {
          normalized.position = strValue;
        } else if (lowerKey === 'checklist' || lowerKey === 'checklist items' || lowerKey === 'checklist_items') {
          normalized.checklistItems = strValue;
        } else if (
          lowerKey === 'color' ||
          lowerKey === 'colour' ||
          lowerKey === 'card color' ||
          lowerKey === 'card colour' ||
          lowerKey === 'card_colour' ||
          lowerKey === 'card color hex'
        ) {
          normalized.color = strValue;
        } else {
          normalized[key] = strValue;
        }
      }
      return normalized;
    });

    // Validate rows
    const validatedRows: z.infer<typeof csvRowSchema>[] = [];
    for (let i = 0; i < normalizedRows.length; i++) {
      try {
        const validated = csvRowSchema.parse(normalizedRows[i]);
        validatedRows.push(validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errorMsg = `Row ${i + 2}: ${error.issues.map((issue) => issue.message).join(', ')}`;
          logger.warn({ row: i + 2, errors: error.issues }, 'CSV row validation failed');
          await ImportJob.findByIdAndUpdate(jobId, {
            $push: {
              importErrors: { message: errorMsg, row: i + 2 },
            },
          });
        }
      }
    }

    if (validatedRows.length === 0) {
      throw new Error('No valid rows found in CSV file');
    }

    await ImportJob.findByIdAndUpdate(jobId, {
      totalItems: validatedRows.length,
    });

    // Get or create lists
    const listMap = new Map<string, string>();
    const existingLists = await List.find({ boardId }).select('_id name');
    for (const list of existingLists) {
      listMap.set(list.name.toLowerCase(), list._id.toString());
    }

    // Process in batches of 100
    const batchSize = 100;
    let processed = 0;
    let lastEmittedProgress = 0;

    for (let i = 0; i < validatedRows.length; i += batchSize) {
      const batch = validatedRows.slice(i, i + batchSize);

      try {
        await Promise.all(
          batch.map(async (row) => {
            try {
              // Get or create list
              const listName = row.list || row.column || 'Imported';
              const listNameLower = listName.toLowerCase();
              let listId = listMap.get(listNameLower);

              if (!listId) {
                // Create new list
                const newList = new List({
                  boardId,
                  name: listName,
                  position: listMap.size,
                });
                await newList.save();
                listId = newList._id.toString();
                listMap.set(listNameLower, listId);
              }

              // Parse dates
              let dueDate: Date | undefined;
              if (row.dueDate || row.due_date) {
                const dateStr = row.dueDate || row.due_date || '';
                dueDate = parseDateString(dateStr);
              }

              let startDate: Date | undefined;
              if (row.startDate || row.start_date) {
                const dateStr = row.startDate || row.start_date || '';
                startDate = parseDateString(dateStr);
              }

              // Parse assignees
              const assigneeEmails = (row.assignees || '')
                .split(',')
                .map((email) => email.trim())
                .filter((email) => email.length > 0);

              const assigneeIds: mongoose.Types.ObjectId[] = [];
              for (const email of assigneeEmails) {
                const user = await User.findOne({ email });
                if (user) {
                  assigneeIds.push(user._id);
                }
              }

              // Parse labels (comma-separated)
              const labelNames = (row.labels || row.tags || '')
                .split(',')
                .map((name) => name.trim())
                .filter((name) => name.length > 0);

              // Parse checklist items (semicolon-separated)
              const checklistItems = (row.checklistItems || row.checklist_items || '')
                .split(';')
                .map((item) => item.trim())
                .filter((item) => item.length > 0);

              // Parse position
              const position = row.position ? parseFloat(row.position) : undefined;

              const rowHexColour =
                row.color && isHexCardColour(row.color)
                  ? row.color.trim()
                  : row.colour && isHexCardColour(row.colour)
                    ? row.colour.trim()
                    : undefined;

              // Create card
              const card = new Card({
                listId,
                boardId,
                title: row.title.slice(0, CARD_TITLE_MAX_LENGTH),
                description: row.description
                  ? plainTextToCardDescriptionJson(row.description)
                  : undefined,
                position: position !== undefined ? position : 0,
                color: resolveImportedCardColour(rowHexColour, defaultUncolouredCardColour),
                labels: labelNames.map((name) => ({
                  id: '', // Will be resolved if label exists on board
                  name,
                  color: '#61BD4F',
                })),
                dueDate,
                startDate,
                completed: false,
                createdBy: new mongoose.Types.ObjectId(userId),
                assignees: assigneeIds,
                reminders: [],
                attachments: [],
                comments: [],
                checklists: checklistItems.length > 0
                  ? [
                      {
                        id: crypto.randomUUID(),
                        title: 'Checklist',
                        items: checklistItems.map((item) => ({
                          id: crypto.randomUUID(),
                          text: item,
                          completed: false,
                        })),
                      },
                    ]
                  : [],
              });

              await card.save();

              // Create activity log
              createActivity({
                boardId,
                cardId: card._id.toString(),
                userId,
                type: 'card.created',
                description: `Card "${row.title}" imported from CSV`,
              });

              processed++;
            } catch (error) {
              logger.error({ error, row: i + batch.indexOf(row) + 2 }, 'Error importing CSV row');
              processed++;
            }
          })
        );

        const progress = validatedRows.length > 0 ? Math.round((processed / validatedRows.length) * 100) : 0;
        await ImportJob.findByIdAndUpdate(jobId, {
          progress,
          processedItems: processed,
        });

        // Emit Socket.io progress every 10 items (for batches, emit after each batch)
        if (processed - lastEmittedProgress >= 10) {
          emitToUser(userId, 'import:progress', {
            jobId,
            progress,
            itemsProcessed: processed,
            totalItems: validatedRows.length,
          });
          lastEmittedProgress = processed;
        }
      } catch (error) {
        logger.error({ error, batchStart: i }, 'Error processing CSV batch');
        // Continue with next batch
      }
    }

    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      progress: 100,
      result: { message: `Import completed successfully. Processed ${processed} cards.` },
    });

    // Emit final completion event
    emitToUser(userId, 'import:completed', {
      jobId,
      result: { message: `Import completed successfully. Processed ${processed} cards.` },
    });

    logger.info({ jobId, userId, boardId, processed }, 'CSV import completed');
    return jobId;
  } catch (error) {
    logger.error({ error, jobId }, 'CSV import failed');
    await ImportJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      importErrors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
    });

    // Emit error event
    emitToUser(userId, 'import:error', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Parse date string in various formats
 */
function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr || dateStr.trim().length === 0) {
    return undefined;
  }

  const formats = [
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'yyyy/MM/dd',
    'MM-dd-yyyy',
    'dd-MM-yyyy',
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-ddTHH:mm:ss',
    'yyyy-MM-ddTHH:mm:ss.SSSZ',
    'MMM dd, yyyy',
    'MMMM dd, yyyy',
  ];

  for (const format of formats) {
    try {
      const parsed = parseDate(dateStr, format, new Date());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Try next format
    }
  }

  // Try native Date parsing as fallback
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Invalid date
  }

  logger.warn({ dateStr }, 'Could not parse date string');
  return undefined;
}

