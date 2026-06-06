import { createContext, useContext } from 'react';

export interface EmojiPickerScrollShardContextValue {
  readonly setScrollShards: (shards: readonly HTMLElement[]) => void;
}

export const EmojiPickerScrollShardContext =
  createContext<EmojiPickerScrollShardContextValue | null>(null);

export function useEmojiPickerScrollShard(): EmojiPickerScrollShardContextValue | null {
  return useContext(EmojiPickerScrollShardContext);
}
