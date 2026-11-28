import { Position, User } from '../types';

export function sortPositionsByRank(positions: Position[]): Position[] {
  return [...positions].sort((a, b) => {
    const rankDiff = (b.priorityLevel ?? 0) - (a.priorityLevel ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const titleDiff = a.title.localeCompare(b.title);
    if (titleDiff !== 0) return titleDiff;
    return a.level.localeCompare(b.level);
  });
}

export function compareUsersByRankAndJoinDate(
  a: User,
  b: User,
  posMap: Map<string, Position>
): number {
  const posA = a.positionId ? posMap.get(a.positionId) : undefined;
  const posB = b.positionId ? posMap.get(b.positionId) : undefined;

  const rankA = posA ? posA.priorityLevel : Number.NEGATIVE_INFINITY;
  const rankB = posB ? posB.priorityLevel : Number.NEGATIVE_INFINITY;
  if (rankB !== rankA) return rankB - rankA;

  const dateA = a.startDate?.trim() || '';
  const dateB = b.startDate?.trim() || '';
  if (dateA && dateB) {
    const dateDiff = dateA.localeCompare(dateB);
    if (dateDiff !== 0) return dateDiff;
  } else if (dateA !== dateB) {
    return dateA ? -1 : 1;
  }

  return a.fullName.localeCompare(b.fullName);
}

export function sortUsersByRankAndJoinDate(users: User[], positions: Position[]): User[] {
  const posMap = new Map<string, Position>(positions.map((p) => [p.id, p]));
  return [...users].sort((a, b) => compareUsersByRankAndJoinDate(a, b, posMap));
}
