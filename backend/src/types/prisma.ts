/**
 * Prisma Types Export
 * 
 * This file exports Prisma-generated types for use in the frontend.
 * Run `npm run prisma:generate` in the backend directory to generate types.
 * 
 * Note: These types are generated from the Prisma schema and should be
 * kept in sync with the database schema.
 */

// Re-export Prisma client types
export type {
  User,
  Profile,
  Workspace,
  WorkspaceMember,
  Board,
  BoardMember,
  BoardTheme,
  Column,
  Card,
  CardAssignee,
  CardLabel,
  CardAttachment,
  CardSubtask,
  Label,
  CustomRole,
  RolePermission,
  BoardInviteToken,
  BoardMemberAuditLog,
  AppSettings,
  CustomFont,
} from '@prisma/client';

// Re-export enums
export { BoardRole } from '@prisma/client';

// Type helpers for common patterns
export type UserWithProfile = {
  id: string;
  email: string;
  emailVerified: boolean;
  provider: string | null;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    id: string;
    userId: string;
    fullName: string | null;
    avatarUrl: string | null;
    isAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

export type BoardWithRelations = {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  createdById: string;
  backgroundColor: string;
  themeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  workspace: {
    id: string;
    name: string;
    ownerId: string;
  };
  theme: {
    id: string;
    name: string;
    navbarColor: string;
    columnColor: string;
    defaultCardColor: string | null;
    homepageBoardColor: string;
    boardIconColor: string;
    scrollbarColor: string;
    scrollbarTrackColor: string;
  } | null;
};

