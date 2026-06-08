import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import type { BoardSettingsLivePatch } from '../../store/database.js';
import { BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS } from '../../../shared/constants/boardMemberAuditActivities.js';
import { useBoardDayLog } from '../../components/board-logs/useBoardDayLog.js';
import { parseMemberAuditRow } from '../../components/activities/memberAuditLogParts.js';

export function useMemberAuditLog(
  boardId: string,
  onSettingsLivePatch?: (patch: BoardSettingsLivePatch) => void,
) {
  const dayLog = useBoardDayLog({
    boardId,
    defaultRetentionDays: BOARD_MEMBER_AUDIT_DEFAULT_RETENTION_DAYS,
    retentionField: 'memberActivityLogRetentionDays',
    mode: 'memberAudit',
    parseRow: parseMemberAuditRow,
    ...(onSettingsLivePatch !== undefined ? { onSettingsLivePatch } : {}),
  });

  const [roleLabelByKey, setRoleLabelByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void api
      .getBoardAssignableRoles(boardId)
      .then((r) => {
        if (cancelled) return;
        const roles = Array.isArray(r.roles) ? r.roles : [];
        const mapped: Record<string, string> = {
          admin: 'Admin',
          manager: 'Manager',
          viewer: 'Viewer',
        };
        for (const role of roles) {
          if (typeof role?.key === 'string' && role.key.trim() !== '') {
            mapped[role.key.trim()] =
              typeof role.displayName === 'string' && role.displayName.trim() !== ''
                ? role.displayName.trim()
                : role.key.trim();
          }
        }
        setRoleLabelByKey(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setRoleLabelByKey({ admin: 'Admin', manager: 'Manager', viewer: 'Viewer' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const resolveRoleLabel = useCallback(
    (roleKey: string) => roleLabelByKey[roleKey] ?? roleKey,
    [roleLabelByKey],
  );

  return {
    ...dayLog,
    resolveRoleLabel,
  };
}
