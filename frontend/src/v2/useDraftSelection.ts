import { useCallback, useMemo, useRef, useState } from 'react';
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
  /**
   * **아직 아무것도 안 골랐다**(`undefined`)와 **놓았다**(`null`)는 다르다.
   *
   * 처음 들어오면 첫 항목을 열어 둔다. 그런데 그 규칙을 「고른 것이 없으면 첫 번째」로
   * 적어 두었더니 **놓을 수가 없었다** — 놓는 순간 첫 항목으로 되돌아갔다. 빈 곳을 눌러도
   * Esc 를 눌러도 선택이 그대로였던 까닭이 이것이다.
   */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const setRequestedId = setChosen;
  /**
   * **고친 것만** 들고 있는다 — 고치지 않았으면 원본이 곧 초안이다.
   *
   * 예전에는 초안 전체가 상태였고, 고른 것이 바뀌면 effect 가 그것을 다시 떴다. 그래서 판을
   * 열 때마다 **첫 프레임은 초안이 `null`** 이라 오른쪽이 빈 채로 그려졌다가 다음 프레임에
   * 채워졌다 — 재어 보니 20ms, 눈에는 화면이 깜빡이는 것으로 남았다.
   *
   * 어느 것을 고쳤는지(`id`)까지 함께 들면 **고른 것이 바뀌는 순간 편집이 저절로 버려진다** —
   * 비우는 effect 도, 저장 뒤 다시 뜨는 effect 도 필요 없다.
   */
  const [edit, setEdit] = useState<{ id: string | null; draft: TDraft | null } | null>(null);

  const isNew = chosen === NEW_ID;
  const first = autoSelectFirst ? (entities[0]?.id ?? null) : null;
  /* 고른 것이 목록에 없으면(지워졌거나 갈렸거나) 첫 번째로 물러선다 — 파생값이므로
     바로잡는 `setState` 가 필요 없다. **놓은 것(`null`)은 그대로 둔다.** */
  const selectedId = isNew
    ? NEW_ID
    : chosen === undefined
      ? first
      : chosen === null
        ? null
        : entities.some((e) => e.id === chosen)
          ? chosen
          : first;

  const original = useMemo(
    () => (isNew ? null : (entities.find((e) => e.id === selectedId) ?? null)),
    [entities, selectedId, isNew],
  );
  const saved = useMemo(() => (original ? toDraft(original) : null), [original, toDraft]);

  /* 고친 것이 있으면 그것, 없으면 원본 — **고른 것이 달라지면 남은 편집은 제 것이 아니다**. */
  const draft = edit && edit.id === selectedId ? edit.draft : saved;
  const setDraft = useCallback(
    (next: TDraft | null | ((prev: TDraft | null) => TDraft | null)) =>
      setEdit((prev) => {
        const base = prev && prev.id === selectedIdRef.current ? prev.draft : savedRef.current;
        return { id: selectedIdRef.current, draft: typeof next === 'function' ? (next as (p: TDraft | null) => TDraft | null)(base) : next };
      }),
    [],
  );

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const dirty = isDirty(draft, isNew ? null : saved);
  /* 고르는 함수가 `dirty` 보다 위에 설 수 있으므로 최신 값을 ref 로 읽는다. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /**
   * 저장이 끝났다 — **고친 것을 놓는다**. 그러면 초안은 다시 원본을 따라간다.
   *
   * 목록이 새로 오면 원본이 바뀌고 초안도 그대로 따라온다. 예전에는 저장 시점의 초안을
   * 들고 있다가 다음 목록이 올 때 갈아 끼웠는데(effect 하나), 초안이 파생값이면 그 일이
   * 저절로 일어난다 — 「저장했는데 영원히 고친 것이 있다」던 버그도 여기서 사라진다.
   */
  const markSaved = useCallback(() => setEdit(null), []);

  const select = useCallback(
    async (id: string | null) => {
      if (id === selectedId) return;
      if (dirtyRef.current && !(await confirmLeave())) return;
      setRequestedId(id);
    },
    [confirmLeave, selectedId],
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

  return { selectedId, isNew, original, saved, draft, setDraft, dirty, select, startNew, cancel, setRequestedId, markSaved };
}
