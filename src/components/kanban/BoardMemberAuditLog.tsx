import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, User, UserPlus, UserMinus, ArrowRight, History, Clock, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface AuditLogEntry {
  id: string;
  board_id: string;
  action: 'added' | 'removed' | 'role_changed';
  target_user_id: string;
  actor_user_id: string | null;
  old_role: string | null;
  new_role: string | null;
  created_at: string;
  target_profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  actor_profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
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

export function BoardMemberAuditLog({ boardId, userRole }: BoardMemberAuditLogProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retentionDays, setRetentionDays] = useState<string>('never');
  const [savingRetention, setSavingRetention] = useState(false);

  // SECURITY: Only admins should access this component
  // This is defense-in-depth; RLS policies also protect the data
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLog();
      fetchRetentionSetting();
    }
  }, [boardId, isAdmin]);

  const fetchRetentionSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('boards')
        .select('audit_log_retention_days')
        .eq('id', boardId)
        .maybeSingle();

      if (error) throw error;
      
      if (data?.audit_log_retention_days === null) {
        setRetentionDays('never');
      } else {
        setRetentionDays(String(data?.audit_log_retention_days || 'never'));
      }
    } catch (error) {
      console.error('Error fetching retention setting:', error);
    }
  };

  const updateRetentionSetting = async (value: string) => {
    setSavingRetention(true);
    try {
      const retentionValue = value === 'never' ? null : parseInt(value, 10);
      
      const { error } = await supabase
        .from('boards')
        .update({ audit_log_retention_days: retentionValue })
        .eq('id', boardId);

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

  const fetchAuditLog = async () => {
    setLoading(true);
    try {
      // Fetch audit log entries
      const { data: logData, error: logError } = await supabase
        .from('board_member_audit_log')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (logError) throw logError;

      // Get unique user IDs for profile lookup
      const userIds = new Set<string>();
      logData?.forEach(entry => {
        userIds.add(entry.target_user_id);
        if (entry.actor_user_id) userIds.add(entry.actor_user_id);
      });

      // Fetch profiles for all users
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', Array.from(userIds));

      if (profileError) throw profileError;

      // Create profile lookup map
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Enrich entries with profile data
      const enrichedEntries = (logData || []).map(entry => ({
        ...entry,
        action: entry.action as 'added' | 'removed' | 'role_changed',
        target_profile: profileMap.get(entry.target_user_id),
        actor_profile: entry.actor_user_id ? profileMap.get(entry.actor_user_id) : undefined,
      }));

      setEntries(enrichedEntries);
    } catch (error) {
      console.error('Error fetching audit log:', error);
    } finally {
      setLoading(false);
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
    const targetName = entry.target_profile?.full_name || entry.target_profile?.email || 'Unknown user';
    const actorName = entry.actor_profile?.full_name || entry.actor_profile?.email || 'System';

    switch (entry.action) {
      case 'added':
        return (
          <span>
            <strong>{actorName}</strong> added <strong>{targetName}</strong> as{' '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.new_role}</Badge>
          </span>
        );
      case 'removed':
        return (
          <span>
            <strong>{actorName}</strong> removed <strong>{targetName}</strong>
            {entry.old_role && (
              <> (was <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.old_role}</Badge>)</>
            )}
          </span>
        );
      case 'role_changed':
        return (
          <span>
            <strong>{actorName}</strong> changed <strong>{targetName}</strong>'s role from{' '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.old_role}</Badge>
            {' → '}
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{entry.new_role}</Badge>
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
            <Label className="text-sm font-medium">Log Retention</Label>
            <p className="text-xs text-muted-foreground">
              Automatically delete old entries to manage database size
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
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <History className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No member changes recorded yet</p>
          <p className="text-xs mt-1">Changes will appear here as they happen</p>
        </div>
      ) : (
        <ScrollArea className="h-[350px] pr-4">
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
                  <p className="text-xs text-muted-foreground mt-1" title={format(new Date(entry.created_at), 'PPpp')}>
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Actor avatar */}
                {entry.actor_profile && (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage src={entry.actor_profile.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      <User className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
