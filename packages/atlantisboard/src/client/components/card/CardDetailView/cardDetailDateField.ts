import { useCallback, useMemo, useState } from 'react';
import { toDatetimeLocalValue } from './helpers.js';

export interface DateFieldController {
  readonly value: string;
  readonly opened: boolean;
  readonly setValue: (value: string) => void;
  readonly setOpened: (next: boolean) => void;
}

export function useDateField(isoDate: Date | string | null | undefined): DateFieldController {
  const [opened, setOpened] = useState(false);
  const timeKey = isoDate != null ? new Date(isoDate).getTime() : 0;
  const localFromCard = useMemo(
    () => (isoDate != null ? toDatetimeLocalValue(new Date(isoDate)) : ''),
    [isoDate],
  );
  const [override, setOverride] = useState<string | null>(null);
  const [prevTimeKey, setPrevTimeKey] = useState(timeKey);
  if (timeKey !== prevTimeKey) {
    setPrevTimeKey(timeKey);
    setOverride(null);
  }
  const value = override ?? localFromCard;

  const setOpenedWithReset = useCallback((next: boolean) => {
    setOpened(next);
    if (!next) {
      setOverride(null);
    }
  }, []);

  return {
    value,
    opened,
    setValue: setOverride,
    setOpened: setOpenedWithReset,
  };
}
