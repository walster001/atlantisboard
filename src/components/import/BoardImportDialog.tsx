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

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to import.',
        variant: 'destructive',
      });
      return;
    }

    if (importSource !== 'wekan') {
      toast({
        title: 'Not implemented',
        description: `${importSource === 'trello' ? 'Trello' : 'CSV/TSV'} import is not yet available.`,
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

      // Call the edge function to process the import
      const { data, error } = await supabase.functions.invoke('import-wekan-board', {
        body: { wekanData: jsonData },
      });

      if (error) throw error;

      const result = data as ImportResult;
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
                <SelectItem value="trello" disabled>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    Trello (Coming Soon)
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
          {importSource === 'wekan' && (
            <div className="space-y-2">
              <Label>Wekan Export File</Label>
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

          {/* Import Mapping Info */}
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
                        ⚠ {importResult.attachments_noted} attachments noted (manual upload required)
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
