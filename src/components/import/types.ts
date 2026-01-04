/**
 * Import/Export Data Types
 * 
 * Type definitions for Wekan and Trello board import/export data structures.
 */

// ============================================================================
// Trello Types (from Trello JSON export format)
// ============================================================================

export interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: TrelloCheckItem[];
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  bytes: number | null;
  mimeType: string | null;
  date: string;
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idLabels: string[];
  idMembers: string[];
  pos: number;
  dateLastActivity: string;
  attachments?: TrelloAttachment[];
  closed: boolean;
  cover?: {
    color?: string | null;
    brightness?: string;
  };
}

export interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
}

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  lists: TrelloList[];
  cards: TrelloCard[];
  labels: TrelloLabel[];
  checklists: TrelloChecklist[];
  members?: TrelloMember[];
}

// ============================================================================
// Wekan Types (from Wekan JSON export format)
// ============================================================================

// Wekan data structure is more complex and can vary
// These types represent the common structure based on code analysis

export interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  swimlaneId?: string;
  boardId: string;
  sort?: number;
  dueAt?: string | null;
  createdAt?: string;
  modifiedAt?: string;
  archived?: boolean;
  members?: string[];
  labelIds?: string[];
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

export interface WekanList {
  _id: string;
  title: string;
  boardId: string;
  sort?: number;
  archived?: boolean;
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

export interface WekanSwimlane {
  _id: string;
  title: string;
  boardId: string;
  sort?: number;
  archived?: boolean;
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

export interface WekanLabel {
  _id: string;
  name: string;
  color: string;
  boardId: string;
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

export interface WekanMember {
  _id: string;
  username?: string;
  profile?: {
    fullname?: string;
    avatarUrl?: string;
  };
  isAdmin?: boolean;
  isActive?: boolean;
  isNoComments?: boolean;
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

export interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  archived?: boolean;
  createdAt?: string;
  modifiedAt?: string;
  // Wekan can have either swimlanes or lists (or both)
  swimlanes?: WekanSwimlane[];
  lists?: WekanList[];
  cards?: WekanCard[];
  labels?: WekanLabel[];
  members?: WekanMember[];
  // Additional Wekan-specific properties may exist
  [key: string]: unknown;
}

// Wekan exports can be a single board or an array of boards
export type WekanExport = WekanBoard | WekanBoard[];

