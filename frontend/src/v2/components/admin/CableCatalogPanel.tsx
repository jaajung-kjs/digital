/**
 * CableCatalogPanel — 대장의 「케이블 종류」 탭
 *
 * 다른 두 탭과 **같은 문장**이다: 왼쪽에서 하나를 고르고, 오른쪽에서 고치고, 저장한다.
 *
 * 왼쪽은 그룹(전원·네트워크·광·제어·접지)이다. 이 다섯은 `PORT_KINDS` 가 정하는 **고정
 * 어휘**라 늘지도 줄지도 않고 이름·색도 코드가 주인이다 — 그래서 그룹을 고치는 UI 가 없다.
 * 늘고 주는 것은 그룹 안의 **종류**이고, 오른쪽 표가 그것이다.
 *
 * 초안이 담는 것은 「그룹 하나와 그 자식들」이다 — 자산 종류의 초안이 포트를 자식으로 안고
 * 한 번의 PUT 으로 나가는 것과 같은 모양이라, 저장 규칙이 세 탭에서 같아진다. 예전에는 이
 * 탭만 거꾸로였다: 머리줄인 그룹의 이름·색이 저장 바를 거치고, 정작 여러 칸짜리 종류는
 * 칸을 떠날 때마다 바로 날아갔다.
 */
import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  EmptyState,
  Input,
  IconButton,
  TableCard,
  Th,
  cn,
  useConfirm,
  SELECTABLE,
} from '../../../components/ui';
import type { V2Catalog, V2CableCategory } from '../../types';
import { useReportUnsaved } from '../../unsavedGuard';
import { useCatalogMutations } from '../../hooks';
import { apiErrorMessage } from '../../apiError';
import { CatalogList } from './CatalogList';
import { CatalogEditorBar } from './CatalogEditorBar';

interface CableCatalogPanelProps {
  catalog: V2Catalog;
}

/**
 * 표의 한 줄.
 *
 * 공량이 문자열인 이유: 고치는 도중에는 `0.` 이나 빈칸 같은 「아직 수가 아닌」 상태를 지나간다.
 * 숫자로 들고 있으면 그 순간이 `NaN` 이 되어 값이 튄다.
 */
interface CategoryDraft {
  /** 이미 있는 것이면 그 id, 새로 만드는 줄이면 null. */
  id: string | null;
  /** 화면에서 이 줄을 가리키는 이름 — 새 줄은 아직 id 가 없다. */
  key: string;
  name: string;
  laborType: string;
  install: string;
  remove: string;
}

/** 이름 · 노무유형 · 신설 · 철거 · 삭제. 합이 100 이어야 한다(`TableCard`). */
const COL_WIDTHS = [40, 24, 14, 14, 8] as const;

let seq = 0;
const newKey = () => `new-${++seq}`;

const toDraft = (cats: V2CableCategory[]): CategoryDraft[] =>
  cats.map((c) => ({
    id: c.id,
    key: c.id,
    name: c.name,
    laborType: c.laborType ?? '',
    install: String(c.installHoursPerM),
    remove: String(c.removeHoursPerM),
  }));

const same = (a: CategoryDraft[], b: CategoryDraft[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i]!;
    return (
      x.id === y.id &&
      x.name === y.name &&
      x.laborType === y.laborType &&
      x.install === y.install &&
      x.remove === y.remove
    );
  });

/** 미터당 시간 — 빈칸·글자·음수는 저장을 막는다. */
const isHours = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0;

interface RowIssues {
  name: boolean;
  install: boolean;
  remove: boolean;
}

/**
 * 저장을 막는 칸들 — **어느 칸인지**까지 짚는다.
 *
 * 저장 바는 「입력 오류 N건」만 말할 수 있다. 한 화면에 열 줄 넘게 서는 표에서 그것만으로는
 * 어디를 고쳐야 할지 알 수 없으므로, 칸마다 테두리로 표시한다.
 */
function issuesOf(rows: CategoryDraft[]): { flags: Map<string, RowIssues>; count: number } {
  const times = new Map<string, number>();
  for (const r of rows) times.set(r.name.trim(), (times.get(r.name.trim()) ?? 0) + 1);

  const flags = new Map<string, RowIssues>();
  let count = 0;
  for (const r of rows) {
    const n = r.name.trim();
    /* 같은 그룹 안에서 이름은 겹칠 수 없다(DB 제약) — 저장하고 나서 알면 늦다. */
    const f: RowIssues = {
      name: n === '' || (times.get(n) ?? 0) > 1,
      install: !isHours(r.install),
      remove: !isHours(r.remove),
    };
    count += Number(f.name) + Number(f.install) + Number(f.remove);
    flags.set(r.key, f);
  }
  return { flags, count };
}

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  const mutations = useCatalogMutations();
  const { confirm, confirmDialog } = useConfirm();
  const groups = catalog.cableGroups;

  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  const [draft, setDraft] = useState<CategoryDraft[] | null>(groups[0] ? toDraft(groups[0].categories) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* 방금 더한 줄에 커서를 둔다 — 새 줄이 서기만 하고 손이 갈 곳을 안 알려 주면 한 번 더 눌러야 한다. */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const original = groups.find((g) => g.id === selectedId) ?? null;

  /* 다른 그룹으로 옮기기 전에 묻는다 — 세 탭이 같은 규칙이어야 한다. */
  const selectGroup = async (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    if (
      dirtyRef.current &&
      !(await confirm({
        title: '저장하지 않은 변경',
        message: '편집 내용이 사라집니다. 이동할까요?',
        confirmLabel: '이동',
        danger: true,
      }))
    )
      return;
    setSelectedId(id);
    setDraft(toDraft(g.categories));
    setSaveError(null);
  };
  if (original == null && groups.length > 0 && selectedId != null) {
    // 목록이 갱신되며 고른 것이 사라진 경우
    setSelectedId(groups[0]!.id);
    setDraft(toDraft(groups[0]!.categories));
  }

  const saved = useMemo(() => (original ? toDraft(original.categories) : []), [original]);
  const dirty = draft != null && original != null && !same(draft, saved);
  /* 탭을 옮기면 이 패널이 통째로 사라진다 — 떠나보내는 쪽(페이지)이 물을 수 있게 알린다. */
  useReportUnsaved(dirty);
  /* `selectGroup` 은 `dirty` 보다 위에 선다 — 최신 값을 ref 로 읽는다(선언 순서 때문이지
     성능 때문이 아니다). */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const { flags, count: issueCount } = useMemo(() => issuesOf(draft ?? []), [draft]);

  function patchRow(key: string, patch: Partial<CategoryDraft>) {
    setDraft((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? prev);
  }

  function addRow() {
    const key = newKey();
    setFocusKey(key);
    setSaveError(null);
    setDraft((prev) => [...(prev ?? []), { id: null, key, name: '', laborType: '', install: '0', remove: '0' }]);
  }

  /* 지우는 것도 초안에 쌓인다 — 취소로 되돌아오므로 따로 묻지 않는다. 쓰이는 중인 종류라면
     저장할 때 서버가 무엇이 몇 개 걸려 있는지 이름으로 알려 준다. */
  function removeRow(key: string) {
    setSaveError(null);
    setDraft((prev) => prev?.filter((r) => r.key !== key) ?? prev);
  }

  async function handleSave() {
    if (!original || !draft || saving || issueCount > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await mutations.putCableCategories.mutateAsync({
        groupId: original.id,
        categories: draft.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          name: r.name.trim(),
          laborType: r.laborType.trim() || null,
          installHoursPerM: Number(r.install),
          removeHoursPerM: Number(r.remove),
        })),
      });
      /* 새로 만든 줄은 이제 id 를 갖는다 — 서버가 돌려준 것으로 초안을 다시 세우지 않으면
         다음 저장에서 같은 줄을 또 만든다. */
      setDraft(toDraft(updated.categories));
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, '저장하지 못했습니다'));
    } finally {
      setSaving(false);
    }
  }

  const listGroups = [
    {
      key: 'all',
      label: null,
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        dot: g.color,
        hint: String(g.categories.length),
        hintTitle: `케이블 종류 ${g.categories.length}개`,
      })),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1">
      <CatalogList
        title="케이블 그룹"
        groups={listGroups}
        selectedId={selectedId}
        onSelect={(id) => void selectGroup(id)}
        emptyText="케이블 그룹이 없습니다"
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {original == null || draft == null ? (
          <EmptyState
            title="선택된 케이블 그룹이 없습니다"
            description="좌측 목록에서 그룹을 고르세요. 그룹은 고정 어휘이고, 그 안의 종류가 실제로 케이블에 붙어 설계서 공량의 근거가 됩니다."
          />
        ) : (
          <>
            <CatalogEditorBar
              title={original.name}
              dirty={dirty}
              saving={saving}
              issueCount={issueCount}
              error={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setDraft(saved)}
              onSave={() => void handleSave()}
            />

            {/* 현황·선번장과 **같은 표**다(`TableCard`) — 값을 고치는 칸이라고 해서 표가
                다르게 생길 이유가 없다. `fill` 이라 종류가 몇 개든 카드 크기가 같고, 넘치면
                카드 안에서만 스크롤한다(CONVENTIONS §1.6).

                종류마다 **품셈을 적는다** — 자산 종류·설비 종류와 같은 층이다. 같은 광이라도
                OPGW 가공(외선)과 실내 점퍼 결선은 품이 다르므로, 그룹 하나로 뭉쳐 두면 그
                차이가 설계서에서 사라진다. */}
            <div className="min-h-0 flex-1 p-4">
              <TableCard widths={COL_WIDTHS} fill className="max-w-5xl">
                <thead>
                  {/* 머리글은 스크롤해도 남는다 — 현황표와 같은 규칙. */}
                  <tr className="sticky top-0 z-sticky">
                    <Th>이름</Th>
                    <Th>노무유형</Th>
                    <Th>신설(h/m)</Th>
                    <Th>철거(h/m)</Th>
                    <Th>
                      <span className="sr-only">삭제</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {draft.map((row) => {
                    const bad = flags.get(row.key);
                    const who = row.name.trim() || '새 종류';
                    return (
                      <tr key={row.key} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`${who} 이름`}
                            size="cell"
                            autoFocus={row.key === focusKey}
                            invalid={bad?.name}
                            value={row.name}
                            placeholder="예: 광점퍼코드"
                            onChange={(e) => patchRow(row.key, { name: e.currentTarget.value })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`${who} 노무유형`}
                            size="cell"
                            value={row.laborType}
                            placeholder="예: 통신내선공"
                            onChange={(e) => patchRow(row.key, { laborType: e.currentTarget.value })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`${who} 신설 공량`}
                            size="cell"
                            type="number"
                            invalid={bad?.install}
                            value={row.install}
                            onChange={(e) => patchRow(row.key, { install: e.currentTarget.value })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            aria-label={`${who} 철거 공량`}
                            size="cell"
                            type="number"
                            invalid={bad?.remove}
                            value={row.remove}
                            onChange={(e) => patchRow(row.key, { remove: e.currentTarget.value })}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <IconButton aria-label={`${who} 삭제`} size="sm" onClick={() => removeRow(row.key)}>
                            <Trash2 size={12} />
                          </IconButton>
                        </td>
                      </tr>
                    );
                  })}
                  {/* 「추가」는 표의 **맨 아래 줄**이다 — 왼쪽 목록의 「분류 추가」와 같은 자리,
                      같은 뜻(CatalogList). 머리 위에 뜬 버튼 하나보다 어디에 생길지가 분명하다. */}
                  <tr>
                    <td colSpan={COL_WIDTHS.length} className="p-0">
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-1 px-3 py-2 text-left text-xs text-content-faint',
                          SELECTABLE,
                        )}
                        onClick={addRow}
                      >
                        <Plus size={12} />
                        종류 추가
                      </button>
                    </td>
                  </tr>
                </tbody>
              </TableCard>
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
