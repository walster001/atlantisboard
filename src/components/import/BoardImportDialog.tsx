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

interface ImportResult {
  success: boolean;
  workspaces_created: number;
  boards_created: number;
  columns_created: number;
  cards_created: number;
  labels_created: number;
  subtasks_created: number;
  attachments_noted: number;
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
  members?: { id: string; fullName: string; username: string }[];
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

export function BoardImportDialog({ open, onOpenChange, onImportComplete }: BoardImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importSource, setImportSource] = useState<ImportSource>('wekan');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

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

  const importTrelloBoard = async (trelloData: TrelloBoard): Promise<ImportResult> => {
    const result: ImportResult = {
      success: false,
      workspaces_created: 0,
      boards_created: 0,
      columns_created: 0,
      cards_created: 0,
      labels_created: 0,
      subtasks_created: 0,
      attachments_noted: 0,
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

      // Create labels and build mapping
      const labelMap = new Map<string, string>();
      const trelloLabels = trelloData.labels || [];
      
      for (const label of trelloLabels) {
        if (!label.name && !label.color) continue; // Skip empty labels
        
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

      // Create columns (lists) and build mapping
      const columnMap = new Map<string, string>();
      const sortedLists = [...(trelloData.lists || [])]
        .filter(list => !list.closed)
        .sort((a, b) => a.pos - b.pos);

      for (let i = 0; i < sortedLists.length; i++) {
        const list = sortedLists[i];
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

      // Create cards
      const sortedCards = [...(trelloData.cards || [])]
        .filter(card => !card.closed)
        .sort((a, b) => a.pos - b.pos);

      // Group cards by list for position assignment
      const cardsByList = new Map<string, TrelloCard[]>();
      for (const card of sortedCards) {
        const existing = cardsByList.get(card.idList) || [];
        existing.push(card);
        cardsByList.set(card.idList, existing);
      }

      for (const [listId, cards] of cardsByList) {
        const columnId = columnMap.get(listId);
        if (!columnId) {
          result.warnings.push(`Skipped ${cards.length} cards from archived/missing list`);
          continue;
        }

        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          
          // Map priority based on labels or default to none
          // Trello doesn't have native priority, so we'll check for priority-like labels
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
              description: card.desc || null,
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

          // Note attachments (actual files need manual upload)
          const attachments = card.attachments || [];
          if (attachments.length > 0) {
            result.attachments_noted += attachments.length;
            
            // Store attachment references as notes
            for (const attachment of attachments) {
              const { error: attachmentError } = await supabase
                .from('card_attachments')
                .insert({
                  card_id: newCard.id,
                  file_name: attachment.name,
                  file_url: attachment.url,
                  file_size: attachment.bytes,
                  file_type: attachment.mimeType,
                  uploaded_by: user.id,
                });

              if (attachmentError) {
                result.warnings.push(`Failed to note attachment "${attachment.name}": ${attachmentError.message}`);
              }
            }
          }

          // Note assignees (Trello members can't be auto-mapped)
          if (card.idMembers && card.idMembers.length > 0) {
            const memberNames = (trelloData.members || [])
              .filter(m => card.idMembers.includes(m.id))
              .map(m => m.fullName || m.username);
            
            if (memberNames.length > 0) {
              result.warnings.push(`Card "${card.name}" had assignees: ${memberNames.join(', ')} - assign manually`);
            }
          }
        }
      }

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

    try {
      const fileContent = await selectedFile.text();
      let jsonData;
      
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: 'The file contains invalid JSON. Please check the file format.',
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      let result: ImportResult;

      if (importSource === 'trello') {
        result = await importTrelloBoard(jsonData as TrelloBoard);
      } else {
        // Wekan import via edge function
        const { data, error } = await supabase.functions.invoke('import-wekan-board', {
          body: { wekanData: jsonData },
        });

        if (error) throw error;
        result = data as ImportResult;
      }

      setImportResult(result);

      if (result.success) {
        toast({
          title: 'Import completed',
          description: `Successfully imported ${result.boards_created} board(s) with ${result.cards_created} card(s).`,
        });
        onImportComplete();
      } else {
        toast({
          title: 'Import failed',
          description: result.errors.join(', '),
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error.message || 'An unexpected error occurred during import.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const resetDialog = () => {
    setSelectedFile(null);
    setImportResult(null);
    setImportSource('wekan');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetDialog();
    }
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
          {/* Import Source Selection */}
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

          {/* File Upload */}
          {(importSource === 'wekan' || importSource === 'trello') && (
            <div className="space-y-2">
              <Label>{importSource === 'wekan' ? 'Wekan' : 'Trello'} Export File</Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="cursor-pointer"
                />
              </div>
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          )}

          {/* Import Mapping Info - Wekan */}
          {importSource === 'wekan' && (
            <div className="rounded-md border p-3 bg-muted/50">
              <h4 className="font-medium text-sm mb-2">Import Mapping:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Wekan Boards → KanBoard Boards (new workspace created)</li>
                <li>• Wekan Lists → KanBoard Columns</li>
                <li>• Wekan Cards → KanBoard Cards (title, description, due date)</li>
                <li>• Wekan Labels → KanBoard Labels</li>
                <li>• Wekan Checklists → KanBoard Subtasks</li>
                <li>• Wekan Attachments → Noted (files need manual upload)</li>
                <li>• Wekan Members → Placeholder (assign manually after import)</li>
                <li className="text-amber-600">• Comments are ignored</li>
              </ul>
            </div>
          )}

          {/* Import Mapping Info - Trello */}
          {importSource === 'trello' && (
            <div className="rounded-md border p-3 bg-muted/50">
              <h4 className="font-medium text-sm mb-2">Import Mapping:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Trello Board → KanBoard Board (new workspace created)</li>
                <li>• Trello Lists → KanBoard Columns</li>
                <li>• Trello Cards → KanBoard Cards (title, description, due date)</li>
                <li>• Trello Labels → KanBoard Labels (colors mapped)</li>
                <li>• Trello Checklists → KanBoard Subtasks</li>
                <li>• Trello Attachments → Stored as references (URLs preserved)</li>
                <li>• Trello Members → Noted in warnings (assign manually)</li>
                <li>• Priority inferred from label names (high/medium/low)</li>
                <li className="text-amber-600">• Comments and activity are ignored</li>
                <li className="text-amber-600">• Archived lists/cards are skipped</li>
              </ul>
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <ScrollArea className="h-[200px] rounded-md border p-3">
              <div className="space-y-2">
                <div className={`flex items-center gap-2 ${importResult.success ? 'text-green-600' : 'text-destructive'}`}>
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    {importResult.success ? 'Import Successful' : 'Import Failed'}
                  </span>
                </div>

                {importResult.success && (
                  <div className="text-sm space-y-1">
                    <p>✓ Workspaces created: {importResult.workspaces_created}</p>
                    <p>✓ Boards created: {importResult.boards_created}</p>
                    <p>✓ Columns created: {importResult.columns_created}</p>
                    <p>✓ Cards created: {importResult.cards_created}</p>
                    <p>✓ Labels created: {importResult.labels_created}</p>
                    <p>✓ Subtasks created: {importResult.subtasks_created}</p>
                    {importResult.attachments_noted > 0 && (
                      <p className="text-amber-600">
                        ⚠ {importResult.attachments_noted} attachments referenced (URLs preserved)
                      </p>
                    )}
                  </div>
                )}

                {importResult.warnings.length > 0 && (
                  <div className="text-sm text-amber-600 space-y-1">
                    <p className="font-medium">Warnings:</p>
                    {importResult.warnings.map((w, i) => (
                      <p key={i}>• {w}</p>
                    ))}
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

          {/* Actions */}
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
