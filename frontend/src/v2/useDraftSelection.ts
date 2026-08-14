import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isDirty } from './draftDiff';
import { NEW_ID } from './catalogDraft';

/**
 * **고른 것 하나와 그것을 고치는 초안** — 대장 세 탭이 같은 셸을 쓰게 하는 한 곳.
 *
 * 세 탭이 같은 다섯 가지를 각자 들고 있었다: 고른 id · 초안 · 원본 찾기 · 고친 것이
 * 있는가 · 떠나기 전에 묻기. 같은 것을 세 벌 적으면 셋이 조금씩 어긋나고, 실제로 그랬다 —
 * 어떤 탭은 목록이 갱신될 때 **렌더 도중 상태를 고쳤고**(React 가 경고하는 자리다),
 * 어떤 탭은 취소가 원본이 아니라 빈 초안으로 되돌아갔다.
 *
 * **고른 것이 사라졌을 때 상태를 고치지 않는다.** 다른 것이 지워졌거나 목록이 갈렸으면
 * 첫 번째로 물러서는데, 그것을 `setState` 로 바로잡으려 하면 렌더 도중에 상태를 바꾸게
 * 된다. 파생값으로 두면 바로잡을 것이 없다.
 */
export function useDraftSelection<TEntity extends { id: string }, TDraft>({
  entities,
  toDraft,
  confirmLeave,
  autoSelectFirst = true,
}: {
  entities: TEntity[];
  toDraft: (entity: TEntity) => TDraft;
  /** 고친 것이 있는 채로 다른 것을 고르려 할 때 묻는다. `false` 를 돌려주면 옮기지 않는다. */
  confirmLeave: () => Promise<boolean>;
  /** 아무것도 안 고른 상태에서 첫 항목을 열어 둘 것인가. */
  autoSelectFirst?: boolean;
}) {
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TDraft | null>(null);

  const isNew = requestedId === NEW_ID;
  /* 고른 것이 목록에 없으면(지워졌거나 갈렸거나) 첫 번째로 물러선다 — 파생값이므로
     바로잡는 `setState` 가 필요 없다. */
  const selectedId = isNew
    ? NEW_ID
    : entities.some((e) => e.id === requestedId)
      ? requestedId
      : autoSelectFirst
        ? (entities[0]?.id ?? null)
        : null;

  const original = useMemo(
    () => (isNew ? null : (entities.find((e) => e.id === selectedId) ?? null)),
    [entities, selectedId, isNew],
  );
  const saved = useMemo(() => (original ? toDraft(original) : null), [original, toDraft]);

  /* 고르는 대상이 바뀌면 초안을 새로 뜬다 — 남은 편집이 다른 것에 새어들지 않게.
     **`saved` 가 아니라 `selectedId` 에 건다**: 저장 뒤 목록이 다시 오면 `saved` 는 새 객체가
     되는데, 그때마다 초안을 덮으면 방금 고친 것이 날아간다. */
  useEffect(() => {
    if (isNew) return;
    setDraft(original ? toDraft(original) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const dirty = isDirty(draft, isNew ? null : saved);
  /* 고르는 함수가 `dirty` 보다 위에 설 수 있으므로 최신 값을 ref 로 읽는다. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const select = useCallback(
    async (id: string) => {
      if (id === requestedId) return;
      if (dirtyRef.current && !(await confirmLeave())) return;
      setRequestedId(id);
    },
    [confirmLeave, requestedId],
  );

  /** 새로 만들기 시작 — 만드는 중인 것도 목록의 한 줄이다(`NEW_ID`). */
  const startNew = useCallback(
    async (blank: TDraft) => {
      if (dirtyRef.current && !(await confirmLeave())) return;
      setRequestedId(NEW_ID);
      setDraft(blank);
    },
    [confirmLeave],
  );

  /** 물리기 — 만들던 중이면 그 줄이 사라지고, 아니면 원본으로 되돌아간다. */
  const cancel = useCallback(() => {
    if (isNew) {
      setRequestedId(null);
      setDraft(null);
    } else {
      setDraft(saved);
    }
  }, [isNew, saved]);

  return { selectedId, isNew, original, saved, draft, setDraft, dirty, select, startNew, cancel, setRequestedId };
}
