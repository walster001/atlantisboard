/** Reorder array by moving one item from `from` to `to` (indices in the pre-move array). */
export function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= array.length || to >= array.length) {
    return [...array];
  }
  const next = [...array];
  const [removed] = next.splice(from, 1);
  if (removed === undefined) {
    return [...array];
  }
  next.splice(to, 0, removed);
  return next;
}
