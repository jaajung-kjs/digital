import { useMemo, useState } from 'react';
import { useCableGroups } from '../hooks/useCableGroups';
import { useCableCategories } from '../hooks/useCableCategories';

interface Props {
  /** 선택된 케이블 종류(categoryId). */
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

/**
 * 케이블 종류 선택 — 그룹(사용자 정의 이름+색) → 이름 2단.
 * 그룹은 useCableGroups, 이름은 useCableCategories(c.groupId 로 필터). 모든 케이블 종류 선택 진입점 공용.
 */
export function CableTypePicker({ value, onChange }: Props) {
  const { data: groups = [] } = useCableGroups();
  const { data: categories = [] } = useCableCategories();

  // value(categoryId) → 현재 그룹 파생.
  const currentCat = useMemo(() => categories.find((c) => c.id === value) ?? null, [categories, value]);
  const [groupId, setGroupId] = useState<string | null>(currentCat?.groupId ?? null);

  // value 가 바뀌면(외부) 그룹도 동기화.
  const effectiveGroupId = currentCat?.groupId ?? groupId;

  const names = useMemo(
    () => categories.filter((c) => c.isActive !== false && c.groupId === effectiveGroupId),
    [categories, effectiveGroupId],
  );
  const groupColor = groups.find((g) => g.id === effectiveGroupId)?.color ?? null;

  return (
    <div className="flex items-center gap-1.5">
      {groupColor && (
        <span aria-hidden className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5" style={{ backgroundColor: groupColor }} />
      )}
      <select
        aria-label="그룹"
        className="text-sm bg-surface border border-line rounded px-1.5 py-0.5 text-content"
        value={effectiveGroupId ?? ''}
        onChange={(e) => { setGroupId(e.target.value || null); onChange(null); }}
      >
        <option value="">그룹</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <select
        aria-label="이름"
        className="text-sm bg-surface border border-line rounded px-1.5 py-0.5 text-content"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={!effectiveGroupId}
      >
        <option value="">이름</option>
        {names.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
