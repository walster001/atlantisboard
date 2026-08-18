export type MasonryPackItem = {
  readonly id: string;
  readonly height: number;
};

/**
 * Walk items in list order; append each to the current shortest column.
 * Ties go left, so the first `columnCount` cards land LTR.
 */
export function packMasonryColumns(
  items: readonly MasonryPackItem[],
  columnCount: number,
): readonly (readonly string[])[] {
  const count = Math.max(1, Math.floor(columnCount));
  const columns: string[][] = Array.from({ length: count }, () => []);
  const heights: number[] = Array.from({ length: count }, () => 0);
  for (const item of items) {
    let shortest = 0;
    for (let i = 1; i < count; i += 1) {
      if (heights[i] < heights[shortest]) {
        shortest = i;
      }
    }
    columns[shortest].push(item.id);
    heights[shortest] += item.height;
  }
  return columns;
}
