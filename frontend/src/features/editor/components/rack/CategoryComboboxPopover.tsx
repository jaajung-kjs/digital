import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useCreateRackModuleCategory,
  useDeleteRackModuleCategory,
  useRackModuleCategories,
  useUpdateRackModuleCategory,
} from '../../../rack/hooks/useRackModuleCategories';
import { IconButton, Input } from '../../../../components/ui';
import type { RackModuleCategory } from '../../../../types/rackModule';

interface Props {
  anchorRect: DOMRect;
  availableSpan: number;
  onPick: (category: RackModuleCategory) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 224; // tailwind w-56
const GAP = 6;

function apiMessage(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data
      ?.message ?? fallback
  );
}

export function CategoryComboboxPopover({ anchorRect, availableSpan, onPick, onCancel }: Props) {
  const { data: categories } = useRackModuleCategories();
  const createCat = useCreateRackModuleCategory();
  const updateCat = useUpdateRackModuleCategory();
  const deleteCat = useDeleteRackModuleCategory();
  const ref = useRef<HTMLDivElement | null>(null);
  // 팝오버 열기 직전 포커스를 잡아뒀다가 닫힘 시 복원.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // 인라인 편집/추가 상태.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // ESC 글로벌 핸들러가 "편집 중이면 편집만 취소" 하도록 최신 상태를 ref 로 노출.
  const editingRef = useRef(false);
  editingRef.current = editingId !== null || adding || confirmDeleteId !== null;

  function resetInteraction() {
    setEditingId(null);
    setAdding(false);
    setConfirmDeleteId(null);
    setErrorMsg(null);
  }

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // 첫 옵션으로 자동 포커스 — 키보드 사용자 친화.
    const firstButton = ref.current?.querySelector('button');
    firstButton?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  // 바깥 클릭 / ESC 로 닫기.
  // - mousedown은 한 틱 늦게 등록해서 슬롯 클릭이 즉시 popover를 닫는 일을 막는다.
  // - keydown은 capture 단계로 등록 + stopImmediatePropagation 으로
  //   상위 EquipmentDetailPanel 의 ESC 핸들러가 panel 까지 닫는 일을 막는다.
  // - 인라인 편집 중이면 ESC 는 편집만 취소하고 popover 는 유지한다.
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (editingRef.current) {
          resetInteraction();
        } else {
          onCancel();
        }
      }
    };
    const armTimer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleDown);
    }, 0);
    document.addEventListener('keydown', handleKey, { capture: true });
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey, { capture: true });
    };
  }, [onCancel]);

  const active = (categories ?? []).filter((c) => c.isActive);

  function startEdit(c: RackModuleCategory) {
    setConfirmDeleteId(null);
    setErrorMsg(null);
    setEditingId(c.id);
    setDraftName(c.name);
  }

  function submitEdit() {
    const name = draftName.trim();
    if (!editingId || !name) return;
    updateCat.mutate(
      { id: editingId, name },
      {
        onSuccess: () => setEditingId(null),
        onError: (e) => setErrorMsg(apiMessage(e, '이름을 변경하지 못했습니다.')),
      },
    );
  }

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    createCat.mutate(name, {
      onSuccess: () => {
        setAdding(false);
        setNewName('');
      },
      onError: (e) => setErrorMsg(apiMessage(e, '추가하지 못했습니다.')),
    });
  }

  function submitDelete(id: string) {
    deleteCat.mutate(id, {
      onSuccess: () => setConfirmDeleteId(null),
      onError: (e) => setErrorMsg(apiMessage(e, '삭제하지 못했습니다.')),
    });
  }

  const busy = createCat.isPending || updateCat.isPending || deleteCat.isPending;

  // 슬롯이 화면 오른쪽 패널 안에 있으므로 기본은 왼쪽으로 띄움.
  // 좌측 공간이 모자라면 슬롯 오른쪽으로, 양쪽 다 안 되면 슬롯 위 (left=slot.left).
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  let left: number;
  let placement: 'left' | 'right' | 'top';
  if (anchorRect.left - POPOVER_WIDTH - GAP >= 8) {
    left = anchorRect.left - POPOVER_WIDTH - GAP;
    placement = 'left';
  } else if (anchorRect.right + GAP + POPOVER_WIDTH <= vw - 8) {
    left = anchorRect.right + GAP;
    placement = 'right';
  } else {
    left = Math.max(8, anchorRect.left);
    placement = 'top';
  }

  // 세로 위치 + 꼬리 위치는 measured height 기반. 첫 paint 전엔 visibility hidden
  // 으로 가려 측정 전 위치 노출 방지.
  const [layout, setLayout] = useState<{ top: number; tailY: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    // 기본: slot top 정렬. viewport bottom 을 넘치면 slot bottom 에 popover
    // bottom 을 맞춤 — popover 가 slot 위쪽으로 뻗어 올라감.
    let nextTop = anchorRect.top;
    if (nextTop + h > vh - 8) nextTop = Math.max(8, anchorRect.bottom - h);
    // 꼬리는 항상 slot 의 세로 중심을 가리킴. popover rounded corner 밖으로
    // 나가지 않게 outer 꼬리 size (12px) 만큼 안쪽으로 clamp.
    const slotCenter = (anchorRect.top + anchorRect.bottom) / 2;
    const tailY = Math.max(14, Math.min(h - 14, slotCenter - nextTop));
    setLayout({ top: nextTop, tailY });
  }, [anchorRect.top, anchorRect.bottom, active.length, adding, editingId, confirmDeleteId, errorMsg]);

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-modal bg-surface border border-line rounded-md shadow-lg py-1 w-56"
      style={{
        left,
        top: layout?.top ?? -9999,
        visibility: layout === null ? 'hidden' : 'visible',
      }}
    >
      {/* Speech-bubble tail — CSS triangle 두 겹. 바깥 (테두리 색) 위에 안쪽
          (흰색) 을 1px 덧대어 popover 의 border 가 꼬리 base 자리에서 자연스럽게
          끊기게. placement === 'top' (양옆 다 부족) 인 드문 케이스는 꼬리 생략. */}
      {layout && placement !== 'top' && (
        <>
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: layout.tailY,
              marginTop: -12,
              width: 0,
              height: 0,
              borderTop: '12px solid transparent',
              borderBottom: '12px solid transparent',
              ...(placement === 'left'
                ? { left: '100%', borderLeft: '12px solid rgb(229, 231, 235)' }
                : { right: '100%', borderRight: '12px solid rgb(229, 231, 235)' }),
            }}
          />
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: layout.tailY,
              marginTop: -11,
              width: 0,
              height: 0,
              borderTop: '11px solid transparent',
              borderBottom: '11px solid transparent',
              ...(placement === 'left'
                ? { left: '100%', marginLeft: -1, borderLeft: '11px solid white' }
                : { right: '100%', marginRight: -1, borderRight: '11px solid white' }),
            }}
          />
        </>
      )}
      <div className="px-3 py-1 text-xs text-content-muted border-b">
        카테고리 선택 — {availableSpan}슬롯 가능
      </div>
      {errorMsg && <div className="px-3 py-1 text-xs text-danger">{errorMsg}</div>}
      {active.length === 0 ? (
        <div className="px-3 py-2 text-xs text-content-faint">카테고리가 없습니다.</div>
      ) : (
        <ul className="max-h-[70vh] overflow-y-auto">
          {active.map((c) => (
            <li key={c.id}>
              {editingId === c.id ? (
                // 이름 편집 행.
                <div className="flex items-center gap-1 px-2 py-1">
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit();
                    }}
                  />
                  <IconButton aria-label="저장" onClick={submitEdit} disabled={busy}>
                    <Check className="w-4 h-4 text-success" />
                  </IconButton>
                  <IconButton aria-label="취소" onClick={() => setEditingId(null)} disabled={busy}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </div>
              ) : confirmDeleteId === c.id ? (
                // 삭제 확인 행.
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="truncate flex-1">{c.name} 삭제?</span>
                  <button
                    type="button"
                    onClick={() => submitDelete(c.id)}
                    disabled={busy}
                    className="text-xs text-danger hover:underline disabled:opacity-40"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={busy}
                    className="text-xs text-content-muted hover:underline disabled:opacity-40"
                  >
                    취소
                  </button>
                </div>
              ) : (
                // 기본 선택 행 — hover 시 우측에 편집/삭제 액션.
                <div className="group flex items-center hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm text-left"
                  >
                    {/* 실제 모듈과 동일한 다크 페이스플레이트 미니 칩 (ISA-101 무채색 —
                        카테고리 displayColor 는 신뢰 안 함, 모듈 렌더와 일치). */}
                    <span
                      aria-hidden
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-black/40"
                      style={{
                        background: 'var(--eq-1)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                      }}
                    />
                    <span className="truncate flex-1">{c.name}</span>
                  </button>
                  <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <IconButton
                      aria-label={`${c.name} 이름 변경`}
                      className="p-1"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      aria-label={`${c.name} 삭제`}
                      className="p-1"
                      onClick={() => {
                        setEditingId(null);
                        setErrorMsg(null);
                        setConfirmDeleteId(c.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* 새 모듈 종류 추가 — 사용자는 이름만 입력. */}
      <div className="border-t mt-1 pt-1">
        {adding ? (
          <div className="flex items-center gap-1 px-2 py-1">
            <Input
              autoFocus
              value={newName}
              placeholder="새 모듈 이름"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
              }}
            />
            <IconButton aria-label="추가" onClick={submitCreate} disabled={busy}>
              <Check className="w-4 h-4 text-success" />
            </IconButton>
            <IconButton
              aria-label="취소"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
              disabled={busy}
            >
              <X className="w-4 h-4" />
            </IconButton>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              resetInteraction();
              setAdding(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-primary hover:bg-surface-2 text-left"
          >
            <Plus className="w-4 h-4" />
            새 모듈 종류
          </button>
        )}
      </div>
    </div>
  );
}
