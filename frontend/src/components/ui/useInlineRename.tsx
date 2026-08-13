import { useState, type ReactNode } from 'react';
import { Input } from './Input';

/**
 * 제자리 이름 바꾸기 — **목록 항목의 이름을 그 자리에서 고친다**.
 *
 * 왜 공용인가: 같은 것이 세 곳에 있었다(자산 종류 탭의 분류, 설비 종류 탭의 분류, 케이블
 * 종류 탭의 종류). 상태 두 개·커밋 함수·`Enter`/`Escape`/`onBlur` 처리까지 한 글자도 다르지
 * 않게 복제돼 있었고, 그러면 한 곳만 고쳐지는 것이 시간 문제다. (케이블 탭은 그 뒤 표 전체가
 * 초안이 되어 이 훅을 쓰지 않는다 — 이름도 다른 칸들과 함께 저장 바를 거친다.)
 *
 * 모달을 띄우지 않는 이유: 이름을 고치는 중에 **어느 항목을 고치는 중인지** 화면에서
 * 사라지면 안 된다. 그 자리에 상자가 서는 편이 맞다.
 *
 * 커밋 규칙(세 화면이 같아야 하는 것):
 * - 비었거나 그대로면 아무 일도 하지 않는다 — 실수로 지우는 길을 만들지 않는다.
 * - `Enter`·포커스 잃음 = 커밋, `Escape` = 물림.
 */
export function useInlineRename(onCommit: (id: string, name: string) => void) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commit = (id: string, before: string) => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== before) onCommit(id, trimmed);
    setEditingId(null);
  };

  return {
    /** 이 항목을 고치는 중인가 — 상자를 세울지 이름을 그릴지 부르는 쪽이 정한다. */
    isEditing: (id: string) => editingId === id,
    /** 고치기 시작 — 이름 바꾸기 버튼에 건다. */
    start: (id: string, name: string) => {
      setEditingId(id);
      setDraft(name);
    },
    /** 그 자리에 서는 입력 상자. `label` 은 읽어 주기용(어느 목록의 이름인지). */
    field: (id: string, before: string, label: string): ReactNode => (
      <Input
        aria-label={label}
        size="sm"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => commit(id, before)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(id, before);
          if (e.key === 'Escape') setEditingId(null);
        }}
      />
    ),
  };
}
