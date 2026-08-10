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
import { useMemo, useState } from 'react';
import { Pencil, Check, Trash2 } from 'lucide-react';
import {
  Button,
  DetailCard,
  DetailCardHeader,
  DetailRow,
  EmptyState,
  Input,
  IconButton,
  PromptModal,
  useConfirm,
} from '../../../components/ui';
import type { V2Catalog, V2CableGroup, V2CableCategory } from '../../types';
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
  laborType: string;
  installHoursPerM: string;
  removeHoursPerM: string;
}

const toDraft = (g: V2CableGroup): GroupDraft => ({
  name: g.name,
  color: g.color,
  laborType: g.laborType ?? '',
  installHoursPerM: String(g.installHoursPerM),
  removeHoursPerM: String(g.removeHoursPerM),
});

/** 공량은 미터당 값이라 소수다 — 빈칸이나 글자면 원래 값을 지킨다. */
const num = (raw: string, fallback: number) => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : fallback);

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  const mutations = useCatalogMutations();
  const groups = catalog.cableGroups;

  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  const [draft, setDraft] = useState<GroupDraft | null>(groups[0] ? toDraft(groups[0]) : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const original = groups.find((g) => g.id === selectedId) ?? null;

  /* 고른 것이 사라졌거나(첫 로드) 바뀌면 초안을 새로 뜬다 — 편집 중이면 그대로 둔다. */
  const selectGroup = (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
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
    return (
      draft.name.trim() !== original.name ||
      draft.color !== original.color ||
      (draft.laborType.trim() || null) !== original.laborType ||
      num(draft.installHoursPerM, original.installHoursPerM) !== original.installHoursPerM ||
      num(draft.removeHoursPerM, original.removeHoursPerM) !== original.removeHoursPerM
    );
  }, [draft, original]);

  async function handleSave() {
    if (!original || !draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await mutations.patchCableGroup.mutateAsync({
        id: original.id,
        body: {
          name: draft.name.trim() || original.name,
          color: draft.color,
          // 빈 문자열 → null 전송(백엔드의 명시적 clear 신호; undefined 는 기존값 유지)
          laborType: draft.laborType.trim() === '' ? null : draft.laborType.trim(),
          installHoursPerM: num(draft.installHoursPerM, original.installHoursPerM),
          removeHoursPerM: num(draft.removeHoursPerM, original.removeHoursPerM),
        },
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
      items: groups.map((g) => ({ id: g.id, name: g.name, hint: String(g.categories.length) })),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1">
      <CatalogList
        title="케이블 그룹"
        groups={listGroups}
        selectedId={selectedId}
        onSelect={selectGroup}
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

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl space-y-3 p-4">
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

                {/* 공량은 미터당이다 — 자산·설비가 「대」 단위인 것과 다르므로 단위를 라벨에 적는다. */}
                <DetailCard>
                  <DetailCardHeader title="공량" />
                  <DetailRow label="노무유형">
                    <Input
                      aria-label="노무유형"
                      value={draft.laborType}
                      placeholder="예: 통신내선공"
                      onChange={(e) => setDraft({ ...draft, laborType: e.currentTarget.value })}
                    />
                  </DetailRow>
                  <DetailRow label="신설(h/m)">
                    <Input
                      aria-label="신설 공량"
                      type="number"
                      value={draft.installHoursPerM}
                      onChange={(e) => setDraft({ ...draft, installHoursPerM: e.currentTarget.value })}
                    />
                  </DetailRow>
                  <DetailRow label="철거(h/m)">
                    <Input
                      aria-label="철거 공량"
                      type="number"
                      value={draft.removeHoursPerM}
                      onChange={(e) => setDraft({ ...draft, removeHoursPerM: e.currentTarget.value })}
                    />
                  </DetailRow>
                </DetailCard>

                <CableCategoryCard group={original} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 그룹 안의 종류 — 실제로 케이블에 붙는 것.
 *
 * 그룹은 늘리지 않지만 종류는 계속 는다. 저장 바를 거치지 않고 바로 반영되는 이유: 이름 하나뿐이라
 * 「고치는 중」 상태를 둘 것이 없고, 삭제는 쓰이는 중이면 서버가 거부한다.
 */
function CableCategoryCard({ group }: { group: V2CableGroup }) {
  const { confirm, confirmDialog } = useConfirm();
  const mutations = useCatalogMutations();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
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

  async function commitEdit(cat: V2CableCategory) {
    if (editingName.trim() === '' || editingName.trim() === cat.name) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      await mutations.patchCableCategory.mutateAsync({ id: cat.id, body: { name: editingName.trim() } });
      setEditingId(null);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '이름을 바꾸지 못했습니다'));
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
      {error && <p className="text-xs text-danger">{error}</p>}
      {group.categories.length === 0 && <p className="text-xs text-content-faint">종류가 없습니다.</p>}

      <ul className="space-y-0.5">
        {group.categories.map((cat) => (
          <li key={cat.id} className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-2">
            {editingId === cat.id ? (
              <>
                <Input
                  aria-label="종류 이름 편집"
                  value={editingName}
                  className="flex-1"
                  autoFocus
                  onChange={(e) => setEditingName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitEdit(cat);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <IconButton aria-label="저장" onClick={() => void commitEdit(cat)}>
                  <Check size={12} />
                </IconButton>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-content">{cat.name}</span>
                {/* 목록 행의 액션은 호버에서 드러낸다(조직 트리와 같은 규칙).
                    자리는 항상 차지하므로 호버해도 행이 움직이지 않는다. */}
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconButton
                    aria-label={`${cat.name} 이름 변경`}
                    size="sm"
                    onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                  >
                    <Pencil size={12} />
                  </IconButton>
                  <IconButton aria-label={`${cat.name} 삭제`} size="sm" onClick={() => void handleDelete(cat)}>
                    <Trash2 size={12} />
                  </IconButton>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

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
