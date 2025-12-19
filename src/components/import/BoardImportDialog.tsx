import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileJson, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { markdownToHtml } from '@/lib/markdownToHtml';
interface ImportResult {
  success: boolean;
  workspaces_created: number;
  boards_created: number;
  columns_created: number;
  cards_created: number;
  labels_created: number;
  subtasks_created: number;
  attachments_noted: number;
  attachments_pending: number;
  assignees_pending: number;
  errors: string[];
  warnings: string[];
}

interface BoardImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type ImportSource = 'wekan' | 'trello' | 'csv';

// Trello JSON types
interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: TrelloCheckItem[];
}

interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  bytes: number | null;
  mimeType: string | null;
  date: string;
}

interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idLabels: string[];
  idMembers: string[];
  pos: number;
  dateLastActivity: string;
  attachments?: TrelloAttachment[];
  closed: boolean;
}

interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
}

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  lists: TrelloList[];
  cards: TrelloCard[];
  labels: TrelloLabel[];
  checklists: TrelloChecklist[];
  members?: TrelloMember[];
}

// Color mapping from Trello to hex
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
};

type ImportStage = 'idle' | 'parsing' | 'validating' | 'workspace' | 'board' | 'members' | 'labels' | 'columns' | 'cards' | 'card_labels' | 'subtasks' | 'attachments' | 'assignees' | 'finalizing' | 'complete';

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
  attachments: 'Recording attachments...',
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
  attachments: 93,
  assignees: 97,
  finalizing: 99,
  complete: 100,
};

export function BoardImportDialog({ open, onOpenChange, onImportComplete }: BoardImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importSource, setImportSource] = useState<ImportSource>('wekan');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ stage: 'idle', current: 0, total: 0 });

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
    wekanData: any,
    onProgress: (stage: ImportStage, current?: number, total?: number, detail?: string) => void
  ): Promise<ImportResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          reject(new Error('Not authenticated'));
          return;
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/import-wekan-board?stream=true`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ wekanData }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          try {
            const errorJson = JSON.parse(errorText);
            reject(new Error(errorJson.errors?.[0] || 'Import failed'));
          } catch {
            reject(new Error(`Import failed: ${response.status}`));
          }
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          reject(new Error('No response body'));
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
                    'attachments': 'attachments',
                    'complete': 'complete',
                  };
                  const stage = stageMap[data.stage] || 'parsing';
                  onProgress(stage, data.current, data.total, data.detail);
                } else if (data.type === 'result') {
                  resolve(data as ImportResult);
                  return;
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, line);
              }
            }
          }
        }

        // If we get here without a result, something went wrong
        reject(new Error('Stream ended without result'));
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

  const importTrelloBoard = async (trelloData: TrelloBoard, onProgress: (stage: ImportStage, current?: number, total?: number, detail?: string) => void): Promise<ImportResult> => {
    const result: ImportResult = {
      success: false,
      workspaces_created: 0,
      boards_created: 0,
      columns_created: 0,
      cards_created: 0,
      labels_created: 0,
      subtasks_created: 0,
      attachments_noted: 0,
      attachments_pending: 0,
      assignees_pending: 0,
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
      const { data: { user } } = await supabase.auth.getUser();
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
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: workspaceName,
          description: trelloData.desc || `Imported from Trello on ${new Date().toISOString()}`,
          owner_id: user.id,
        })
        .select()
        .single();

      if (workspaceError) {
        result.errors.push(`Failed to create workspace: ${workspaceError.message}`);
        return result;
      }
      result.workspaces_created = 1;

      onProgress('board', 0, 0, 'Creating board...');
      // Create board
      const { data: board, error: boardError } = await supabase
        .from('boards')
        .insert({
          name: trelloData.name,
          description: trelloData.desc || null,
          workspace_id: workspace.id,
          background_color: '#0079bf',
        })
        .select()
        .single();

      if (boardError) {
        result.errors.push(`Failed to create board: ${boardError.message}`);
        return result;
      }
      result.boards_created = 1;

      // Add current user as board admin
      await supabase.from('board_members').insert({
        board_id: board.id,
        user_id: user.id,
        role: 'admin',
      });

      const trelloLabels = trelloData.labels || [];
      onProgress('labels', 0, trelloLabels.length, `Creating ${trelloLabels.length} labels...`);
      // Create labels and build mapping
      const labelMap = new Map<string, string>();
      
      for (let labelIdx = 0; labelIdx < trelloLabels.length; labelIdx++) {
        const label = trelloLabels[labelIdx];
        if (!label.name && !label.color) continue;
        
        onProgress('labels', labelIdx + 1, trelloLabels.length, `Label ${labelIdx + 1}/${trelloLabels.length}`);
        const labelColor = label.color ? (trelloColorMap[label.color] || '#6b7280') : '#6b7280';
        const labelName = label.name || label.color || 'Unnamed';
        
        const { data: newLabel, error: labelError } = await supabase
          .from('labels')
          .insert({
            board_id: board.id,
            name: labelName,
            color: labelColor,
          })
          .select()
          .single();

        if (labelError) {
          result.warnings.push(`Failed to create label "${labelName}": ${labelError.message}`);
        } else {
          labelMap.set(label.id, newLabel.id);
          result.labels_created++;
        }
      }

      const sortedLists = [...(trelloData.lists || [])]
        .filter(list => !list.closed)
        .sort((a, b) => a.pos - b.pos);
      onProgress('columns', 0, sortedLists.length, `Creating ${sortedLists.length} columns...`);
      // Create columns (lists) and build mapping
      const columnMap = new Map<string, string>();

      for (let i = 0; i < sortedLists.length; i++) {
        const list = sortedLists[i];
        onProgress('columns', i + 1, sortedLists.length, `Column ${i + 1}/${sortedLists.length}: ${list.name}`);
        const { data: column, error: columnError } = await supabase
          .from('columns')
          .insert({
            board_id: board.id,
            title: list.name,
            position: i,
          })
          .select()
          .single();

        if (columnError) {
          result.warnings.push(`Failed to create column "${list.name}": ${columnError.message}`);
        } else {
          columnMap.set(list.id, column.id);
          result.columns_created++;
        }
      }

      // Build checklist map
      const checklistMap = new Map<string, TrelloChecklist[]>();
      for (const checklist of (trelloData.checklists || [])) {
        const existing = checklistMap.get(checklist.idCard) || [];
        existing.push(checklist);
        checklistMap.set(checklist.idCard, existing);
      }

      // Group cards by list
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

      let cardIndex = 0;
      for (const [listId, cards] of cardsByList) {
        const columnId = columnMap.get(listId);
        if (!columnId) {
          result.warnings.push(`Skipped ${cards.length} cards from archived/missing list`);
          cardIndex += cards.length;
          continue;
        }

        for (let i = 0; i < cards.length; i++) {
          cardIndex++;
          const card = cards[i];
          onProgress('cards', cardIndex, sortedCards.length, `Card ${cardIndex}/${sortedCards.length}: ${card.name.substring(0, 30)}${card.name.length > 30 ? '...' : ''}`);
          
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

          const { data: newCard, error: cardError } = await supabase
            .from('cards')
            .insert({
              column_id: columnId,
              title: card.name,
              description: markdownToHtml(card.desc),
              due_date: card.due || null,
              position: i,
              priority,
              created_by: user.id,
            })
            .select()
            .single();

          if (cardError) {
            result.warnings.push(`Failed to create card "${card.name}": ${cardError.message}`);
            continue;
          }
          result.cards_created++;

          // Create card-label associations
          for (const labelId of card.idLabels) {
            const mappedLabelId = labelMap.get(labelId);
            if (mappedLabelId) {
              await supabase.from('card_labels').insert({
                card_id: newCard.id,
                label_id: mappedLabelId,
              });
            }
          }

          // Create subtasks from checklists
          const cardChecklists = checklistMap.get(card.id) || [];
          if (cardChecklists.length > 0) {
            onProgress('subtasks', 0, 0, `Processing checklists for "${card.name.substring(0, 20)}..."`);
          }
          let subtaskPosition = 0;
          
          for (const checklist of cardChecklists) {
            const sortedItems = [...checklist.checkItems].sort((a, b) => a.pos - b.pos);
            
            for (const item of sortedItems) {
              const { error: subtaskError } = await supabase
                .from('card_subtasks')
                .insert({
                  card_id: newCard.id,
                  title: item.name,
                  completed: item.state === 'complete',
                  position: subtaskPosition++,
                  checklist_name: checklist.name,
                });

              if (subtaskError) {
                result.warnings.push(`Failed to create subtask "${item.name}": ${subtaskError.message}`);
              } else {
                result.subtasks_created++;
              }
            }
          }

          // Create pending attachment records
          const attachments = card.attachments || [];
          if (attachments.length > 0) {
            onProgress('attachments', 0, attachments.length, `Recording ${attachments.length} attachments...`);
            result.attachments_noted += attachments.length;
            
            for (const attachment of attachments) {
              // Create pending attachment for tracking
              const { error: pendingAttachError } = await supabase
                .from('import_pending_attachments')
                .insert({
                  board_id: board.id,
                  card_id: newCard.id,
                  original_attachment_id: attachment.id,
                  original_name: attachment.name,
                  original_url: attachment.url,
                  original_size: attachment.bytes,
                  original_type: attachment.mimeType,
                  import_source: 'trello',
                });

              if (!pendingAttachError) {
                result.attachments_pending++;
              }
            }
          }

          // Create pending assignee mappings
          if (card.idMembers && card.idMembers.length > 0) {
            onProgress('assignees', 0, card.idMembers.length, `Recording ${card.idMembers.length} assignees...`);
            for (const memberId of card.idMembers) {
              const member = memberMap.get(memberId);
              const memberName = member?.fullName || member?.username || `Unknown (${memberId})`;
              const username = member?.username || null;

              const { error: pendingError } = await supabase
                .from('import_pending_assignees')
                .insert({
                  board_id: board.id,
                  card_id: newCard.id,
                  original_member_id: memberId,
                  original_member_name: memberName,
                  original_username: username,
                  import_source: 'trello',
                });

              if (!pendingError) {
                result.assignees_pending++;
              }
            }
          }
        }
      }

      onProgress('finalizing', 0, 0, 'Finalizing import...');
      result.success = true;
    } catch (error: any) {
      result.errors.push(`Unexpected error: ${error.message}`);
    }

    return result;
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

    setImporting(true);
    setImportResult(null);
    updateProgress('parsing');

    try {
      const fileContent = await selectedFile.text();
      updateProgress('validating');
      let jsonData;
      
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'The file contains invalid JSON.',
          variant: 'destructive',
        });
        setImporting(false);
        updateProgress('idle');
        return;
      }

      let result: ImportResult;

      if (importSource === 'trello') {
        result = await importTrelloBoard(jsonData as TrelloBoard, updateProgress);
      } else {
        // For Wekan, use streaming SSE to get real-time progress
        result = await importWekanWithStreaming(jsonData, updateProgress);
      }

      updateProgress('complete');
      setImportResult(result);

      if (result.success) {
        toast({
          title: 'Import completed',
          description: `Imported ${result.boards_created} board(s) with ${result.cards_created} card(s).`,
        });
        onImportComplete();
        // Auto-close after successful import
        setTimeout(() => {
          handleOpenChange(false);
        }, 2000);
      } else {
        toast({
          title: 'Import failed',
          description: result.errors.join(', '),
          variant: 'destructive',
        });
        updateProgress('idle');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      updateProgress('idle');
    } finally {
      setImporting(false);
    }
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setImportResult(null);
    setImportSource('wekan');
    updateProgress('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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

          {importSource === 'wekan' && (
            <div className="rounded-md border p-3 bg-muted/50">
              <h4 className="font-medium text-sm mb-2">Import Mapping:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Wekan Boards → KanBoard Boards</li>
                <li>• Wekan Lists → KanBoard Columns</li>
                <li>• Wekan Cards → KanBoard Cards</li>
                <li>• Wekan Labels → KanBoard Labels</li>
                <li>• Wekan Checklists → KanBoard Subtasks</li>
                <li>• Wekan Members → Pending (use Assignee Mapping)</li>
                <li className="text-amber-600">• Comments are ignored</li>
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
                <li>• Trello Members → Pending (use Assignee Mapping)</li>
                <li className="text-amber-600">• Comments ignored, archived items skipped</li>
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
                    <p>✓ Workspaces: {importResult.workspaces_created}</p>
                    <p>✓ Boards: {importResult.boards_created}</p>
                    <p>✓ Columns: {importResult.columns_created}</p>
                    <p>✓ Cards: {importResult.cards_created}</p>
                    <p>✓ Labels: {importResult.labels_created}</p>
                    <p>✓ Subtasks: {importResult.subtasks_created}</p>
                    {importResult.attachments_noted > 0 && (
                      <p className="text-amber-600">⚠ {importResult.attachments_noted} attachments</p>
                    )}
                    {importResult.assignees_pending > 0 && (
                      <p className="text-blue-600">ℹ {importResult.assignees_pending} assignees pending mapping</p>
                    )}
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
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
    </Dialog>
  );
}