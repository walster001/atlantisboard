import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings } from '@/hooks/useAppSettings';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, MoreHorizontal, Trash2, LogOut, User, Loader2, LayoutDashboard, Settings, Pencil, FileText, Upload, Users, Paperclip } from 'lucide-react';
import { BoardImportDialog } from '@/components/import/BoardImportDialog';
import { AssigneeMappingDialog } from '@/components/import/AssigneeMappingDialog';
import { ImportAttachmentDialog } from '@/components/import/ImportAttachmentDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserFriendlyError } from '@/lib/errorHandler';
import { workspaceSchema, boardSchema, sanitizeColor } from '@/lib/validators';
import { z } from 'zod';

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
}

interface Board {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  background_color: string;
  position: number;
}

const BOARD_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632',
  '#89609e', '#cd5a91', '#4bbf6b', '#00aecc',
];

export default function Home() {
  const { user, signOut, loading: authLoading, isAppAdmin } = useAuth();
  const { settings: appSettings, appName, ensureLoaded } = useAppSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardRoles, setBoardRoles] = useState<Record<string, 'admin' | 'manager' | 'viewer'>>({});
  const [loading, setLoading] = useState(true);
  
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardColor, setNewBoardColor] = useState(BOARD_COLORS[0]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);

  // Edit board state
  const [editBoardId, setEditBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [renameBoardDialogOpen, setRenameBoardDialogOpen] = useState(false);
  const [editDescDialogOpen, setEditDescDialogOpen] = useState(false);
  const [deleteBoardId, setDeleteBoardId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [assigneeMappingOpen, setAssigneeMappingOpen] = useState(false);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [pendingAttachmentCount, setPendingAttachmentCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
      ensureLoaded(); // Load app settings when home page mounts
    }
  }, [user, ensureLoaded]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Single server-side call to get all home data
      const { data, error } = await supabase.rpc('get_home_data', {
        _user_id: user.id
      });

      if (error) throw error;

      // Cast JSON response to typed object
      const result = data as {
        workspaces?: Workspace[];
        boards?: Board[];
        board_roles?: Record<string, 'admin' | 'manager' | 'viewer'>;
      };

      setWorkspaces(result?.workspaces || []);
      setBoards(result?.boards || []);
      setBoardRoles(result?.board_roles || {});

      // Fetch pending attachment count for admins
      const { count } = await supabase
        .from('import_pending_attachments')
        .select('*', { count: 'exact', head: true })
        .is('resolved_at', null);
      setPendingAttachmentCount(count || 0);
    } catch (error: any) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createWorkspace = async () => {
    if (!user) return;

    try {
      // Validate input
      const validated = workspaceSchema.parse({
        name: newWorkspaceName,
        description: newWorkspaceDesc || null,
      });

      const { data: workspace, error } = await supabase
        .from('workspaces')
        .insert({
          name: validated.name,
          description: validated.description,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add owner as workspace member
      await supabase.from('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: user.id,
      });

      setWorkspaces([workspace, ...workspaces]);
      setNewWorkspaceName('');
      setNewWorkspaceDesc('');
      setWorkspaceDialogOpen(false);
      toast({ title: 'Workspace created!' });
    } catch (error: any) {
      console.error('Create workspace error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const deleteWorkspace = async (id: string) => {
    try {
      const { error } = await supabase.from('workspaces').delete().eq('id', id);
      if (error) throw error;
      setWorkspaces(workspaces.filter((w) => w.id !== id));
      setBoards(boards.filter((b) => b.workspace_id !== id));
      toast({ title: 'Workspace deleted' });
    } catch (error: any) {
      console.error('Delete workspace error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const createBoard = async () => {
    if (!selectedWorkspaceId || !user) return;

    try {
      // Validate input
      const validated = boardSchema.parse({
        name: newBoardName,
        background_color: newBoardColor,
      });

      const { data: board, error } = await supabase
        .from('boards')
        .insert({
          workspace_id: selectedWorkspaceId,
          name: validated.name,
          background_color: validated.background_color,
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as board admin
      await supabase.from('board_members').insert({
        board_id: board.id,
        user_id: user.id,
        role: 'admin',
      });

      setBoards([board, ...boards]);
      setNewBoardName('');
      setNewBoardColor(BOARD_COLORS[0]);
      setBoardDialogOpen(false);
      toast({ title: 'Board created!' });
    } catch (error: any) {
      console.error('Create board error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      const { error } = await supabase.from('boards').delete().eq('id', id);
      if (error) throw error;
      setBoards(boards.filter((b) => b.id !== id));
      toast({ title: 'Board deleted' });
    } catch (error: any) {
      console.error('Delete board error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const renameBoard = async () => {
    if (!editBoardId) return;
    try {
      const validated = boardSchema.parse({ name: editBoardName, background_color: '#0079bf' });
      const { error } = await supabase
        .from('boards')
        .update({ name: validated.name })
        .eq('id', editBoardId);
      if (error) throw error;
      setBoards(boards.map((b) => (b.id === editBoardId ? { ...b, name: validated.name } : b)));
      setRenameBoardDialogOpen(false);
      setEditBoardId(null);
      toast({ title: 'Board renamed' });
    } catch (error: any) {
      console.error('Rename board error:', error);
      if (error instanceof z.ZodError) {
        toast({ title: 'Validation Error', description: error.errors[0].message, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
      }
    }
  };

  const updateBoardDescription = async () => {
    if (!editBoardId) return;
    try {
      const { error } = await supabase
        .from('boards')
        .update({ description: editBoardDesc || null })
        .eq('id', editBoardId);
      if (error) throw error;
      setBoards(boards.map((b) => (b.id === editBoardId ? { ...b, description: editBoardDesc || null } : b)));
      setEditDescDialogOpen(false);
      setEditBoardId(null);
      toast({ title: 'Description updated' });
    } catch (error: any) {
      console.error('Update description error:', error);
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Handle board drag and drop
  const onDragEnd = useCallback(async (result: DropResult) => {
    if (!user) return;
    
    const { destination, source, draggableId } = result;
    
    // Dropped outside a droppable area
    if (!destination) return;
    
    // Dropped in same position
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const sourceWorkspaceId = source.droppableId;
    const destWorkspaceId = destination.droppableId;
    const boardId = draggableId;

    // Check if user can edit this board
    if (boardRoles[boardId] !== 'admin' && !isAppAdmin) {
      toast({ title: 'Permission denied', description: 'You must be a board admin to move this board.', variant: 'destructive' });
      return;
    }

    // Get boards in source and destination workspaces
    const sourceBoards = boards
      .filter(b => b.workspace_id === sourceWorkspaceId)
      .sort((a, b) => a.position - b.position);
    const destBoards = sourceWorkspaceId === destWorkspaceId
      ? sourceBoards
      : boards.filter(b => b.workspace_id === destWorkspaceId).sort((a, b) => a.position - b.position);

    const draggedBoard = boards.find(b => b.id === boardId);
    if (!draggedBoard) return;

    // Optimistically update local state
    if (sourceWorkspaceId === destWorkspaceId) {
      // Same workspace reordering
      const newBoards = Array.from(sourceBoards);
      const [removed] = newBoards.splice(source.index, 1);
      newBoards.splice(destination.index, 0, removed);
      
      const updatedBoards = newBoards.map((b, idx) => ({ ...b, position: idx }));
      
      setBoards(prev => {
        const others = prev.filter(b => b.workspace_id !== sourceWorkspaceId);
        return [...others, ...updatedBoards];
      });

      // Update database
      await supabase.rpc('batch_update_board_positions', {
        _user_id: user.id,
        _workspace_id: sourceWorkspaceId,
        _updates: updatedBoards.map(b => ({ id: b.id, position: b.position }))
      });
    } else {
      // Moving between workspaces
      const newSourceBoards = sourceBoards.filter(b => b.id !== boardId);
      const newDestBoards = [...destBoards];
      const updatedBoard = { ...draggedBoard, workspace_id: destWorkspaceId, position: destination.index };
      newDestBoards.splice(destination.index, 0, updatedBoard);

      // Update positions
      const updatedSourceBoards = newSourceBoards.map((b, idx) => ({ ...b, position: idx }));
      const updatedDestBoards = newDestBoards.map((b, idx) => ({ ...b, position: idx }));

      setBoards(prev => {
        const others = prev.filter(b => b.workspace_id !== sourceWorkspaceId && b.workspace_id !== destWorkspaceId);
        return [...others, ...updatedSourceBoards, ...updatedDestBoards];
      });

      // Update database
      const { data, error } = await supabase.rpc('move_board_to_workspace', {
        _user_id: user.id,
        _board_id: boardId,
        _new_workspace_id: destWorkspaceId,
        _new_position: destination.index
      });

      if (error || (data as any)?.error) {
        toast({ title: 'Error moving board', description: (data as any)?.error || getUserFriendlyError(error), variant: 'destructive' });
        // Revert by refetching
        fetchData();
      } else {
        toast({ title: 'Board moved successfully' });
      }
    }
  }, [boards, boardRoles, user, isAppAdmin, toast, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kanban-bg">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {appSettings?.custom_home_logo_enabled && appSettings?.custom_home_logo_url ? (
              <img
                src={appSettings.custom_home_logo_url}
                alt="Logo"
                style={{ width: appSettings.custom_home_logo_size, height: appSettings.custom_home_logo_size }}
                className="object-contain"
              />
            ) : (
              <LayoutDashboard className="h-6 w-6 text-primary" />
            )}
            <h1 className="text-xl font-bold">{appName}</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{user?.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAppAdmin && (
                <DropdownMenuItem onClick={() => navigate('/admin/config')}>
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Workspaces Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Your Workspaces</h2>
            {isAppAdmin && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setAttachmentDialogOpen(true)} className="relative">
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attachments
                  {pendingAttachmentCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-xs font-medium rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                      {pendingAttachmentCount > 99 ? '99+' : pendingAttachmentCount}
                    </span>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setAssigneeMappingOpen(true)}>
                  <Users className="h-4 w-4 mr-2" />
                  Map Assignees
                </Button>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      New Workspace
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Workspace</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={newWorkspaceName}
                          onChange={(e) => setNewWorkspaceName(e.target.value)}
                          placeholder="My Workspace"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input
                          value={newWorkspaceDesc}
                          onChange={(e) => setNewWorkspaceDesc(e.target.value)}
                          placeholder="Team projects and tasks"
                          maxLength={500}
                        />
                      </div>
                      <Button onClick={createWorkspace} className="w-full">
                        Create Workspace
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          {workspaces.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>{isAppAdmin ? 'No workspaces yet. Create one to get started!' : 'No workspaces available. Contact an admin to get access.'}</p>
              </CardContent>
            </Card>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="space-y-6">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">{workspace.name}</h3>
                        {workspace.description && (
                          <p className="text-sm text-muted-foreground">{workspace.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(workspace.owner_id === user?.id || isAppAdmin) && (
                          <Dialog
                            open={boardDialogOpen && selectedWorkspaceId === workspace.id}
                            onOpenChange={(open) => {
                              setBoardDialogOpen(open);
                              if (open) setSelectedWorkspaceId(workspace.id);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="h-4 w-4 mr-1" />
                                Add Board
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Create Board</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                  <Label>Board Name</Label>
                                  <Input
                                    value={newBoardName}
                                    onChange={(e) => setNewBoardName(e.target.value)}
                                    placeholder="Project Board"
                                    maxLength={100}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Background Color</Label>
                                  <div className="flex gap-2 flex-wrap">
                                    {BOARD_COLORS.map((color) => (
                                      <button
                                        key={color}
                                        className={`w-8 h-8 rounded-md transition-all ${
                                          newBoardColor === color ? 'ring-2 ring-primary ring-offset-2' : ''
                                        }`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setNewBoardColor(color)}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <Button onClick={createBoard} className="w-full">
                                  Create Board
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        {(workspace.owner_id === user?.id || isAppAdmin) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteWorkspace(workspace.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Boards Grid - Droppable */}
                    <Droppable droppableId={workspace.id} direction="horizontal">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 min-h-[120px] rounded-lg transition-colors ${
                            snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-dashed' : ''
                          }`}
                        >
                          {boards
                            .filter((b) => b.workspace_id === workspace.id)
                            .sort((a, b) => a.position - b.position)
                            .map((board, index) => {
                              const canDrag = boardRoles[board.id] === 'admin' || isAppAdmin;
                              return (
                                <Draggable 
                                  key={board.id} 
                                  draggableId={board.id} 
                                  index={index}
                                  isDragDisabled={!canDrag}
                                >
                                  {(provided, snapshot) => (
                                    <Card
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`group hover:shadow-lg transition-all overflow-hidden ${
                                        snapshot.isDragging ? 'shadow-xl rotate-2 scale-105' : ''
                                      } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                                      onClick={() => !snapshot.isDragging && navigate(`/board/${board.id}`)}
                                    >
                                      <div
                                        className="h-24 flex items-end p-3"
                                        style={{ backgroundColor: sanitizeColor(board.background_color) }}
                                      >
                                        <CardTitle className="text-white text-lg drop-shadow-md">
                                          {board.name}
                                        </CardTitle>
                                      </div>
                                      <CardContent className="p-3 flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">
                                          {board.description || 'No description'}
                                        </span>
                                        {canDrag && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger
                                              asChild
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                              >
                                                <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditBoardId(board.id);
                                                  setEditBoardName(board.name);
                                                  setRenameBoardDialogOpen(true);
                                                }}
                                              >
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Rename Board
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditBoardId(board.id);
                                                  setEditBoardDesc(board.description || '');
                                                  setEditDescDialogOpen(true);
                                                }}
                                              >
                                                <FileText className="h-4 w-4 mr-2" />
                                                Edit Description
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeleteBoardId(board.id);
                                                  setDeleteConfirmOpen(true);
                                                }}
                                              >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete Board
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                      </CardContent>
                                    </Card>
                                  )}
                                </Draggable>
                              );
                            })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </div>
      </main>

      {/* Rename Board Dialog */}
      <Dialog open={renameBoardDialogOpen} onOpenChange={setRenameBoardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Board Name</Label>
              <Input
                value={editBoardName}
                onChange={(e) => setEditBoardName(e.target.value)}
                placeholder="Board name"
                maxLength={100}
              />
            </div>
            <Button onClick={renameBoard} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Description Dialog */}
      <Dialog open={editDescDialogOpen} onOpenChange={setEditDescDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editBoardDesc}
                onChange={(e) => setEditBoardDesc(e.target.value)}
                placeholder="Board description (optional)"
                maxLength={500}
                rows={4}
              />
            </div>
            <Button onClick={updateBoardDescription} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this board? This action cannot be undone and all cards and data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteBoardId) {
                  deleteBoard(deleteBoardId);
                  setDeleteBoardId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Board Import Dialog */}
      <BoardImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={fetchData}
      />

      {/* Assignee Mapping Dialog */}
      <AssigneeMappingDialog
        open={assigneeMappingOpen}
        onOpenChange={setAssigneeMappingOpen}
        onMappingComplete={fetchData}
      />

      {/* Import Attachment Dialog */}
      <ImportAttachmentDialog
        open={attachmentDialogOpen}
        onOpenChange={setAttachmentDialogOpen}
        onComplete={fetchData}
      />
    </div>
  );
}
