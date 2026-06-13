import { Board } from '../../models/Board.js';
import type { AdminReportingBoardOptionsResponse } from '../../../shared/types/adminReporting.js';

function normalizeBoardName(name: unknown): string {
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Untitled board';
}

export async function listAdminReportingBoardOptions(): Promise<AdminReportingBoardOptionsResponse> {
  const boards = await Board.find({})
    .select('name')
    .sort({ name: 1, createdAt: 1 })
    .lean();

  return {
    boards: boards.map((board) => ({
      id: board._id.toString(),
      name: normalizeBoardName(board.name),
    })),
  };
}
