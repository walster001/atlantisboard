// Shared TypeScript types for models
// These types are used in both client and server

export type BoardVisibility = 'private' | 'workspace' | 'public';
export type Role = 'admin' | 'manager' | 'viewer';
export type Theme = 'light' | 'dark' | 'auto';
export type NotificationType = 'reminder' | 'assignment' | 'comment' | 'mention' | 'invite';
export type InviteType = 'workspace' | 'board';
export type InviteLinkType = 'one-time' | 'recurring';
export type ImportJobType = 'trello' | 'wekan' | 'csv';
export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

