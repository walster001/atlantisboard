/**
 * API Response Types
 * 
 * Type definitions for API responses to ensure type safety across the application.
 * These types match the database schema and RPC function return types.
 */

// Base API response wrapper (already defined in client.ts, but included for reference)
export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

// Workspace types
export interface WorkspaceResponse {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
}

// Board types
export interface BoardResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  backgroundColor: string | null;
  position: number;
  createdBy: string | null;
  themeId?: string | null;
}

// Column types (database schema)
export interface ColumnResponse {
  id: string;
  boardId: string;
  title: string;
  position: number;
  color: string | null;
  updatedAt?: string;
}

// Card types (database schema)
export interface CardResponse {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  createdBy: string | null;
  color: string | null;
  updatedAt?: string;
}

// Card insert type (for creating cards)
export interface CardInsert {
  columnId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  position: number;
  priority: 'none' | 'low' | 'medium' | 'high';
  createdBy: string;
  color: string | null;
}

// Label types (database schema)
export interface LabelResponse {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

// Card label junction table
export interface CardLabelResponse {
  cardId: string;
  labelId: string;
}

// User profile types
export interface UserProfileResponse {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

// Board member types (from RPC responses)
export interface BoardMemberResponse {
  userId: string;
  role: string;
  profiles: UserProfileResponse;
}

// Card attachment types
export interface CardAttachmentResponse {
  id: string;
  cardId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

// Card subtask types
export interface CardSubtaskResponse {
  id: string;
  cardId: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  position: number;
  checklistName: string | null;
  createdAt: string;
}

// RPC Response types
export interface HomeDataResponse {
  workspaces?: WorkspaceResponse[];
  boards?: BoardResponse[];
  boardRoles?: Record<string, 'admin' | 'manager' | 'viewer'>;
}

export interface BoardDataResponse {
  error?: string;
  board?: {
    id: string;
    name: string;
    description: string | null;
    backgroundColor: string | null;
    workspaceId: string;
    createdBy: string | null;
  };
  userRole?: string | null;
  columns?: ColumnResponse[];
  cards?: CardResponse[];
  labels?: LabelResponse[];
  cardLabels?: CardLabelResponse[];
  members?: BoardMemberResponse[];
}

// Invite token types (for realtime events)
export interface InviteTokenResponse {
  id: string;
  boardId: string;
  token: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

// Workspace membership types (for realtime events)
export interface WorkspaceMemberResponse {
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
}

// Card detail types (for realtime events - attachments, subtasks, assignees, labels)
// CardAttachmentResponse and CardSubtaskResponse are already defined above
// CardLabelResponse is already defined above
export interface CardAssigneeResponse {
  cardId: string;
  userId: string;
  assignedAt: string;
}

// Deletion counts response (for RPC functions)
export interface DeletionCountsResponse {
  boards?: number;
  columns?: number;
  cards?: number;
  members?: number;
  labels?: number;
  attachments?: number;
}

// Move board response (for RPC functions)
export interface MoveBoardResponse {
  error?: string;
  success?: boolean;
}

// Workspace delete response
export interface WorkspaceDeleteResponse {
  success?: boolean;
  error?: string;
}

// Board create response
export interface BoardCreateResponse {
  id: string;
  name: string;
  workspaceId: string;
  backgroundColor: string | null;
  description: string | null;
  position: number;
  createdBy: string | null;
  themeId?: string | null;
}

// User auth response (extends profile with provider)
export interface UserAuthResponse {
  id: string;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
  avatarUrl: string | null;
  provider?: string; // OAuth provider (google, email, etc.)
}

