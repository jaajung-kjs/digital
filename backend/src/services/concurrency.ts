import { AppError } from '../utils/errors.js';

export interface ConflictItem { collection: string; id: string; name?: string }

/** 충돌 시 409. conflicts 는 AppError.details 로 → errorHandler 가 그대로 반환. */
export class VersionConflictError extends AppError {
  constructor(public conflicts: ConflictItem[]) {
    super(409, 'CONFLICT', '다른 사용자가 먼저 변경했습니다.', conflicts);
  }
}

/** current: id→현재 updatedAt. items: 커밋 대상의 base. 불일치/부재 → 충돌. base null 은 skip. */
export function collectConflicts(
  collection: string,
  current: Map<string, Date>,
  items: { id: string; baseVersion: string | null; name?: string }[],
): ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  for (const it of items) {
    if (it.baseVersion == null) continue;
    const cur = current.get(it.id);
    if (!cur) { conflicts.push({ collection, id: it.id, name: it.name }); continue; }
    if (cur.toISOString() !== it.baseVersion) conflicts.push({ collection, id: it.id, name: it.name });
  }
  return conflicts;
}
