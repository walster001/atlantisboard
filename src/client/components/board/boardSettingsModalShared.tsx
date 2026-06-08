import { lazy } from 'react';
import { Center, Loader } from '@mantine/core';

export const LabelManagement = lazy(async () => {
  const m = await import('./LabelManagement.js');
  return { default: m.LabelManagement };
});

export const BoardMemberManagement = lazy(async () => {
  const m = await import('./BoardMemberManagement.js');
  return { default: m.BoardMemberManagement };
});

export const MemberAuditLog = lazy(async () => {
  const m = await import('../activities/MemberAuditLog.js');
  return { default: m.MemberAuditLog };
});

/** @deprecated Use MemberAuditLog */
export const ActivityLog = MemberAuditLog;

export const BoardActivityLog = lazy(async () => {
  const m = await import('../activities/BoardActivityLog.js');
  return { default: m.BoardActivityLog };
});

export function TabPanelFallback() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  );
}

export type TopTab = 'board' | 'users' | 'theme' | 'audit' | 'activity';
export type BoardSideNav = 'card-settings' | 'list-settings' | 'labels';
export type ThemeSideNav = 'theme-colouring' | 'background';
export type MobileDetail =
  | null
  | { readonly kind: 'board'; readonly section: BoardSideNav }
  | { readonly kind: 'users' }
  | { readonly kind: 'theme'; readonly section: ThemeSideNav }
  | { readonly kind: 'audit' }
  | { readonly kind: 'activity' };
