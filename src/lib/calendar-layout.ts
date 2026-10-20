/**
 * Column layout for overlapping calendar blocks (same approach as Google Calendar).
 *
 * Blocks whose time ranges touch each other, directly or through a chain, form a
 * cluster. Inside a cluster every block takes the first free column; all blocks of
 * the cluster share the same column count so they render side by side at equal width.
 * A block with no overlap keeps the full width (column 0 of 1).
 */

export interface LayoutBlock {
  id: string;
  /** Start, in minutes (any origin, e.g. minutes since midnight). */
  start: number;
  /** End, in minutes. Must be greater than start; otherwise treated as start + 1. */
  end: number;
}

export interface LayoutSlot {
  /** 0-based column index inside the cluster. */
  column: number;
  /** Total number of columns in the cluster. */
  columns: number;
}

export function layoutDayBlocks(blocks: LayoutBlock[]): Map<string, LayoutSlot> {
  const normalized = blocks.map((b) => ({ id: b.id, start: b.start, end: Math.max(b.end, b.start + 1) }));
  // Earliest first; for equal starts the longest first so it takes the first column.
  normalized.sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  const result = new Map<string, LayoutSlot>();
  let clusterIds: string[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columns = columnEnds.length;
    clusterIds.forEach((id) => {
      const slot = result.get(id);
      if (slot) slot.columns = columns;
    });
    clusterIds = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const block of normalized) {
    if (block.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= block.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(block.end);
    } else {
      columnEnds[column] = block.end;
    }
    result.set(block.id, { column, columns: 1 });
    clusterIds.push(block.id);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();

  return result;
}
