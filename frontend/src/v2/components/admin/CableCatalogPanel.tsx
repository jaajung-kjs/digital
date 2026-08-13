/**
 * CableCatalogPanel — 대장의 「케이블 종류」 탭
 *
 * 다른 두 탭과 **같은 문장**이다: 왼쪽에서 하나를 고르고, 오른쪽에서 고치고, 저장한다.
 *
 * 왼쪽은 그룹(전원·네트워크·광·제어·접지)이다. 이 다섯은 `PORT_KINDS` 가 정하는 **고정
 * 어휘**라 늘지도 줄지도 않는다(포트가 무엇과 이어지는지를 그 키로 판정한다). 고치는 것은
 * 이름·색이고, 늘고 주는 것은 그 안의 **종류**다.
 *
 * 초안이 담는 것은 「그룹 하나와 그 자식들」이다 — 자산 종류의 초안이 포트를 자식으로 안고
 * 한 번의 PUT 으로 나가는 것과 같은 모양이라, 저장 규칙이 세 탭에서 같아진다. 예전에는 이
 * 탭만 거꾸로였다: 그룹의 이름·색만 저장 바를 거치고, 정작 여러 칸짜리 종류는 칸을 떠날
 * 때마다 바로 날아갔다.
 *
 * 오른쪽은 `표 │ 상세` 다. 상세는 **한 자리에서 문맥만 바뀐다** — 아무것도 안 골랐으면 그룹
 * 자신, 종류를 골랐으면 그 종류(설비 종류 탭이 「설비 자신 ↔ 부품」으로 바뀌는 것과 같다).
 */
import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DetailCard,
  DetailCardHeader,
  DetailRow,
  EmptyState,
  Input,
  TableCard,
  Th,
  cn,
  useConfirm,
  useDismissOnOutside,
  SELECTABLE,
  SELECTED,
} from '../../../components/ui';
import type { V2Catalog, V2CableGroup } from '../../types';
import { useReportUnsaved } from '../../unsavedGuard';
import { useCatalogMutations, useWageCatalog } from '../../hooks';
import { apiErrorMessage } from '../../apiError';
import { LaborTypeSelect } from './LaborTypeSelect';
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
  laborCode: string;
  install: string;
  remove: string;
}

/** 고치는 중인 그룹 — 제 이름·색과 그 자식들. 저장 한 번에 통째로 나간다. */
interface GroupDraft {
  name: string;
  color: string;
  categories: CategoryDraft[];
}

/** 이름 · 노무유형 · 신설 · 철거. 합이 100 이어야 한다(`TableCard`). */
const COL_WIDTHS = [42, 26, 16, 16] as const;

let seq = 0;
const newKey = () => `new-${++seq}`;

const toDraft = (g: V2CableGroup): GroupDraft => ({
  name: g.name,
  color: g.color,
  categories: g.categories.map((c) => ({
    id: c.id,
    key: c.id,
    name: c.name,
    laborCode: c.laborCode ?? '',
    install: String(c.installHoursPerM),
    remove: String(c.removeHoursPerM),
  })),
});

const same = (a: GroupDraft, b: GroupDraft) =>
  a.name === b.name &&
  a.color === b.color &&
  a.categories.length === b.categories.length &&
  a.categories.every((x, i) => {
    const y = b.categories[i]!;
    return (
      x.id === y.id &&
      x.name === y.name &&
      x.laborCode === y.laborCode &&
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
function issuesOf(g: GroupDraft | null): { flags: Map<string, RowIssues>; groupName: boolean; count: number } {
  const rows = g?.categories ?? [];
  const times = new Map<string, number>();
  for (const r of rows) times.set(r.name.trim(), (times.get(r.name.trim()) ?? 0) + 1);

  const groupName = g != null && g.name.trim() === '';
  const flags = new Map<string, RowIssues>();
  let count = groupName ? 1 : 0;
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
  return { flags, groupName, count };
}

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  const mutations = useCatalogMutations();
  const { confirm, confirmDialog } = useConfirm();
  const wage = useWageCatalog();
  const groups = catalog.cableGroups;

  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  const [draft, setDraft] = useState<GroupDraft | null>(groups[0] ? toDraft(groups[0]) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* 방금 더한 줄에 커서를 둔다 — 새 줄이 서기만 하고 손이 갈 곳을 안 알려 주면 한 번 더 눌러야 한다. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  /* 바깥을 누르면 풀린다 — 앱 공통 규칙(`useDismissOnOutside`). 「안」은 표와 그 상세다:
     상세에서 이름을 고치는 중에 선택이 풀리면 안 된다. */
  const tableRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  useDismissOnOutside(selectedKey != null, [tableRef, asideRef], () => setSelectedKey(null));

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
    setDraft(toDraft(g));
    setSelectedKey(null);
    setSaveError(null);
  };
  if (original == null && groups.length > 0 && selectedId != null) {
    // 목록이 갱신되며 고른 것이 사라진 경우
    setSelectedId(groups[0]!.id);
    setDraft(toDraft(groups[0]!));
  }

  const saved = useMemo(() => (original ? toDraft(original) : null), [original]);
  const dirty = draft != null && saved != null && !same(draft, saved);
  /* 탭을 옮기면 이 패널이 통째로 사라진다 — 떠나보내는 쪽(페이지)이 물을 수 있게 알린다. */
  useReportUnsaved(dirty);
  /* `selectGroup` 은 `dirty` 보다 위에 선다 — 최신 값을 ref 로 읽는다(선언 순서 때문이지
     성능 때문이 아니다). */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const { flags, groupName: groupNameIssue, count: issueCount } = useMemo(() => issuesOf(draft), [draft]);

  /* 고른 줄이 사라졌으면(취소·저장으로 초안이 다시 서면) 자연히 풀린다 — 따로 지우지 않는다. */
  const selectedRow = draft?.categories.find((r) => r.key === selectedKey) ?? null;
  const selectedIssues = selectedRow ? flags.get(selectedRow.key) : undefined;

  function patchGroup(patch: Partial<Omit<GroupDraft, 'categories'>>) {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...patch }));
  }

  function patchRow(key: string, patch: Partial<CategoryDraft>) {
    setDraft((prev) =>
      prev == null
        ? prev
        : { ...prev, categories: prev.categories.map((r) => (r.key === key ? { ...r, ...patch } : r)) },
    );
  }

  /* 새 줄은 서자마자 **골라진다** — 고칠 자리가 오른쪽이므로, 고르지 않으면 이름 한 칸을
     넣으려고 방금 만든 줄을 다시 눌러야 한다. */
  function addRow() {
    const key = newKey();
    setFocusKey(key);
    setSelectedKey(key);
    setSaveError(null);
    setDraft((prev) =>
      prev == null
        ? prev
        : {
            ...prev,
            categories: [...prev.categories, { id: null, key, name: '', laborCode: '', install: '0', remove: '0' }],
          },
    );
  }

  /* 지우는 것도 초안에 쌓인다 — 취소로 되돌아오므로 따로 묻지 않는다. 쓰이는 중인 종류라면
     저장할 때 서버가 무엇이 몇 개 걸려 있는지 이름으로 알려 준다. */
  function removeRow(key: string) {
    setSaveError(null);
    setSelectedKey((cur) => (cur === key ? null : cur));
    setDraft((prev) => (prev == null ? prev : { ...prev, categories: prev.categories.filter((r) => r.key !== key) }));
  }

  async function handleSave() {
    if (!original || !draft || saving || issueCount > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await mutations.putCableGroup.mutateAsync({
        id: original.id,
        body: {
          name: draft.name.trim(),
          color: draft.color,
          categories: draft.categories.map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            name: r.name.trim(),
            laborCode: r.laborCode.trim() || null,
            installHoursPerM: Number(r.install),
            removeHoursPerM: Number(r.remove),
          })),
        },
      });
      /* 새로 만든 줄은 이제 id 를 갖는다 — 서버가 돌려준 것으로 초안을 다시 세우지 않으면
         다음 저장에서 같은 줄을 또 만든다. */
      setDraft(toDraft(updated));
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, '저장하지 못했습니다'));
    } finally {
      setSaving(false);
    }
  }

  /* 고치는 중인 그룹은 목록에도 **초안**을 보여 준다 — 색을 고르는 자리(상세)와 그 색이
     실제로 쓰이는 자리(목록의 점)가 다르므로, 저장해야 결과를 알 수 있으면 색을 못 고른다. */
  const listGroups = [
    {
      key: 'all',
      label: null,
      items: groups.map((g) => {
        const live = g.id === selectedId && draft != null ? draft : null;
        const count = live?.categories.length ?? g.categories.length;
        return {
          id: g.id,
          name: live?.name.trim() || g.name,
          dot: live?.color ?? g.color,
          hint: String(count),
          hintTitle: `케이블 종류 ${count}개`,
        };
      }),
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
            description="좌측 목록에서 그룹을 고르세요. 그룹 안의 종류가 실제로 케이블에 붙어 설계서 공량의 근거가 됩니다."
          />
        ) : (
          <>
            <CatalogEditorBar
              title={draft.name.trim() || original.name}
              dirty={dirty}
              saving={saving}
              issueCount={issueCount}
              error={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setDraft(saved)}
              onSave={() => void handleSave()}
            />

            {/* `표 │ 상세` — 평면도(도면 │ 상세)·설비 종류(격자 │ 상세)와 같은 배치다.
                **표는 읽는 것이고 고치는 일은 오른쪽이 맡는다**: 칸마다 상자를 깔면 「이 칸은
                고칠 수 있다」는 표시가 아무 말도 못 하고(네 칸이 다 상자다) 훑어 읽기만
                방해한다. 선번장이 상자를 다는 것은 여섯 칸 중 셋만 편집이라 그 표시가 뜻을
                갖기 때문이다.

                종류마다 **품셈을 적는다** — 자산 종류·설비 종류와 같은 층이다. 같은 광이라도
                OPGW 가공(외선)과 실내 점퍼 결선은 품이 다르므로, 그룹 하나로 뭉쳐 두면 그
                차이가 설계서에서 사라진다. */}
            <div className="flex min-h-0 flex-1 gap-3 p-4">
              <div ref={tableRef} className="flex min-w-0 flex-1 flex-col">
                <TableCard widths={COL_WIDTHS} fill>
                  <thead>
                    {/* 머리글은 스크롤해도 남는다 — 현황표와 같은 규칙. */}
                    <tr className="sticky top-0 z-sticky">
                      <Th>이름</Th>
                      <Th>노무유형</Th>
                      <Th className="text-right">신설(h/m)</Th>
                      <Th className="text-right">철거(h/m)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.categories.map((row) => {
                      const bad = flags.get(row.key);
                      return (
                        <tr
                          key={row.key}
                          className={cn(
                            'border-b border-line last:border-0',
                            SELECTABLE,
                            row.key === selectedKey && SELECTED,
                          )}
                          /* 같은 것을 다시 누르면 풀린다 — 격자·상세 패널과 같은 규칙. */
                          onClick={() => setSelectedKey((cur) => (cur === row.key ? null : row.key))}
                        >
                          <td className={cn('truncate px-3 py-1.5', bad?.name ? 'text-danger' : 'text-content')}>
                            {row.name.trim() || '(이름 없음)'}
                          </td>
                          {/* 표에는 **이름**이 선다 — 저장되는 것은 코드다(`useWageCatalog`). */}
                          <td className="truncate px-3 py-1.5 text-content-muted">
                            {wage.nameOf(row.laborCode.trim() || null) ?? '—'}
                          </td>
                          {/* 수는 오른쪽으로 — 자릿수가 세로로 맞아야 크기가 비교된다. */}
                          <td
                            className={cn(
                              'px-3 py-1.5 text-right tabular-nums',
                              bad?.install ? 'text-danger' : 'text-content',
                            )}
                          >
                            {row.install.trim() || '—'}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-1.5 text-right tabular-nums',
                              bad?.remove ? 'text-danger' : 'text-content',
                            )}
                          >
                            {row.remove.trim() || '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 「추가」는 표의 **맨 아래 줄**이다 — 왼쪽 목록의 「분류 추가」와 같은
                        자리, 같은 뜻(CatalogList). 머리 위에 뜬 버튼 하나보다 어디에 생길지가
                        분명하다. */}
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

              {/* 상세 — **한 자리에서 문맥만 바뀐다.** 아무것도 안 골랐으면 그룹 자신,
                  종류를 골랐으면 그 종류. 상세 패널과 같은 폭(384px). */}
              <aside ref={asideRef} className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
                {selectedRow ? (
                  <>
                    <DetailCard>
                      <DetailCardHeader
                        title={selectedRow.name.trim() || '새 종류'}
                        /* 초안이라 저장 전이다 — 묻지 않는다(취소로 통째로 되돌릴 수 있다). */
                        onDelete={() => removeRow(selectedRow.key)}
                      />
                      <DetailRow
                        label="이름"
                        issue={selectedIssues?.name ? '이름이 비었거나 같은 그룹 안에서 겹칩니다' : null}
                      >
                        <Input
                          aria-label="종류 이름"
                          autoFocus={selectedRow.key === focusKey}
                          invalid={selectedIssues?.name}
                          value={selectedRow.name}
                          placeholder="예: 광점퍼코드"
                          onChange={(e) => patchRow(selectedRow.key, { name: e.currentTarget.value })}
                        />
                      </DetailRow>
                    </DetailCard>

                    <DetailCard>
                      <DetailCardHeader title="공량" />
                      <DetailRow label="노무유형">
                        <LaborTypeSelect
                          value={selectedRow.laborCode || null}
                          onChange={(code) => patchRow(selectedRow.key, { laborCode: code ?? '' })}
                        />
                      </DetailRow>
                      <DetailRow label="신설(h/m)" issue={selectedIssues?.install ? '0 이상의 수' : null}>
                        <Input
                          aria-label="신설 공량"
                          type="number"
                          invalid={selectedIssues?.install}
                          value={selectedRow.install}
                          onChange={(e) => patchRow(selectedRow.key, { install: e.currentTarget.value })}
                        />
                      </DetailRow>
                      <DetailRow label="철거(h/m)" issue={selectedIssues?.remove ? '0 이상의 수' : null}>
                        <Input
                          aria-label="철거 공량"
                          type="number"
                          invalid={selectedIssues?.remove}
                          value={selectedRow.remove}
                          onChange={(e) => patchRow(selectedRow.key, { remove: e.currentTarget.value })}
                        />
                      </DetailRow>
                    </DetailCard>
                  </>
                ) : (
                  <DetailCard>
                    <DetailCardHeader title="그룹" badge={`종류 ${draft.categories.length}`} badgeStatus="neutral" />
                    <DetailRow label="이름" issue={groupNameIssue ? '이름은 비울 수 없습니다' : null}>
                      <Input
                        aria-label="그룹 이름"
                        invalid={groupNameIssue}
                        value={draft.name}
                        onChange={(e) => patchGroup({ name: e.currentTarget.value })}
                      />
                    </DetailRow>
                    <DetailRow label="색상" hint="도면에서 이 그룹의 케이블이 그려지는 색">
                      {/* hex 코드는 굳이 읽을 것이 아니다 — 스와치가 값을 보여준다. */}
                      <input
                        type="color"
                        aria-label="그룹 색상"
                        value={draft.color}
                        title={draft.color}
                        onChange={(e) => patchGroup({ color: e.currentTarget.value })}
                        className="h-7 w-10 cursor-pointer rounded border border-line"
                      />
                    </DetailRow>
                  </DetailCard>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
