/**
 * CableCatalogPanel — 대장의 「케이블 종류」 탭
 *
 * 다른 두 탭과 **같은 모양**이다: 왼쪽 목록에서 그룹을 고르고, 오른쪽에서 그 그룹을 고친다.
 * 예전에는 여섯 그룹을 한 장에 세로로 늘어놓고 카드마다 저장 버튼을 달았다 — 셋 다 「분류 →
 * 항목」 2단인데 케이블만 손길이 달라서, 탭을 옮길 때마다 무엇을 어디서 누르는지 다시
 * 익혀야 했다.
 *
 * 그룹은 늘리지 않는다(포트가 무엇과 이어지는지를 이 키로 판정한다) — 그래서 `+` 가 없고,
 * 늘어나는 것은 그룹 안의 **종류**다.
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  DetailCard,
  DetailCardHeader,
  DetailRow,
  EmptyState,
  ErrorStrip,
  Input,
  IconButton,
  PromptModal,
  useConfirm,
  useInlineRename,
  cn,
  SELECTABLE,
} from '../../../components/ui';
import type { V2Catalog, V2CableGroup, V2CableCategory } from '../../types';
import { useReportUnsaved } from '../../unsavedGuard';
import { useCatalogMutations } from '../../hooks';
import { apiErrorMessage } from '../../apiError';
import { CatalogList } from './CatalogList';
import { CatalogEditorBar } from './CatalogEditorBar';

interface CableCatalogPanelProps {
  catalog: V2Catalog;
}

/** 편집 중인 그룹 — 서버 형상에서 고칠 수 있는 것만. */
interface GroupDraft {
  name: string;
  color: string;
}

const toDraft = (g: V2CableGroup): GroupDraft => ({
  name: g.name,
  color: g.color,
});

/** 공량은 미터당 값이라 소수다 — 빈칸이나 글자면 원래 값을 지킨다. */
const num = (raw: string, fallback: number) => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : fallback);

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  const mutations = useCatalogMutations();
  const { confirm, confirmDialog } = useConfirm();
  const groups = catalog.cableGroups;

  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  const [draft, setDraft] = useState<GroupDraft | null>(groups[0] ? toDraft(groups[0]) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const original = groups.find((g) => g.id === selectedId) ?? null;

  /* 다른 그룹으로 옮기기 전에 묻는다 — 세 탭이 같은 규칙이어야 한다(예전에는 조용히 버렸다). */
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
    setSaveError(null);
  };
  if (original == null && groups.length > 0 && selectedId != null) {
    // 목록이 갱신되며 고른 것이 사라진 경우
    setSelectedId(groups[0]!.id);
    setDraft(toDraft(groups[0]!));
  }

  const dirty = useMemo(() => {
    if (!original || !draft) return false;
    return draft.name.trim() !== original.name || draft.color !== original.color;
  }, [draft, original]);
  /* 탭을 옮기면 이 패널이 통째로 사라진다 — 떠나보내는 쪽(페이지)이 물을 수 있게 알린다. */
  useReportUnsaved(dirty);
  /* `selectGroup` 은 `dirty` 보다 위에 선다 — 최신 값을 ref 로 읽는다(선언 순서 때문이지
     성능 때문이 아니다). */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  async function handleSave() {
    if (!original || !draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await mutations.patchCableGroup.mutateAsync({
        id: original.id,
        body: { name: draft.name.trim() || original.name, color: draft.color },
      });
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
      items: groups.map((g) => ({ id: g.id, name: g.name, hint: String(g.categories.length), hintTitle: `케이블 종류 ${g.categories.length}개` })),
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
            description="좌측 목록에서 그룹을 고르세요. 그룹은 미터당 공량과 도면 색을 정하고, 그 안의 종류가 실제로 케이블에 붙습니다."
          />
        ) : (
          <>
            <CatalogEditorBar
              title={original.name}
              dirty={dirty}
              saving={saving}
              error={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setDraft(toDraft(original))}
              onSave={() => void handleSave()}
            />

            {/* 카드 **두 장**이다. 예전에는 그룹·공량·종류 셋을 2단에 흘려서, 오른쪽 공량
                (190px)이 왼쪽 행 높이를 정하는 바람에 그룹 카드 아래에 설명 없는 50px 구멍이
                났고 2행 오른쪽은 통째로 비었다(실측). 다섯 값 모두 「이 그룹은 무엇인가」에
                대한 답이므로 한 카드에 담는다 — CONVENTIONS §3 과 같은 논리. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid w-full items-start gap-3 p-4 xl:grid-cols-2">
                <DetailCard>
                  <DetailCardHeader title="그룹" />
                  <DetailRow label="이름">
                    <Input
                      aria-label="그룹 이름"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
                    />
                  </DetailRow>
                  <DetailRow label="색상" hint="도면에서 이 그룹의 케이블이 그려지는 색">
                    {/* hex 코드는 굳이 읽을 것이 아니다 — 스와치가 값을 보여준다. */}
                    <input
                      type="color"
                      aria-label="그룹 색상"
                      value={draft.color}
                      title={draft.color}
                      onChange={(e) => setDraft({ ...draft, color: e.currentTarget.value })}
                      className="h-7 w-10 cursor-pointer rounded border border-line"
                    />
                  </DetailRow>
                </DetailCard>

                <CableCategoryCard group={original} />
              </div>
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

/**
 * 그룹 안의 종류 — 실제로 케이블에 붙는 것이고 **품셈을 갖는다**.
 *
 * 그룹은 늘리지 않지만 종류는 계속 는다. 저장 바를 거치지 않고 바로 반영되는 이유: 칸마다
 * 값이 하나씩이라 「고치는 중」 상태를 둘 것이 없고, 삭제는 쓰이는 중이면 서버가 거부한다.
 */
function CableCategoryCard({ group }: { group: V2CableGroup }) {
  const { confirm, confirmDialog } = useConfirm();
  const mutations = useCatalogMutations();
  const [error, setError] = useState<string | null>(null);
  /* 제자리 이름 바꾸기 — 세 탭이 같은 규칙을 쓴다(`useInlineRename`). */
  const rename = useInlineRename((id, name) => {
    void mutations.patchCableCategory
      .mutateAsync({ id, body: { name } })
      .catch((err: unknown) => setError(apiErrorMessage(err, '이름을 바꾸지 못했습니다')));
  });
  const [addOpen, setAddOpen] = useState(false);

  async function handleAdd(name: string) {
    setError(null);
    const maxOrder = Math.max(0, ...group.categories.map((c) => c.sortOrder));
    try {
      await mutations.createCableCategory.mutateAsync({ groupId: group.id, name, sortOrder: maxOrder + 1 });
      setAddOpen(false); // 성공했을 때만 닫는다 — 실패는 모달 안에서 보여준다
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '추가하지 못했습니다'));
    }
  }

  /** 품셈 한 칸 — 칸을 떠날 때 바로 반영한다(이름과 같은 규칙). */
  async function saveLabor(cat: V2CableCategory, body: Parameters<typeof mutations.patchCableCategory.mutateAsync>[0]['body']) {
    setError(null);
    try {
      await mutations.patchCableCategory.mutateAsync({ id: cat.id, body });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '저장하지 못했습니다'));
    }
  }

  async function handleDelete(cat: V2CableCategory) {
    const ok = await confirm({
      title: '케이블 종류 삭제',
      message: `'${cat.name}' 을 삭제합니다. 이 종류를 쓰는 케이블이 있으면 거부됩니다.`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await mutations.deleteCableCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '삭제하지 못했습니다'));
    }
  }

  return (
    <DetailCard>
      <DetailCardHeader
        title="종류"
        badge={String(group.categories.length)}
        badgeStatus="neutral"
        actions={
          <Button variant="secondary" size="sm" onClick={() => { setError(null); setAddOpen(true); }}>
            추가
          </Button>
        }
      />
      <ErrorStrip message={error} />
      {group.categories.length === 0 && <p className="text-xs text-content-faint">종류가 없습니다.</p>}

      {/* 종류마다 **품셈을 적는다** — 자산 종류·설비 종류와 같은 층이다. 같은 광이라도
          OPGW 가공(외선)과 실내 점퍼 결선은 품이 다르므로, 그룹 하나로 뭉쳐 두면 그 차이가
          설계서에서 사라진다. 값은 저장 바를 거치지 않고 칸을 떠날 때 바로 반영된다 —
          이름과 같은 규칙이다(고치는 중 상태를 둘 것이 없다). */}
      <div className="grid grid-cols-[1fr_8rem_5rem_5rem_auto] items-center gap-x-2 gap-y-1">
        <span className="text-xs text-content-muted">이름</span>
        <span className="text-xs text-content-muted">노무유형</span>
        <span className="text-xs text-content-muted">신설(h/m)</span>
        <span className="text-xs text-content-muted">철거(h/m)</span>
        <span />
        {group.categories.map((cat) => (
          <Fragment key={cat.id}>
            {rename.isEditing(cat.id) ? (
              rename.field(cat.id, cat.name, `${cat.name} 이름 편집`)
            ) : (
              <button
                type="button"
                className={cn('truncate rounded px-1 text-left text-sm text-content', SELECTABLE)}
                title="이름 바꾸기"
                onClick={() => rename.start(cat.id, cat.name)}
              >
                {cat.name}
              </button>
            )}
            <Input
              aria-label={`${cat.name} 노무유형`}
              size="sm"
              defaultValue={cat.laborType ?? ''}
              placeholder="예: 통신내선공"
              onBlur={(e) => void saveLabor(cat, { laborType: e.currentTarget.value.trim() || null })}
            />
            <Input
              aria-label={`${cat.name} 신설 공량`}
              size="sm"
              type="number"
              defaultValue={String(cat.installHoursPerM)}
              onBlur={(e) => void saveLabor(cat, { installHoursPerM: num(e.currentTarget.value, cat.installHoursPerM) })}
            />
            <Input
              aria-label={`${cat.name} 철거 공량`}
              size="sm"
              type="number"
              defaultValue={String(cat.removeHoursPerM)}
              onBlur={(e) => void saveLabor(cat, { removeHoursPerM: num(e.currentTarget.value, cat.removeHoursPerM) })}
            />
            <IconButton aria-label={`${cat.name} 삭제`} size="sm" onClick={() => void handleDelete(cat)}>
              <Trash2 size={12} />
            </IconButton>
          </Fragment>
        ))}
      </div>

      <PromptModal
        open={addOpen}
        title="케이블 종류 추가"
        hint={`'${group.name}' 그룹에 속하는 종류입니다.`}
        label="종류 이름"
        placeholder="예: 광점퍼코드"
        busy={mutations.createCableCategory.isPending}
        error={error}
        onConfirm={handleAdd}
        onClose={() => setAddOpen(false)}
      />
      {confirmDialog}
    </DetailCard>
  );
}
