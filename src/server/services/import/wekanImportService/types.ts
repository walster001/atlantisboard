export interface WekanBoard {
  _id: string;
  title: string;
  description?: string;
  archived: boolean;
  background?: string;
  permission?: 'private' | 'public';
  members?: Array<{
    userId: string;
    isAdmin: boolean;
    isActive: boolean;
    isCommentOnly: boolean;
    isNoComments: boolean;
    isWorker: boolean;
    isReadOnly: boolean;
    isReadAssignedOnly: boolean;
    isNormalAssignedOnly: boolean;
    isCommentAssignedOnly: boolean;
    permission?: string;
  }>;
}

export interface WekanList {
  _id: string;
  title: string;
  boardId: string;
  sort: number;
  archived: boolean;
  color?: string;
  wipLimit?: number;
}

export interface WekanCard {
  _id: string;
  title: string;
  description?: string;
  listId: string;
  boardId: string;
  sort: number;
  archived: boolean;
  color?: string;
  dueAt?: string;
  startAt?: string;
  finishedAt?: string;
  cover?: string;
  members?: string[];
  labelIds?: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface WekanLabel {
  _id: string;
  name: string;
  color: string;
  boardId: string;
}

export interface WekanChecklist {
  _id: string;
  title: string;
  cardId: string;
  items?: Array<{
    _id: string;
    title: string;
    sortOrder: number;
    finishedAt?: string;
    isFinished: boolean;
  }>;
}

export interface WekanComment {
  _id: string;
  cardId: string;
  text: string;
  userId: string;
  createdAt: string;
  modifiedAt?: string;
}

export interface WekanAttachment {
  _id: string;
  cardId: string;
  name: string;
  path?: string;
  url?: string;
  type: string;
  size?: number;
  userId: string;
  uploadedAt: string;
}

export interface WekanUser {
  _id: string;
  username?: string;
  emails?: Array<{
    address: string;
    verified: boolean;
  }>;
  profile?: {
    fullname?: string;
  };
}

export interface WekanExport {
  boards: WekanBoard[];
  lists: WekanList[];
  cards: WekanCard[];
  labels?: WekanLabel[];
  checklists?: WekanChecklist[];
  comments?: WekanComment[];
  attachments?: WekanAttachment[];
  users?: WekanUser[];
}

export interface WekanCardInsertContext {
  readonly listMap: ReadonlyMap<string, string>;
  readonly boardMap: ReadonlyMap<string, string>;
  readonly boardActorMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly labelMap: ReadonlyMap<string, { id: string; name: string; color: string }>;
  readonly checklistsByCardId: ReadonlyMap<string, WekanChecklist[]>;
  readonly commentsByCardId: ReadonlyMap<string, WekanComment[]>;
  readonly attachmentsByCardId: ReadonlyMap<string, WekanAttachment[]>;
  readonly replacementByIconSrc: ReadonlyMap<string, string>;
  readonly localizedByIconSrc: ReadonlyMap<string, string>;
  readonly defaultUncolouredCardColour: string | undefined;
  readonly userId: string;
}
