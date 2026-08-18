import { notifications } from '@mantine/notifications';
import type { CardDB, ListDB } from '../../../store/database.js';
import { api } from '../../../utils/api.js';
import { transformCard, transformList } from '../../../utils/transform.js';
import { persistDexieCardPut, persistDexieListPut } from '../../../store/boardDexieCache.js';
import { useBoardRuntimeStore } from '../../../store/boardRuntimeStore.js';
import {
  captionToDescriptionJson,
  titleFromFileName,
  type StorytellingSection,
} from './visualStorytellingModel.js';
import type { VisualStorytellingAddHeroDraft } from './VisualStorytellingAddHero.js';

export type UploadImageToCardFn = (cardId: string, file: File) => Promise<CardDB>;

function commitList(list: ListDB): void {
  useBoardRuntimeStore.getState().upsertList(list);
  void persistDexieListPut(list);
}

function commitCard(card: CardDB): void {
  useBoardRuntimeStore.getState().upsertCard(card);
  void persistDexieCardPut(card);
}

async function createStoryCard(args: {
  readonly listId: string;
  readonly boardId: string;
  readonly title: string;
  readonly caption: string;
  readonly position: number;
}): Promise<CardDB> {
  const description = captionToDescriptionJson(args.caption);
  const payload: {
    listId: string;
    boardId: string;
    title: string;
    position: number;
    description?: string;
  } = {
    listId: args.listId,
    boardId: args.boardId,
    title: args.title,
    position: args.position,
  };
  if (description !== '') {
    payload.description = description;
  }
  const { card } = await api.createCard(payload);
  const cardDb = transformCard(card);
  commitCard(cardDb);
  return cardDb;
}

export async function addStorytellingHero(args: {
  readonly boardId: string;
  readonly sections: readonly StorytellingSection[];
  readonly draft: VisualStorytellingAddHeroDraft;
  readonly uploadImageToCard?: UploadImageToCardFn;
}): Promise<void> {
  const empty = args.sections.find((section) => section.hero == null);
  let listId: string;
  if (empty != null) {
    listId = empty.list.id;
    if (empty.list.name.trim() !== args.draft.title) {
      const response = await api.updateList(empty.list.id, { name: args.draft.title });
      commitList(transformList(response.list));
    }
  } else {
    const response = await api.createList({
      boardId: args.boardId,
      name: args.draft.title,
      position: args.sections.length,
    });
    const list = transformList(response.list);
    commitList(list);
    listId = list.id;
  }
  const card = await createStoryCard({
    listId,
    boardId: args.boardId,
    title: args.draft.title,
    caption: args.draft.caption,
    position: 0,
  });
  const file = args.draft.files[0];
  if (file != null && args.uploadImageToCard != null) {
    await args.uploadImageToCard(card.id, file);
  }
}

export async function addStorytellingContent(args: {
  readonly boardId: string;
  readonly listId: string;
  readonly nextPosition: number;
  readonly file: File;
  readonly uploadImageToCard: UploadImageToCardFn;
}): Promise<void> {
  const card = await createStoryCard({
    listId: args.listId,
    boardId: args.boardId,
    title: titleFromFileName(args.file.name),
    caption: '',
    position: args.nextPosition,
  });
  await args.uploadImageToCard(card.id, args.file);
}

export function showStorytellingError(error: unknown, fallback: string): void {
  notifications.show({
    color: 'red',
    title: fallback,
    message: error instanceof Error ? error.message : fallback,
  });
}
