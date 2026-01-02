import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, User, UserPlus, UserMinus, ArrowRight, History, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

interface AuditLogEntry {
  id: string;
  boardId: string;
  action: 'added' | 'removed' | 'role_changed';
  targetUserId: string;
  actorUserId: string | null;
  oldRole: string | null;
  newRole: string | null;
  createdAt: string;
  targetProfile?: {
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  actorProfile?: {
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

interface BoardMemberAuditLogProps {
  boardId: string;
  userRole: 'admin' | 'manager' | 'viewer' | null;
}

const RETENTION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never expire' },
];

const PAGE_SIZE = 20;

export function BoardMemberAuditLog({ boardId, userRole }: BoardMemberAuditLogProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retentionDays, setRetentionDays] = useState<string>('never');
  const [savingRetention, setSavingRetention] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);

  // Use permission system
  // SECURITY: Only those with audit log permission should access this
  const { can } = usePermissions(boardId, userRole);
  const isAdmin = can('board.settings.audit');

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = currentPage < totalPages - 1;
  const hasPrevPage = currentPage > 0;

  useEffect(() => {
    if (isAdmin) {
      fetchRetentionSetting();
      fetchTotalCount();
    }
  }, [boardId, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLog(currentPage);
    }
  }, [boardId, isAdmin, currentPage]);

  const fetchTotalCount = async () => {
    try {
      const { data, error } = await api
        .from('board_member_audit_log')
        .eq('boardId', boardId)
        .count();

      if (error) throw error;
      setTotalCount(data || 0);
    } catch (error) {
      console.error('Error fetching total count:', error);
    }
  };

  const fetchRetentionSetting = async () => {
    try {
      const { data, error } = await api
        .from('app_settings')
        .select('auditLogRetentionDays')
        .eq('id', 'default')
        .maybeSingle();

      if (error) throw error;
      
      if (data?.auditLogRetentionDays === null || data?.auditLogRetentionDays === undefined) {
        setRetentionDays('never');
      } else {
        setRetentionDays(String(data.auditLogRetentionDays || 'never'));
      }
    } catch (error) {
      console.error('Error fetching retention setting:', error);
    }
  };

  const updateRetentionSetting = async (value: string) => {
    setSavingRetention(true);
    try {
      const retentionValue = value === 'never' ? null : parseInt(value, 10);
      
      const { error } = await api
        .from('app_settings')
        .eq('id', 'default')
        .update({ auditLogRetentionDays: retentionValue });

      if (error) throw error;
      
      setRetentionDays(value);
      toast({ title: 'Retention setting updated' });
    } catch (error) {
      console.error('Error updating retention:', error);
      toast({ title: 'Error', description: 'Failed to update retention setting', variant: 'destructive' });
    } finally {
      setSavingRetention(false);
    }
  };

  const fetchAuditLog = useCallback(async (page: number) => {
    if (page === 0) {
      setLoading(true);
    } else {
      setLoadingPage(true);
    }
    
    try {
      const offset = page * PAGE_SIZE;
      
      // Fetch audit log entries with pagination
      const { data: logData, error: logError } = await api
        .from('board_member_audit_log')
        .select('*')
        .eq('boardId', boardId)
        .order('createdAt', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (logError) throw logError;

      // Get unique user IDs for profile lookup
      const userIds = new Set<string>();
      logData?.forEach((entry: any) => {
        if (entry.targetUserId) userIds.add(entry.targetUserId);
        if (entry.actorUserId) userIds.add(entry.actorUserId);
      });

      // Fetch profiles for all users (only if we have user IDs)
      let profileMap = new Map();
      if (userIds.size > 0) {
        const { data: profiles, error: profileError } = await api
          .from('profiles')
          .select('id, fullName, email, avatarUrl')
          .in('id', Array.from(userIds));

        if (profileError) {
          console.error('Error fetching profiles for audit log:', profileError);
          // Continue with empty profile map rather than failing completely
        } else {
          profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);
        }
      }

      // Enrich entries with profile data
      const enrichedEntries = (logData || []).map((entry: any) => ({
        id: entry.id,
        boardId: entry.boardId,
        action: entry.action as 'added' | 'removed' | 'role_changed',
        targetUserId: entry.targetUserId,
        actorUserId: entry.actorUserId,
        oldRole: entry.oldRole,
        newRole: entry.newRole,
        createdAt: entry.createdAt,
        targetProfile: entry.targetUserId ? profileMap.get(entry.targetUserId) : undefined,
        actorProfile: entry.actorUserId ? profileMap.get(entry.actorUserId) : undefined,
      }));

      setEntries(enrichedEntries);
    } catch (error) {
      console.error('Error fetching audit log:', error);
    } finally {
      setLoading(false);
      setLoadingPage(false);
    }
  }, [boardId]);

  const goToNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const goToPrevPage = () => {
    if (hasPrevPage) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'added':
        return <UserPlus className="h-4 w-4 text-green-500" />;
      case 'removed':
        return <UserMinus className="h-4 w-4 text-red-500" />;
      case 'role_changed':
        return <ArrowRight className="h-4 w-4 text-blue-500" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const getActionText = (entry: AuditLogEntry) => {
    const targetName = entry.targetProfile?.fullName || entry.targetProfile?.email || 'Unknown user';
    // Use actor's full name, email, or fallback to "Unknown user" if actorUserId exists but profile is missing
    // Only show "System" if actorUserId is actually null (truly system-generated action)
    const actorName = entry.actorUserId 
      ? (entry.actorProfile?.fullName || entry.actorProfile?.email || 'Unknown user')
      : 'System';

    switch (entry.action) {
      case 'added':
        return (
          <span>
            <strong>{actorName}</strong> added <strong>{targetName}</strong> as{' '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.newRole}</Badge>
          </span>
        );
      case 'removed':
        return (
          <span>
            <strong>{actorName}</strong> removed <strong>{targetName}</strong>
            {entry.oldRole && (
              <> (was <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.oldRole}</Badge>)</>
            )}
          </span>
        );
      case 'role_changed':
        return (
          <span>
            <strong>{actorName}</strong> changed <strong>{targetName}</strong>'s role from{' '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.oldRole}</Badge>
            {' → '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.newRole}</Badge>
          </span>
        );
      default:
        return 'Unknown action';
    }
  };

  // SECURITY: Don't render anything for non-admins
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mb-3 text-destructive opacity-50" />
        <p className="text-sm font-medium">Access Denied</p>
        <p className="text-xs mt-1">Only board administrators can view the audit log</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Retention Settings */}
      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div>
            <Label className="text-sm font-medium">Global Log Retention</Label>
            <p className="text-xs text-muted-foreground">
              Automatically delete old entries across all boards
            </p>
          </div>
        </div>
        <Select 
          value={retentionDays} 
          onValueChange={updateRetentionSetting}
          disabled={savingRetention}
        >
          <SelectTrigger className="w-36">
            {savingRetention ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {RETENTION_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audit Log Entries */}
      {entries.length === 0 && totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <History className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No member changes recorded yet</p>
          <p className="text-xs mt-1">Changes will appear here as they happen</p>
        </div>
      ) : (
        <>
          <ScrollArea className="h-[300px] pr-4 relative">
            {loadingPage && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Action icon */}
                  <div className="mt-0.5 shrink-0">
                    {getActionIcon(entry.action)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{getActionText(entry)}</p>
                    <p className="text-xs text-muted-foreground mt-1" title={format(new Date(entry.createdAt), 'PPpp')}>
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Actor avatar */}
                  {entry.actorProfile && (
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={entry.actorProfile.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        <User className="h-3 w-3" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevPage}
                disabled={!hasPrevPage || loadingPage}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {currentPage + 1} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={!hasNextPage || loadingPage}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
