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

export const ActivityLog = lazy(async () => {
  const m = await import('../activities/ActivityLog.js');
  return { default: m.ActivityLog };
});

export function TabPanelFallback() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  );
}

export type TopTab = 'board' | 'users' | 'theme' | 'audit';
export type BoardSideNav = 'card-settings' | 'list-settings' | 'labels';
export type ThemeSideNav = 'theme-colouring' | 'background';
export type MobileDetail =
  | null
  | { readonly kind: 'board'; readonly section: BoardSideNav }
  | { readonly kind: 'users' }
  | { readonly kind: 'theme'; readonly section: ThemeSideNav }
  | { readonly kind: 'audit' };
