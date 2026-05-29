/** Evict oldest Map entries when size exceeds `maxSize` (FIFO). */
export function capMapSize<K, V>(map: Map<K, V>, maxSize: number): void {
  if (maxSize <= 0) {
    map.clear();
    return;
  }
  while (map.size > maxSize) {
    const first = map.keys().next().value;
    if (first === undefined) {
      break;
    }
    map.delete(first);
  }
}
