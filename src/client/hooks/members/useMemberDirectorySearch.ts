import { useCallback, useEffect, useReducer, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { api } from '../../utils/api.js';
import {
  isSearchRequestCancelled,
  MEMBER_DIRECTORY_PAGE_LIMIT,
  type MemberUserRow,
  sortDirectoryUserRows,
} from './memberDirectoryUtils.js';

export type MemberDirectorySearchScope = 'board' | 'workspace' | 'app-admin';

export interface UseMemberDirectorySearchOptions<
  TUser extends MemberUserRow = MemberUserRow,
> {
  readonly scope: MemberDirectorySearchScope;
  readonly scopeId?: string;
  readonly refreshKey?: number;
  readonly mapUsers?: (users: readonly unknown[]) => readonly TUser[];
  readonly onUsersLoaded?: (
    users: readonly TUser[],
    context: { readonly append: boolean; readonly query: string },
  ) => void;
}

interface DirectorySearchState<TUser extends MemberUserRow> {
  readonly query: string;
  readonly users: TUser[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly nextCursor: string | undefined;
}

type DirectorySearchAction<TUser extends MemberUserRow> =
  | { readonly type: 'query-changed'; readonly query: string }
  | { readonly type: 'search-started' }
  | { readonly type: 'search-succeeded'; readonly users: TUser[]; readonly nextCursor: string | undefined; readonly append: boolean }
  | { readonly type: 'search-failed'; readonly clearUsers: boolean }
  | { readonly type: 'search-settled'; readonly loading: boolean; readonly loadingMore: boolean }
  | { readonly type: 'set-users'; readonly users: TUser[] };

function normalizeNextCursor(nextCursor: string | undefined): string | undefined {
  return nextCursor !== undefined && nextCursor !== '' ? nextCursor : undefined;
}

function directorySearchReducer<TUser extends MemberUserRow>(
  state: DirectorySearchState<TUser>,
  action: DirectorySearchAction<TUser>,
): DirectorySearchState<TUser> {
  switch (action.type) {
    case 'query-changed':
      return { ...state, query: action.query };
    case 'search-started':
      return { ...state, loading: true, nextCursor: undefined };
    case 'search-succeeded':
      if (action.append) {
        const seen = new Set(state.users.map((user) => user._id));
        const merged = [...state.users];
        for (const user of action.users) {
          if (!seen.has(user._id)) {
            seen.add(user._id);
            merged.push(user);
          }
        }
        return {
          ...state,
          users: sortDirectoryUserRows(merged),
          nextCursor: action.nextCursor,
        };
      }
      return {
        ...state,
        users: sortDirectoryUserRows(action.users),
        nextCursor: action.nextCursor,
      };
    case 'search-failed':
      return {
        ...state,
        users: action.clearUsers ? [] : state.users,
        nextCursor: action.clearUsers ? undefined : state.nextCursor,
      };
    case 'search-settled':
      return {
        ...state,
        loading: action.loading,
        loadingMore: action.loadingMore,
      };
    case 'set-users':
      return { ...state, users: action.users };
    default:
      return state;
  }
}

type MemberDirectoryFetchOptions = {
  readonly limit: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
};

function buildMemberDirectoryFetchOptions(
  limit: number,
  cursor?: string,
  signal?: AbortSignal,
): MemberDirectoryFetchOptions {
  return {
    limit,
    ...(cursor !== undefined ? { cursor } : {}),
    ...(signal !== undefined ? { signal } : {}),
  };
}

async function fetchMemberDirectoryPage(
  scope: MemberDirectorySearchScope,
  scopeId: string | undefined,
  query: string,
  options: MemberDirectoryFetchOptions,
): Promise<{ users: unknown[]; nextCursor?: string }> {
  const trimmed = query.trim();
  if (scope === 'workspace' && trimmed === '' && scopeId !== undefined) {
    return api.getWorkspaceMemberCandidates(scopeId, options);
  }

  return api.searchUsers(trimmed, {
    ...(scope === 'board' && scopeId !== undefined ? { boardId: scopeId } : {}),
    ...(scope === 'workspace' && scopeId !== undefined ? { workspaceId: scopeId } : {}),
    ...(scope === 'app-admin' ? { appAdminDirectory: true } : {}),
    ...options,
  });
}

function scopeRequiresId(scope: MemberDirectorySearchScope): boolean {
  return scope === 'board' || scope === 'workspace';
}

export function useMemberDirectorySearch<TUser extends MemberUserRow = MemberUserRow>({
  scope,
  scopeId,
  refreshKey = 0,
  mapUsers,
  onUsersLoaded,
}: UseMemberDirectorySearchOptions<TUser>) {
  const [state, dispatch] = useReducer(directorySearchReducer<TUser>, {
    query: '',
    users: [],
    loading: false,
    loadingMore: false,
    nextCursor: undefined,
  });

  const pagingLockRef = useRef(false);
  const queryRef = useRef(state.query);
  const scopeIdRef = useRef(scopeId);
  const usersRef = useRef(state.users);
  const mapUsersRef = useRef(mapUsers);
  const onUsersLoadedRef = useRef(onUsersLoaded);

  queryRef.current = state.query;
  scopeIdRef.current = scopeId;
  usersRef.current = state.users;
  mapUsersRef.current = mapUsers;
  onUsersLoadedRef.current = onUsersLoaded;

  const resolveUsers = useCallback((rawUsers: readonly unknown[]): TUser[] => {
    const mapper = mapUsersRef.current;
    return mapper != null ? [...mapper(rawUsers)] : [...(rawUsers as TUser[])];
  }, []);

  useEffect(() => {
    if (scopeRequiresId(scope) && (scopeId === undefined || scopeId === '')) {
      return undefined;
    }

    const controller = new AbortController();
    const querySnapshot = state.query;

    dispatch({ type: 'search-started' });

    const run = async (): Promise<void> => {
      try {
        const response = await fetchMemberDirectoryPage(
          scope,
          scopeId,
          querySnapshot,
          buildMemberDirectoryFetchOptions(MEMBER_DIRECTORY_PAGE_LIMIT, undefined, controller.signal),
        );
        if (controller.signal.aborted) {
          return;
        }
        const users = resolveUsers(response.users ?? []);
        dispatch({
          type: 'search-succeeded',
          users,
          nextCursor: normalizeNextCursor(response.nextCursor),
          append: false,
        });
        onUsersLoadedRef.current?.(users, { append: false, query: querySnapshot });
      } catch (error) {
        if (isSearchRequestCancelled(error)) {
          return;
        }
        console.error('Error loading user directory:', error);
        notifications.show({
          color: 'red',
          title: 'Could not load users',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        if (!controller.signal.aborted) {
          dispatch({ type: 'search-failed', clearUsers: true });
        }
      } finally {
        if (!controller.signal.aborted) {
          dispatch({ type: 'search-settled', loading: false, loadingMore: false });
        }
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [scope, scopeId, state.query, refreshKey, resolveUsers]);

  const setDirectoryQuery = useCallback((query: string) => {
    dispatch({ type: 'query-changed', query });
  }, []);

  const setDirectoryUsers = useCallback((updater: TUser[] | ((prev: TUser[]) => TUser[])) => {
    dispatch({
      type: 'set-users',
      users: typeof updater === 'function' ? updater(usersRef.current) : updater,
    });
  }, []);

  const handleDirectoryEndReached = useCallback(() => {
    if (
      state.nextCursor === undefined ||
      state.loading ||
      state.loadingMore ||
      pagingLockRef.current
    ) {
      return;
    }

    if (scopeRequiresId(scope) && (scopeId === undefined || scopeId === '')) {
      return;
    }

    pagingLockRef.current = true;
    dispatch({ type: 'search-settled', loading: state.loading, loadingMore: true });

    const querySnapshot = queryRef.current;
    const scopeIdSnapshot = scopeId;
    const cursorSnapshot = state.nextCursor;

    void (async () => {
      try {
        const response = await fetchMemberDirectoryPage(
          scope,
          scopeIdSnapshot,
          querySnapshot,
          buildMemberDirectoryFetchOptions(MEMBER_DIRECTORY_PAGE_LIMIT, cursorSnapshot),
        );
        if (
          scopeIdRef.current !== scopeIdSnapshot ||
          queryRef.current !== querySnapshot
        ) {
          return;
        }
        const users = resolveUsers(response.users ?? []);
        dispatch({
          type: 'search-succeeded',
          users,
          nextCursor: normalizeNextCursor(response.nextCursor),
          append: true,
        });
        onUsersLoadedRef.current?.(users, { append: true, query: querySnapshot });
      } catch (error) {
        console.error('Error loading more directory users:', error);
        notifications.show({
          color: 'red',
          title: 'Could not load more users',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        pagingLockRef.current = false;
        dispatch({ type: 'search-settled', loading: state.loading, loadingMore: false });
      }
    })();
  }, [
    scope,
    scopeId,
    state.loading,
    state.loadingMore,
    state.nextCursor,
    resolveUsers,
  ]);

  return {
    directoryQuery: state.query,
    setDirectoryQuery,
    directoryUsers: state.users,
    setDirectoryUsers,
    directoryUsersRef: usersRef,
    directoryLoading: state.loading,
    directoryLoadingMore: state.loadingMore,
    directoryNextCursor: state.nextCursor,
    handleDirectoryEndReached,
  };
}
