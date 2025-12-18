import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, MoreHorizontal, Trash2, LogOut, User, Loader2, LayoutDashboard, Settings } from 'lucide-react';
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
}

const BOARD_COLORS = [
  '#0079bf', '#d29034', '#519839', '#b04632',
  '#89609e', '#cd5a91', '#4bbf6b', '#00aecc',
];

export default function Home() {
  const { user, signOut, loading: authLoading, isAppAdmin } = useAuth();
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

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: workspacesData, error: workspacesError } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      if (workspacesError) throw workspacesError;
      setWorkspaces(workspacesData || []);

      const { data: boardsData, error: boardsError } = await supabase
        .from('boards')
        .select('*')
        .order('created_at', { ascending: false });

      if (boardsError) throw boardsError;
      setBoards(boardsData || []);

      // Fetch user's roles for all boards they're a member of
      if (user) {
        const { data: rolesData, error: rolesError } = await supabase
          .from('board_members')
          .select('board_id, role')
          .eq('user_id', user.id);

        if (!rolesError && rolesData) {
          const roles: Record<string, 'admin' | 'manager' | 'viewer'> = {};
          rolesData.forEach((r) => {
            roles[r.board_id] = r.role as 'admin' | 'manager' | 'viewer';
          });
          setBoardRoles(roles);
        }
      }
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

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
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">KanBoard</h1>
            {isAppAdmin && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
                App Admin
              </span>
            )}
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
            )}
          </div>

          {workspaces.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>{isAppAdmin ? 'No workspaces yet. Create one to get started!' : 'No workspaces available. Contact an admin to get access.'}</p>
              </CardContent>
            </Card>
          ) : (
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

                  {/* Boards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {boards
                      .filter((b) => b.workspace_id === workspace.id)
                      .map((board) => (
                        <Card
                          key={board.id}
                          className="group cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
                          onClick={() => navigate(`/board/${board.id}`)}
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
                            {(boardRoles[board.id] === 'admin' || isAppAdmin) && (
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
                                    className="text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteBoard(board.id);
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
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
