import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';
import { Upload, FileJson, Loader2, CheckCircle, AlertCircle, Palette, X, Check, Pipette } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getErrorMessage, getErrorName } from '@/lib/errorHandler';
import {
  InlineButtonIconDialog,
  DetectedInlineButton,
  scanWekanDataForInlineButtons,
  replaceInlineButtonImagesInWekanData,
} from './InlineButtonIconDialog';
import type { WekanBoard, WekanExport, TrelloBoard } from './types';
import type { CardInsert } from '@/types/api';
interface ImportResult {
  success: boolean;
  workspacesCreated: number;
  boardsCreated: number;
  columnsCreated: number;
  cardsCreated: number;
  labelsCreated: number;
  subtasksCreated: number;
  errors: string[];
  warnings: string[];
}

interface BoardImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type ImportSource = 'wekan' | 'trello' | 'csv';

// Format detection functions
function isWekanFormat(data: unknown): data is WekanExport {
  // Wekan exports have these distinctive properties
  // They can be a single board object or an array of boards
  const checkBoard = (board: unknown): board is WekanBoard => {
    if (!board || typeof board !== 'object') return false;
    const b = board as Record<string, unknown>;
    
    // Wekan boards have 'lists' array with 'swimlaneId' on cards
    // or they have 'swimlanes' array at the board level
    if (b.swimlanes && Array.isArray(b.swimlanes)) return true;
    if (b.lists && Array.isArray(b.lists)) {
      // Wekan lists have 'boardId' property
      const firstList = b.lists[0] as Record<string, unknown> | undefined;
      if (firstList?.boardId) return true;
    }
    if (b.cards && Array.isArray(b.cards)) {
      const firstCard = b.cards[0] as Record<string, unknown> | undefined;
      // Wekan cards have 'swimlaneId' property
      if (firstCard?.swimlaneId !== undefined) return true;
      // Wekan cards have 'listId' (lowercase), Trello uses 'idList'
      if (firstCard?.listId !== undefined && firstCard.idList === undefined) return true;
    }
    // Wekan has 'members' with 'isAdmin', 'isActive', 'isNoComments' etc.
    if (b.members && Array.isArray(b.members)) {
      const firstMember = b.members[0] as Record<string, unknown> | undefined;
      if (firstMember?.isAdmin !== undefined) return true;
    }
    return false;
  };

  if (Array.isArray(data)) {
    return data.some(item => checkBoard(item));
  }
  return checkBoard(data);
}

function isTrelloFormat(data: unknown): data is TrelloBoard {
  // Trello exports have these distinctive properties
  // Trello is always a single board object (not an array)
  if (Array.isArray(data)) return false;
  if (!data || typeof data !== 'object') return false;
  
  const d = data as Record<string, unknown>;
  
  // Trello boards have 'idOrganization', 'idMemberCreator', or 'closed' at root level
  if (d.idOrganization !== undefined || d.idMemberCreator !== undefined) return true;
  
  // Trello cards have 'idList' (not 'listId' like Wekan)
  if (d.cards && Array.isArray(d.cards)) {
    const firstCard = d.cards[0] as Record<string, unknown> | undefined;
    if (firstCard?.idList !== undefined) {
      // Make sure it's not also Wekan (which wouldn't have idList)
      if (firstCard.swimlaneId === undefined) return true;
    }
  }
  
  // Trello checklists have 'idCard' and 'checkItems'
  if (d.checklists && Array.isArray(d.checklists)) {
    const firstChecklist = d.checklists[0] as Record<string, unknown> | undefined;
    if (firstChecklist?.idCard !== undefined) return true;
  }
  
  // Trello labels have 'idBoard' property
  if (d.labels && Array.isArray(d.labels)) {
    const firstLabel = d.labels[0] as Record<string, unknown> | undefined;
    if (firstLabel?.idBoard !== undefined) return true;
  }
  
  // Trello has 'prefs' object with board preferences
  if (d.prefs && typeof d.prefs === 'object') {
    const prefs = d.prefs as Record<string, unknown>;
    if (prefs.permissionLevel !== undefined) return true;
  }
  
  return false;
}

function getFormatMismatchError(selectedFormat: ImportSource, data: unknown): string | null {
  const isWekan = isWekanFormat(data);
  const isTrello = isTrelloFormat(data);
  
  if (selectedFormat === 'wekan' && isTrello && !isWekan) {
    return 'This appears to be a Trello export file, but you selected "Wekan JSON". Please select "Trello JSON" as the import source.';
  }
  
  if (selectedFormat === 'trello' && isWekan && !isTrello) {
    return 'This appears to be a Wekan export file, but you selected "Trello JSON". Please select "Wekan JSON" as the import source.';
  }
  
  return null;
}

// Trello JSON types are now imported from ./types

// Color mapping from Trello to hex - comprehensive list
const trelloColorMap: Record<string, string> = {
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff78cb',
  black: '#344563',
  // Dark variants
  green_dark: '#519839',
  yellow_dark: '#d9b51c',
  orange_dark: '#cd8313',
  red_dark: '#b04632',
  purple_dark: '#89609e',
  blue_dark: '#055a8c',
  sky_dark: '#026aa7',
  lime_dark: '#49852e',
  pink_dark: '#c75488',
  black_dark: '#091e42',
  // Light variants
  green_light: '#b3f1b0',
  yellow_light: '#f5ea92',
  orange_light: '#fad29c',
  red_light: '#f5aca9',
  purple_light: '#dfc0eb',
  blue_light: '#8bbdd9',
  sky_light: '#8fdfeb',
  lime_light: '#b3f1d0',
  pink_light: '#f9c2e4',
  black_light: '#c1c7d0',
  // Additional colors that may appear
  white: '#b3bac5',
  navy: '#026aa7',
  teal: '#008080',
  grey: '#808080',
  gray: '#808080',
  slateblue: '#6a5acd',
};

// Helper function to get color - handles hex values directly or maps named colors
function getTrelloColor(color: string | undefined | null): string {
  // Handle null, undefined, or empty string
  if (!color || color.trim() === '') {
    return '#6b7280';
  }
  
  // If already a hex color, validate and return
  if (color.startsWith('#')) {
    // Validate hex format (3 or 6 digits)
    const hexPattern = /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/;
    if (hexPattern.test(color)) {
      return color;
    }
    // Invalid hex format, return default
    return '#6b7280';
  }
  
  // Try to map named color
  const normalizedColor = color.toLowerCase().trim();
  return trelloColorMap[normalizedColor] || '#6b7280';
}

// Preset colors for default card color picker
const DEFAULT_CARD_COLORS = [
  { value: null, label: 'No color', color: 'transparent' },
  { value: '#ef4444', label: 'Red', color: '#ef4444' },
  { value: '#f97316', label: 'Orange', color: '#f97316' },
  { value: '#eab308', label: 'Yellow', color: '#eab308' },
  { value: '#22c55e', label: 'Green', color: '#22c55e' },
  { value: '#06b6d4', label: 'Cyan', color: '#06b6d4' },
  { value: '#3b82f6', label: 'Blue', color: '#3b82f6' },
  { value: '#8b5cf6', label: 'Purple', color: '#8b5cf6' },
  { value: '#ec4899', label: 'Pink', color: '#ec4899' },
];

// Helper functions for color conversion
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

type ImportStage = 'idle' | 'parsing' | 'validating' | 'workspace' | 'board' | 'members' | 'labels' | 'columns' | 'cards' | 'card_labels' | 'subtasks' | 'assignees' | 'finalizing' | 'complete';

interface ProgressState {
  stage: ImportStage;
  current: number;
  total: number;
  detail?: string;
}

const stageLabels: Record<ImportStage, string> = {
  idle: 'Ready',
  parsing: 'Parsing JSON file...',
  validating: 'Validating data structure...',
  workspace: 'Creating workspace...',
  board: 'Creating board...',
  members: 'Setting up board members...',
  labels: 'Creating labels...',
  columns: 'Creating columns...',
  cards: 'Importing cards...',
  card_labels: 'Applying card labels...',
  subtasks: 'Creating subtasks...',
  assignees: 'Recording assignee mappings...',
  finalizing: 'Finalizing import...',
  complete: 'Import complete!',
};

const stageWeights: Record<ImportStage, number> = {
  idle: 0,
  parsing: 5,
  validating: 8,
  workspace: 12,
  board: 18,
  members: 22,
  labels: 30,
  columns: 40,
  cards: 75,
  card_labels: 80,
  subtasks: 88,
  assignees: 97,
  finalizing: 99,
  complete: 100,
};

export function BoardImportDialog({ open, onOpenChange, onImportComplete }: BoardImportDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importSource, setImportSource] = useState<ImportSource>('wekan');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ stage: 'idle', current: 0, total: 0 });
  const [defaultCardColor, setDefaultCardColor] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [customRgb, setCustomRgb] = useState({ r: 59, g: 130, b: 246 }); // Default blue
  const [customHex, setCustomHex] = useState('#3b82f6');
  
  // Inline button icon replacement state
  const [parsedWekanData, setParsedWekanData] = useState<WekanExport | null>(null);
  const [detectedInlineButtons, setDetectedInlineButtons] = useState<DetectedInlineButton[]>([]);
  const [showInlineButtonDialog, setShowInlineButtonDialog] = useState(false);
  const [iconReplacements, setIconReplacements] = useState<Map<string, string>>(new Map());
  
  // Abort controller for cancelling import
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Track created IDs for rollback
  const createdIdsRef = useRef<{ workspaceId?: string; boardIds?: string[] }>({});
  
  // Track if we've already handled successful import completion
  const completionHandledRef = useRef(false);

  // Handle RGB slider changes
  const handleRgbChange = (channel: 'r' | 'g' | 'b', value: string) => {
    const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
    const newRgb = { ...customRgb, [channel]: numValue };
    setCustomRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setCustomHex(hex);
  };

  // Handle hex input changes
  const handleHexChange = (value: string) => {
    setCustomHex(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      const { r, g, b } = hexToRgb(value);
      setCustomRgb({ r, g, b });
    }
  };

  // Apply custom color
  const applyCustomColor = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
      setDefaultCardColor(customHex);
      setColorPickerOpen(false);
    }
  };

  // EyeDropper API support
  const handleEyedropper = async () => {
    if (!('EyeDropper' in window)) {
      toast({
        title: 'Not supported',
        description: 'Eyedropper is not supported in your browser.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const eyeDropper = new window.EyeDropper!();
      const result = await eyeDropper.open();
      const hex = result.sRGBHex;
      setCustomHex(hex);
      const { r, g, b } = hexToRgb(hex);
      setCustomRgb({ r, g, b });
    } catch (e) {
      // User cancelled
    }
  };

  const updateProgress = (stage: ImportStage, current = 0, total = 0, detail?: string) => {
    setProgress({ stage, current, total, detail });
  };

  const calculateProgress = (): number => {
    const baseProgress = stageWeights[progress.stage];
    const nextStageKey = Object.keys(stageWeights)[Object.keys(stageWeights).indexOf(progress.stage) + 1] as ImportStage;
    const nextProgress = nextStageKey ? stageWeights[nextStageKey] : 100;
    
    if (progress.total > 0 && progress.current > 0) {
      const stageRange = nextProgress - baseProgress;
      const stageProgress = (progress.current / progress.total) * stageRange;
      return Math.min(baseProgress + stageProgress, nextProgress - 1);
    }
    return baseProgress;
  };

  const importWekanWithStreaming = async (
    wekanData: WekanExport,
    onProgress: (stage: ImportStage, current?: number, total?: number, detail?: string) => void,
    defaultColor: string | null,
    signal?: AbortSignal,
    iconReplacements?: Map<string, string>
  ): Promise<ImportResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000/api';
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) {
          reject(new Error('Not authenticated'));
          return;
        }

        // Convert Map to Record for JSON serialization
        const iconReplacementsRecord: Record<string, string> = {};
        if (iconReplacements) {
          iconReplacements.forEach((value, key) => {
            iconReplacementsRecord[key] = value;
          });
        }

        const response = await fetch(
          `${apiBaseUrl}/boards/import?stream=true`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ 
              wekanData, 
              defaultCardColor: defaultColor,
              iconReplacements: iconReplacementsRecord
            }),
            signal,
          }
        );

        // Check content type to determine if it's SSE
        const contentType = response.headers.get('content-type') || '';
        const isSSE = contentType.includes('text/event-stream');
        
        if (!response.ok && !isSSE) {
          // Non-SSE error response - parse as JSON
          const errorText = await response.text();
          try {
            const errorJson = JSON.parse(errorText);
            const errorMessage = errorJson.errors?.[0] || errorJson.error || errorJson.message || 'Board import encountered an error. Some data may not have been imported.';
            reject(new Error(errorMessage));
          } catch {
            reject(new Error(`Board import encountered an error. Please check your connection and try again.`));
          }
          return;
        }
        
        // For SSE (or successful response), continue to read stream
        if (!response.ok && isSSE) {
          // SSE error - will be handled in stream reading below
          // Continue to read the stream to get error message
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('Import did not complete. Please try again.'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'progress') {
                  // Map server stages to client stages
                  const stageMap: Record<string, ImportStage> = {
                    'parsing': 'parsing',
                    'workspace': 'workspace',
                    'board': 'board',
                    'labels': 'labels',
                    'columns': 'columns',
                    'cards': 'cards',
                    'subtasks': 'subtasks',
                    'complete': 'complete',
                  };
                  const stage = stageMap[data.stage] || 'parsing';
                  onProgress(stage, data.current, data.total, data.detail);
                  
                  // Track created IDs for potential rollback
                  if (data.createdIds) {
                    createdIdsRef.current = data.createdIds;
                  }
                } else if (data.type === 'result') {
                  // Transform snake_case to camelCase for ImportResult interface
                  const transformedResult: ImportResult = {
                    success: data.success ?? false,
                    workspacesCreated: data.workspaces_created ?? 0,
                    boardsCreated: data.boards_created ?? 0,
                    columnsCreated: data.columns_created ?? 0,
                    cardsCreated: data.cards_created ?? 0,
                    labelsCreated: data.labels_created ?? 0,
                    subtasksCreated: data.subtasks_created ?? 0,
                    errors: data.errors ?? [],
                    warnings: data.warnings ?? [],
                  };
                  resolve(transformedResult);
                  return;
                } else if (data.type === 'error') {
                  // Handle explicit error type (if backend sends it)
                  reject(new Error(data.message || data.error || 'Import failed'));
                  return;
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, line);
              }
            }
          }
        }

        // If we get here without a result, something went wrong
        reject(new Error('Import did not complete. Please try again.'));
      } catch (error) {
        reject(error);
      }
    });
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.json')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select a JSON file.',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const importTrelloBoard = async (trelloData: TrelloBoard, onProgress: (stage: ImportStage, current?: number, total?: number, detail?: string) => void, defaultColor: string | null): Promise<ImportResult> => {
    const result: ImportResult = {
      success: false,
      workspacesCreated: 0,
      boardsCreated: 0,
      columnsCreated: 0,
      cardsCreated: 0,
      labelsCreated: 0,
      subtasksCreated: 0,
      errors: [],
      warnings: [],
    };

    try {
      // Validate Trello JSON structure
      if (!trelloData.name || !Array.isArray(trelloData.lists) || !Array.isArray(trelloData.cards)) {
        result.errors.push('Invalid Trello JSON structure. Missing required fields (name, lists, cards).');
        return result;
      }

      // Get current user
      if (!user) {
        result.errors.push('User not authenticated');
        return result;
      }

      onProgress('workspace', 0, 0, 'Setting up workspace...');
      const memberMap = new Map<string, TrelloMember>();
      for (const member of (trelloData.members || [])) {
        memberMap.set(member.id, member);
      }

      // Create workspace for the imported board
      const workspaceName = `Imported from Trello - ${trelloData.name}`;
      const { data: workspace, error: workspaceError } = await api
        .from('workspaces')
        .insert({
          name: workspaceName,
          description: trelloData.desc || `Imported from Trello on ${new Date().toISOString()}`,
          ownerId: user.id,
        });

      if (workspaceError) {
        result.errors.push(`Failed to create workspace: ${workspaceError.message}`);
        return result;
      }
      result.workspacesCreated = 1;

      onProgress('board', 0, 0, 'Creating board...');
      // Create board
      const { data: board, error: boardError } = await api
        .from('boards')
        .insert({
          name: trelloData.name,
          description: trelloData.desc || null,
          workspaceId: workspace?.id,
          backgroundColor: '#0079bf',
        });

      if (boardError) {
        result.errors.push(`Failed to create board: ${boardError.message}`);
        return result;
      }
      result.boardsCreated = 1;

      // Add current user as board admin
      await api.from('board_members').insert({
        boardId: board.data?.id || board.id,
        userId: user.id,
        role: 'admin',
      });

      // Create labels in batch
      const trelloLabels = trelloData.labels || [];
      const labelMap = new Map<string, string>();
      
      if (trelloLabels.length > 0) {
        onProgress('labels', 0, trelloLabels.length, `Creating ${trelloLabels.length} labels...`);
        
        const validLabels = trelloLabels.filter(l => l.name || l.color);
        const labelInserts = validLabels.map(label => ({
          boardId: board.data?.id || board.id,
          name: label.name || label.color || 'Unnamed',
          color: getTrelloColor(label.color),
        }));

        const { data: createdLabels, error: labelsError } = await api
          .from('labels')
          .insert(labelInserts);

        if (labelsError) {
          result.warnings.push(`Failed to create some labels: ${labelsError.message}`);
        } else if (createdLabels?.data || createdLabels) {
          const labels = createdLabels.data || createdLabels;
          for (let i = 0; i < labels.length; i++) {
            labelMap.set(validLabels[i].id, labels[i].id);
          }
          result.labelsCreated = labels.length;
        }
        onProgress('labels', trelloLabels.length, trelloLabels.length, `Created ${result.labelsCreated} labels`);
      }

      // Create columns in batch
      const sortedLists = [...(trelloData.lists || [])]
        .filter(list => !list.closed)
        .sort((a, b) => a.pos - b.pos);
      
      const columnMap = new Map<string, string>();

      if (sortedLists.length > 0) {
        onProgress('columns', 0, sortedLists.length, `Creating ${sortedLists.length} columns...`);
        
        const columnInserts = sortedLists.map((list, i) => ({
          boardId: board.data?.id || board.id,
          title: list.name,
          position: i,
          color: '#ffffff', // Default to white
        }));

        const { data: createdColumns, error: columnsError } = await api
          .from('columns')
          .insert(columnInserts);

        if (columnsError) {
          result.warnings.push(`Failed to create some columns: ${columnsError.message}`);
        } else if (createdColumns?.data || createdColumns) {
          const columns = createdColumns.data || createdColumns;
          for (let i = 0; i < columns.length; i++) {
            columnMap.set(sortedLists[i].id, columns[i].id);
          }
          result.columnsCreated = columns.length;
        }
        onProgress('columns', sortedLists.length, sortedLists.length, `Created ${result.columnsCreated} columns`);
      }

      // Build checklist map
      const checklistMap = new Map<string, TrelloChecklist[]>();
      for (const checklist of (trelloData.checklists || [])) {
        const existing = checklistMap.get(checklist.idCard) || [];
        existing.push(checklist);
        checklistMap.set(checklist.idCard, existing);
      }

      // Group cards by list and prepare for batch insert
      const sortedCards = [...(trelloData.cards || [])]
        .filter(card => !card.closed)
        .sort((a, b) => a.pos - b.pos);
      onProgress('cards', 0, sortedCards.length, `Importing ${sortedCards.length} cards...`);

      const cardsByList = new Map<string, TrelloCard[]>();
      for (const card of sortedCards) {
        const existing = cardsByList.get(card.idList) || [];
        existing.push(card);
        cardsByList.set(card.idList, existing);
      }

      // Prepare all card inserts
      const allCardInserts: Array<{
        insert: CardInsert;
        trelloCard: TrelloCard;
      }> = [];

      for (const [listId, cards] of cardsByList) {
        const columnId = columnMap.get(listId);
        if (!columnId) {
          result.warnings.push(`Skipped ${cards.length} cards from archived/missing list`);
          continue;
        }

        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          
          // Map priority based on labels
          let priority = 'none';
          const cardLabelNames = (trelloData.labels || [])
            .filter(l => card.idLabels.includes(l.id))
            .map(l => l.name?.toLowerCase() || '');
          
          if (cardLabelNames.some(n => n.includes('high') || n.includes('urgent') || n.includes('critical'))) {
            priority = 'high';
          } else if (cardLabelNames.some(n => n.includes('medium') || n.includes('normal'))) {
            priority = 'medium';
          } else if (cardLabelNames.some(n => n.includes('low'))) {
            priority = 'low';
          }

          // Determine card color from cover
          let cardColor: string | null = null;
          if (card.cover?.color) {
            const coverColor = card.cover.color.trim();
            
            // Try Trello color map first
            if (trelloColorMap[coverColor.toLowerCase()]) {
              cardColor = trelloColorMap[coverColor.toLowerCase()];
            } 
            // Check if it's a valid hex color
            else if (coverColor.startsWith('#')) {
              const hexPattern = /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/;
              if (hexPattern.test(coverColor)) {
                cardColor = coverColor;
              }
              // Invalid hex format, ignore
            } 
            // Handle rgb() format - convert to hex if possible
            else if (coverColor.startsWith('rgb')) {
              // Try to parse rgb() format
              const rgbMatch = coverColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (rgbMatch) {
                const r = parseInt(rgbMatch[1], 10);
                const g = parseInt(rgbMatch[2], 10);
                const b = parseInt(rgbMatch[3], 10);
                if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                  cardColor = rgbToHex(r, g, b);
                }
              }
              // If rgb parsing fails, ignore
            } 
            // Try CSS named colors
            else {
              const cssColorMap: Record<string, string> = {
                red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
                orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', black: '#000000',
                white: '#ffffff', gray: '#808080', grey: '#808080', cyan: '#00ffff',
                magenta: '#ff00ff', lime: '#00ff00', navy: '#000080', teal: '#008080',
                maroon: '#800000', olive: '#808000', aqua: '#00ffff', silver: '#c0c0c0',
              };
              const normalizedColor = coverColor.toLowerCase();
              if (cssColorMap[normalizedColor]) {
                cardColor = cssColorMap[normalizedColor];
              }
              // If no match found, ignore (cardColor remains null)
            }
          }

          // Ensure finalCardColor is string | null (never undefined)
          const finalCardColor: string | null = cardColor || defaultColor || null;

          allCardInserts.push({
            insert: {
              columnId: columnId,
              title: card.name,
              description: card.desc || null,
              dueDate: card.due || null,
              position: i,
              priority,
              createdBy: user.id,
              color: finalCardColor,
            },
            trelloCard: card,
          });
        }
      }

      // Insert cards in batches of 50
      const CARD_BATCH_SIZE = 50;
      const cardIdMap = new Map<string, string>();

      for (let batchStart = 0; batchStart < allCardInserts.length; batchStart += CARD_BATCH_SIZE) {
        const batch = allCardInserts.slice(batchStart, batchStart + CARD_BATCH_SIZE);
        
        onProgress('cards', Math.min(batchStart + CARD_BATCH_SIZE, allCardInserts.length), sortedCards.length, 
          `Cards batch ${Math.floor(batchStart / CARD_BATCH_SIZE) + 1}/${Math.ceil(allCardInserts.length / CARD_BATCH_SIZE)}`);

        const { data: createdCards, error: cardsError } = await api
          .from('cards')
          .insert(batch.map(b => b.insert));

        if (cardsError) {
          result.warnings.push(`Failed to create some cards: ${cardsError.message}`);
          continue;
        }

        if (createdCards?.data || createdCards) {
          const cards = createdCards.data || createdCards;
          // Map old IDs to new IDs and collect card labels
          const cardLabelInserts: Array<{ cardId: string; labelId: string }> = [];
          
          for (let i = 0; i < cards.length; i++) {
            const trelloCard = batch[i].trelloCard;
            const newCardId = cards[i].id;
            cardIdMap.set(trelloCard.id, newCardId);
            result.cardsCreated++;

            // Collect card labels for batch insert
            for (const labelId of trelloCard.idLabels) {
              const mappedLabelId = labelMap.get(labelId);
              if (mappedLabelId) {
                cardLabelInserts.push({ cardId: newCardId, labelId: mappedLabelId });
              }
            }
          }

          // Insert all card labels for this batch at once
          if (cardLabelInserts.length > 0) {
            const { error: cardLabelsError } = await api
              .from('card_labels')
              .insert(cardLabelInserts);
            
            if (cardLabelsError) {
              result.warnings.push('Failed to create some card labels');
            }
          }
        }
      }

      // Create subtasks from checklists in batch
      onProgress('subtasks', 0, 0, 'Processing checklists...');
      
      const allSubtaskInserts: Array<{
        cardId: string;
        title: string;
        completed: boolean;
        position: number;
        checklistName: string;
      }> = [];

      for (const [trelloCardId, cardChecklists] of checklistMap) {
        const cardId = cardIdMap.get(trelloCardId);
        if (!cardId) continue;

        let subtaskPosition = 0;
        for (const checklist of cardChecklists) {
          const sortedItems = [...checklist.checkItems].sort((a, b) => a.pos - b.pos);
          
          for (const item of sortedItems) {
            allSubtaskInserts.push({
              cardId: cardId,
              title: item.name,
              completed: item.state === 'complete',
              position: subtaskPosition++,
              checklistName: checklist.name,
            });
          }
        }
      }

      // Insert subtasks in batches of 100
      const SUBTASK_BATCH_SIZE = 100;
      for (let batchStart = 0; batchStart < allSubtaskInserts.length; batchStart += SUBTASK_BATCH_SIZE) {
        const batch = allSubtaskInserts.slice(batchStart, batchStart + SUBTASK_BATCH_SIZE);
        
        onProgress('subtasks', Math.min(batchStart + SUBTASK_BATCH_SIZE, allSubtaskInserts.length), allSubtaskInserts.length,
          `Subtasks batch ${Math.floor(batchStart / SUBTASK_BATCH_SIZE) + 1}/${Math.ceil(allSubtaskInserts.length / SUBTASK_BATCH_SIZE)}`);

        const { error: subtasksError } = await api
          .from('card_subtasks')
          .insert(batch);

        if (subtasksError) {
          result.warnings.push('Failed to create some subtasks');
        } else {
          result.subtasksCreated += batch.length;
        }
      }

      onProgress('finalizing', 0, 0, 'Finalizing import...');
      result.success = true;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      result.errors.push(`Unexpected error: ${errorMessage}`);
    }

    return result;
  };

  // Apply icon replacements to Wekan data
  const applyIconReplacements = (wekanData: WekanExport, replacements: Map<string, string>): WekanExport => {
    return replaceInlineButtonImagesInWekanData(wekanData, replacements) as WekanExport;
  };

  // Handle when user completes the icon replacement dialog
  const handleInlineButtonsComplete = (replacements: Map<string, string>) => {
    setIconReplacements(replacements);
    setShowInlineButtonDialog(false);

    // Continue with import using the parsed and modified data
    if (parsedWekanData) {
      console.log('Proceeding with import, data present:', !!parsedWekanData);
      proceedWithImport(parsedWekanData, replacements);
    } else {
      console.error('parsedWekanData is null, cannot proceed with import');
      toast({
        title: 'Import failed',
        description: 'No Wekan data available. Please try selecting the file again.',
        variant: 'destructive',
      });
    }
  };

  // Rollback created resources
  const rollbackImport = async () => {
    const { workspaceId } = createdIdsRef.current;
    
    if (!workspaceId) {
      console.log('No workspace to rollback');
      return;
    }
    
    console.log('Rolling back import, deleting workspace:', workspaceId);
    
    try {
      // Deleting the workspace will cascade delete boards, columns, cards, etc.
      const { error } = await api
        .from('workspaces')
        .eq('id', workspaceId)
        .delete();
      
      if (error) {
        console.error('Rollback error:', error);
        toast({
          title: 'Rollback partially failed',
          description: `Could not delete all imported data: ${error.message}. You may need to manually delete the imported workspace.`,
          variant: 'destructive',
        });
      } else {
        console.log('Rollback successful');
      }
    } catch (err) {
      console.error('Rollback exception:', err);
    }
    
    // Clear tracked IDs
    createdIdsRef.current = {};
  };

  // Cancel ongoing import
  const handleCancelImport = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setImporting(false);
    updateProgress('idle');
    
    // Show immediate feedback
    toast({
      title: 'Cancelling import...',
      description: 'Stopping import and cleaning up created data.',
    });
    
    // Rollback in parallel
    await rollbackImport();
    
    toast({
      title: 'Import cancelled',
      description: 'The import was cancelled and all partially imported data has been removed.',
    });
  };

  // Proceed with the actual import
  const proceedWithImport = async (jsonData: WekanExport | TrelloBoard, replacements: Map<string, string>) => {
    // Create new abort controller for this import
    abortControllerRef.current = new AbortController();
    // Reset tracked IDs for new import
    createdIdsRef.current = {};
    
    setImporting(true);
    setImportResult(null);
    updateProgress('parsing');

    try {
      let result: ImportResult;

      if (importSource === 'trello') {
        result = await importTrelloBoard(jsonData as TrelloBoard, updateProgress, defaultCardColor);
      } else {
        // Apply icon replacements to Wekan data before import
        const modifiedData = applyIconReplacements(jsonData, replacements);
        // For Wekan, use streaming SSE to get real-time progress
        // Pass iconReplacements map so backend can use replacement URLs in placeholders
        result = await importWekanWithStreaming(modifiedData, updateProgress, defaultCardColor, abortControllerRef.current.signal, replacements);
      }

      updateProgress('complete');
      setImportResult(result);

      if (result.success) {
        toast({
          title: 'Import completed',
          description: `Imported ${result.boardsCreated} board(s) with ${result.cardsCreated} card(s).`,
        });
        // importResult state change will trigger useEffect to close dialog and call onImportComplete
      } else {
        toast({
          title: 'Import failed',
          description: result.errors.join(', '),
          variant: 'destructive',
        });
        updateProgress('idle');
      }
    } catch (error: unknown) {
        // Don't show error toast if it was an abort
        if (getErrorName(error) === 'AbortError') {
          return;
        }
        
        // Check if it's an auth error - redirect will happen, don't show toast
        const errorMessage = getErrorMessage(error);
        const isAuthError = errorMessage.includes('401') || 
                           errorMessage.includes('Unauthorized') ||
                           errorMessage.includes('Session expired') ||
                           errorMessage.includes('Token expired');
        
        if (isAuthError) {
          console.log('[BoardImportDialog] Auth error detected, redirect will happen');
          // Cancel import and let redirect handle cleanup
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          updateProgress('idle');
          return;
        }
        
        console.error('Import error:', error);
        toast({
          title: 'Import failed',
          description: errorMessage || 'Board import encountered an error. Some data may not have been imported.',
          variant: 'destructive',
        });
        updateProgress('idle');
      } finally {
      setImporting(false);
      abortControllerRef.current = null;
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to import.',
        variant: 'destructive',
      });
      return;
    }

    if (importSource === 'csv') {
      toast({
        title: 'Not implemented',
        description: 'CSV/TSV import is not yet available.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const fileContent = await selectedFile.text();
      let jsonData;
      
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'The file contains invalid JSON.',
          variant: 'destructive',
        });
        return;
      }

      // Check for format mismatch (Wekan vs Trello)
      const formatError = getFormatMismatchError(importSource, jsonData);
      if (formatError) {
        toast({
          title: 'Wrong file format',
          description: formatError,
          variant: 'destructive',
        });
        return;
      }

      // For Wekan imports, check for inline buttons with /cdn images
      if (importSource === 'wekan') {
        const detectedButtons = scanWekanDataForInlineButtons(jsonData);
        
        if (detectedButtons.length > 0) {
          // Store parsed data and show the icon replacement dialog
          setParsedWekanData(jsonData);
          setDetectedInlineButtons(detectedButtons);
          setShowInlineButtonDialog(true);
          return; // Wait for dialog completion
        }
      }

      // No inline buttons detected or Trello import - proceed directly
      proceedWithImport(jsonData, new Map());
    } catch (error: unknown) {
      // Check if it's an auth error - redirect will happen, don't show toast
      const errorMessage = getErrorMessage(error);
      const isAuthError = errorMessage.includes('401') || 
                         errorMessage.includes('Unauthorized') ||
                         errorMessage.includes('Session expired') ||
                         errorMessage.includes('Token expired');
      
      if (isAuthError) {
        console.log('[BoardImportDialog] Auth error detected in file handling, redirect will happen');
        return;
      }
      
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setImportResult(null);
    setImportSource('wekan');
    setDefaultCardColor(null);
    setColorPickerOpen(false);
    updateProgress('idle');
    setParsedWekanData(null);
    setDetectedInlineButtons([]);
    setShowInlineButtonDialog(false);
    setIconReplacements(new Map());
    completionHandledRef.current = false; // Reset completion flag
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle successful import completion - close dialog and refresh data
  useEffect(() => {
    if (importResult?.success && !importing && !completionHandledRef.current) {
      completionHandledRef.current = true;
      // Close dialog immediately
      onOpenChange(false);
      // Call onImportComplete after a brief delay to ensure dialog closes first
      const timeoutId = setTimeout(() => {
        onImportComplete();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importResult?.success, importing]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) resetDialog();
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Boards
          </DialogTitle>
          <DialogDescription>
            Import boards from external kanban applications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Import Source</Label>
            <Select value={importSource} onValueChange={(v) => setImportSource(v as ImportSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wekan">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Wekan JSON
                  </div>
                </SelectItem>
                <SelectItem value="trello">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Trello JSON
                  </div>
                </SelectItem>
                <SelectItem value="csv" disabled>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    CSV/TSV (Coming Soon)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(importSource === 'wekan' || importSource === 'trello') && (
            <div className="space-y-2">
              <Label>{importSource === 'wekan' ? 'Wekan' : 'Trello'} Export File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          )}

          {/* Default Card Color Picker */}
          {(importSource === 'wekan' || importSource === 'trello') && (
            <div className="space-y-2">
              <Label>Default Colour for Uncoloured Cards</Label>
              <div className="flex items-center gap-2">
                <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                    >
                      {defaultCardColor ? (
                        <>
                          <div
                            className="h-4 w-4 rounded border border-border"
                            style={{ backgroundColor: defaultCardColor }}
                          />
                          <span>{DEFAULT_CARD_COLORS.find(c => c.value === defaultCardColor)?.label || defaultCardColor}</span>
                        </>
                      ) : (
                        <>
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">No default colour</span>
                        </>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <Tabs defaultValue="presets" className="w-full">
                      <TabsList className="w-full grid grid-cols-2 rounded-b-none">
                        <TabsTrigger value="presets">Presets</TabsTrigger>
                        <TabsTrigger value="custom">Custom</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="presets" className="p-3 space-y-3">
                        <div className="grid grid-cols-5 gap-2">
                          {DEFAULT_CARD_COLORS.map((colorOption) => (
                            <button
                              key={colorOption.label}
                              onClick={() => {
                                setDefaultCardColor(colorOption.value);
                                setColorPickerOpen(false);
                              }}
                              className={cn(
                                'h-8 w-8 rounded-md border-2 transition-all hover:scale-110 flex items-center justify-center',
                                defaultCardColor === colorOption.value
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-border',
                                colorOption.value === null && 'bg-background'
                              )}
                              style={colorOption.value ? { backgroundColor: colorOption.value } : undefined}
                              title={colorOption.label}
                            >
                              {colorOption.value === null && (
                                <X className="h-4 w-4 text-muted-foreground" />
                              )}
                              {colorOption.value && defaultCardColor === colorOption.value && (
                                <Check className="h-4 w-4 text-white" />
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Cards with existing colours keep their original colour.
                        </p>
                      </TabsContent>
                      
                      <TabsContent value="custom" className="p-3 space-y-3">
                        {/* Color preview */}
                        <div className="flex items-center gap-3">
                          <div
                            className="h-12 w-12 rounded-lg border-2 border-border shrink-0"
                            style={{ backgroundColor: customHex }}
                          />
                          <div className="flex-1">
                            <Input
                              value={customHex}
                              onChange={(e) => handleHexChange(e.target.value)}
                              placeholder="#000000"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          {'EyeDropper' in window && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={handleEyedropper}
                              title="Pick colour from screen"
                            >
                              <Pipette className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* RGB sliders */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="w-6 text-xs text-red-500 font-medium">R</Label>
                            <input
                              type="range"
                              min="0"
                              max="255"
                              value={customRgb.r}
                              onChange={(e) => handleRgbChange('r', e.target.value)}
                              className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-red-500 to-red-500 rounded-lg cursor-pointer"
                            />
                            <Input
                              type="number"
                              min="0"
                              max="255"
                              value={customRgb.r}
                              onChange={(e) => handleRgbChange('r', e.target.value)}
                              className="w-14 h-7 text-xs text-center"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="w-6 text-xs text-green-500 font-medium">G</Label>
                            <input
                              type="range"
                              min="0"
                              max="255"
                              value={customRgb.g}
                              onChange={(e) => handleRgbChange('g', e.target.value)}
                              className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-green-500 to-green-500 rounded-lg cursor-pointer"
                            />
                            <Input
                              type="number"
                              min="0"
                              max="255"
                              value={customRgb.g}
                              onChange={(e) => handleRgbChange('g', e.target.value)}
                              className="w-14 h-7 text-xs text-center"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="w-6 text-xs text-blue-500 font-medium">B</Label>
                            <input
                              type="range"
                              min="0"
                              max="255"
                              value={customRgb.b}
                              onChange={(e) => handleRgbChange('b', e.target.value)}
                              className="flex-1 h-2 appearance-none bg-gradient-to-r from-black via-blue-500 to-blue-500 rounded-lg cursor-pointer"
                            />
                            <Input
                              type="number"
                              min="0"
                              max="255"
                              value={customRgb.b}
                              onChange={(e) => handleRgbChange('b', e.target.value)}
                              className="w-14 h-7 text-xs text-center"
                            />
                          </div>
                        </div>

                        <Button size="sm" className="w-full" onClick={applyCustomColor}>
                          Apply Colour
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </PopoverContent>
                </Popover>
                {defaultCardColor && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setDefaultCardColor(null)}
                    title="Clear default colour"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {importSource === 'wekan' && (
            <div className="rounded-md border p-3 bg-muted/50">
              <h4 className="font-medium text-sm mb-2">Import Mapping:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Wekan Boards → KanBoard Boards</li>
                <li>• Wekan Lists → KanBoard Columns</li>
                <li>• Wekan Cards → KanBoard Cards</li>
                <li>• Wekan Labels → KanBoard Labels</li>
                <li>• Wekan Checklists → KanBoard Subtasks</li>
                <li className="text-amber-600">• Members, attachments, comments are ignored</li>
              </ul>
            </div>
          )}

          {importSource === 'trello' && (
            <div className="rounded-md border p-3 bg-muted/50">
              <h4 className="font-medium text-sm mb-2">Import Mapping:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Trello Board → KanBoard Board</li>
                <li>• Trello Lists → KanBoard Columns</li>
                <li>• Trello Cards → KanBoard Cards</li>
                <li>• Trello Labels → KanBoard Labels</li>
                <li>• Trello Checklists → KanBoard Subtasks</li>
                <li className="text-amber-600">• Members, attachments, comments ignored, archived items skipped</li>
              </ul>
            </div>
          )}

          {/* Progress Bar */}
          {importing && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stageLabels[progress.stage]}</span>
                <span className="text-muted-foreground">{Math.round(calculateProgress())}%</span>
              </div>
              <Progress value={calculateProgress()} className="h-2" />
              {progress.detail && (
                <p className="text-xs text-muted-foreground">{progress.detail}</p>
              )}
              {progress.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {progress.current} / {progress.total}
                </p>
              )}
            </div>
          )}

          {importResult && (
            <ScrollArea className="h-[200px] rounded-md border p-3">
              <div className="space-y-2">
                <div className={`flex items-center gap-2 ${importResult.success ? 'text-green-600' : 'text-destructive'}`}>
                  {importResult.success ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  <span className="font-medium">
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </span>
                </div>

                {importResult.success && (
                  <div className="text-sm space-y-1">
                    <p>✓ Workspaces: {importResult.workspacesCreated}</p>
                    <p>✓ Boards: {importResult.boardsCreated}</p>
                    <p>✓ Columns: {importResult.columnsCreated}</p>
                    <p>✓ Cards: {importResult.cardsCreated}</p>
                    <p>✓ Labels: {importResult.labelsCreated}</p>
                    <p>✓ Subtasks: {importResult.subtasksCreated}</p>
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="text-sm text-amber-600 space-y-1">
                    <p className="font-medium">Warnings:</p>
                    {importResult.warnings.slice(0, 5).map((w, i) => (
                      <p key={i}>• {w}</p>
                    ))}
                    {importResult.warnings.length > 5 && (
                      <p>... +{importResult.warnings.length - 5} more</p>
                    )}
                  </div>
                )}

                {importResult.errors.length > 0 && (
                  <div className="text-sm text-destructive space-y-1">
                    <p className="font-medium">Errors:</p>
                    {importResult.errors.map((e, i) => (
                      <p key={i}>• {e}</p>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                if (importing) {
                  handleCancelImport();
                } else {
                  handleOpenChange(false);
                }
              }}
            >
              {importResult?.success ? 'Close' : 'Cancel'}
            </Button>
            {!importResult?.success && (
              <Button onClick={handleImport} disabled={!selectedFile || importing}>
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {importing ? 'Importing...' : 'Import'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Inline Button Icon Replacement Dialog */}
      <InlineButtonIconDialog
        open={showInlineButtonDialog}
        onOpenChange={setShowInlineButtonDialog}
        detectedButtons={detectedInlineButtons}
        onComplete={handleInlineButtonsComplete}
      />
    </Dialog>
  );
}