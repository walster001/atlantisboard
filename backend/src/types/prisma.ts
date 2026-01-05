// Re-export Prisma namespace for type access
export { Prisma } from '@prisma/client';

// Type helpers - these will be available after Prisma client is fully generated
// For now, types should be inferred from PrismaClient operations or accessed via Prisma namespace
export type PrismaTypes = typeof import('@prisma/client');

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

