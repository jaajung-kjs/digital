/**
 * CableCatalogPanel — 케이블 카탈로그 관리 탭
 *
 * 그룹 테이블: 이름/색/노무유형/설치공량(per m)/철거공량(per m) 인라인 편집
 *   — key는 표시만
 * 그룹별 종류(카테고리) 리스트: 추가/이름변경/삭제
 *   — 삭제 409(CABLE_CATEGORY_IN_USE) 에러 표면화
 */
import { useState } from 'react';
import { X, Plus, Pencil, Check, Trash2 } from 'lucide-react';
import {
  Button,
  DetailCard,
  DetailCardHeader,
  Input,
  IconButton,
  Badge,
  ErrorStrip,
  PromptModal,
  useConfirm,
  ItemCard,
  DetailRow,
} from '../../../components/ui';
import type { V2Catalog, V2CableGroup, V2CableCategory } from '../../types';
import { useCatalogMutations } from '../../hooks';
import { apiErrorMessage } from '../../apiError';

interface CableCatalogPanelProps {
  catalog: V2Catalog;
}

/** 그룹 행 인라인 편집 */
function CableGroupRow({ group }: { group: V2CableGroup }) {
  const mutations = useCatalogMutations();
  const [editName, setEditName] = useState(group.name);
  const [editColor, setEditColor] = useState(group.color);
  const [editLaborType, setEditLaborType] = useState(group.laborType ?? '');
  const [editInstall, setEditInstall] = useState(String(group.installHoursPerM));
  const [editRemove, setEditRemove] = useState(String(group.removeHoursPerM));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const installVal = parseFloat(editInstall);
    const removeVal = parseFloat(editRemove);
    // 빈 문자열 → null 전송 (백엔드의 명시적 clear 신호; undefined 는 기존값 유지)
    const laborTypeVal = editLaborType.trim() === '' ? null : editLaborType.trim();
    try {
      await mutations.patchCableGroup.mutateAsync({
        id: group.id,
        body: {
          name: editName.trim() || group.name,
          color: editColor,
          laborType: laborTypeVal,
          installHoursPerM: isNaN(installVal) ? group.installHoursPerM : installVal,
          removeHoursPerM: isNaN(removeVal) ? group.removeHoursPerM : removeVal,
        },
      });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, '저장 실패'));
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    editName.trim() !== group.name ||
    editColor !== group.color ||
    (editLaborType.trim() || null) !== group.laborType ||
    parseFloat(editInstall) !== group.installHoursPerM ||
    parseFloat(editRemove) !== group.removeHoursPerM;

  return (
    <ItemCard title={<Badge status="neutral">{group.key}</Badge>}>
      <ErrorStrip message={error} onDismiss={() => setError(null)} />

      {/* name */}
      <DetailRow label="이름">
        <Input
          aria-label={`그룹 ${group.key} 이름`}
          value={editName}
          onChange={(e) => setEditName(e.currentTarget.value)}
        />
      </DetailRow>

      {/* color */}
      <DetailRow label="색상">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={editColor}
            aria-label={`그룹 ${group.key} 색상`}
            onChange={(e) => setEditColor(e.currentTarget.value)}
            title={editColor}
            className="h-7 w-10 cursor-pointer rounded border border-line"
          />
          {/* hex 코드는 굳이 읽을 것이 아니다 — 스와치가 값을 보여준다.
              색을 바꿀 때만 알아볼 수 있게 툴팁으로 남긴다. */}
        </div>
      </DetailRow>

      {/* laborType */}
      <DetailRow label="노무유형">
        <Input
          aria-label={`그룹 ${group.key} 노무유형`}
          value={editLaborType}
          placeholder="예: 통신내선공"
          onChange={(e) => setEditLaborType(e.currentTarget.value)}
        />
      </DetailRow>

      {/* installHoursPerM */}
      <DetailRow label="신설(h/m)">
        <Input
          aria-label={`그룹 ${group.key} 신설 공량`}
          type="number"
          value={editInstall}
          onChange={(e) => setEditInstall(e.currentTarget.value)}
        />
      </DetailRow>

      {/* removeHoursPerM */}
      <DetailRow label="철거(h/m)">
        <Input
          aria-label={`그룹 ${group.key} 철거 공량`}
          type="number"
          value={editRemove}
          onChange={(e) => setEditRemove(e.currentTarget.value)}
        />
      </DetailRow>

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" disabled={saving} leftIcon={<Check size={12} />} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      )}

      {/* 카테고리 리스트 */}
      <CableCategoryList group={group} />
    </ItemCard>
  );
}

/** 그룹 내 카테고리 관리 */
function CableCategoryList({ group }: { group: V2CableGroup }) {
  const { confirm, confirmDialog } = useConfirm();
  const mutations = useCatalogMutations();
  const [catError, setCatError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  async function handleAdd(name: string) {
    setCatError(null);
    const maxOrder = Math.max(0, ...group.categories.map((c) => c.sortOrder));
    try {
      await mutations.createCableCategory.mutateAsync({
        groupId: group.id,
        name,
        sortOrder: maxOrder + 1,
      });
      setAddOpen(false); // 성공했을 때만 닫는다 — 실패는 모달 안에서 보여준다
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, '추가 실패'));
    }
  }

  function startEdit(cat: V2CableCategory) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  async function commitEdit(cat: V2CableCategory) {
    if (editingName.trim() === '' || editingName.trim() === cat.name) {
      setEditingId(null);
      return;
    }
    setCatError(null);
    try {
      await mutations.patchCableCategory.mutateAsync({ id: cat.id, body: { name: editingName.trim() } });
      setEditingId(null);
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, '이름 변경 실패'));
    }
  }

  async function handleDelete(cat: V2CableCategory) {
    if (
      !(await confirm({
        title: '케이블 종류 삭제',
        message: `'${cat.name}' 을 삭제합니다.`,
        confirmLabel: '삭제',
        danger: true,
      }))
    )
      return;
    setCatError(null);
    try {
      await mutations.deleteCableCategory.mutateAsync(cat.id);
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, '삭제 실패'));
    }
  }

  return (
    <div className="mt-1 border-t border-line pt-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs font-medium text-content-muted">종류 (카테고리)</span>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={13} />}
          onClick={() => {
            setCatError(null);
            setAddOpen(true);
          }}
        >
          추가
        </Button>
      </div>

      <PromptModal
        open={addOpen}
        title="케이블 종류 추가"
        hint={`'${group.name}' 그룹에 속하는 종류입니다.`}
        label="종류 이름"
        placeholder="예: 광점퍼코드"
        busy={mutations.createCableCategory.isPending}
        error={catError}
        onConfirm={handleAdd}
        onClose={() => setAddOpen(false)}
      />

      {catError && (
        <div className="flex items-center gap-1">
          <span className="flex-1 text-xs text-danger">{catError}</span>
          <IconButton aria-label="카테고리 오류 닫기" onClick={() => setCatError(null)}>
            <X size={11} />
          </IconButton>
        </div>
      )}

      {group.categories.length === 0 && <p className="text-xs text-content-faint">종류가 없습니다.</p>}

      {group.categories.map((cat) => (
        <div key={cat.id} className="group flex items-center gap-1.5 rounded px-1 hover:bg-surface-2">
          {editingId === cat.id ? (
            <>
              <Input
                aria-label="종류 이름 편집"
                value={editingName}
                className="flex-1"
                onChange={(e) => setEditingName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitEdit(cat);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <IconButton aria-label="저장" onClick={() => void commitEdit(cat)}>
                <Check size={12} />
              </IconButton>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-content">{cat.name}</span>
              {/* 목록 행의 액션은 호버에서 드러낸다(조직 트리와 같은 규칙).
                  자리는 항상 차지하므로 호버해도 행이 움직이지 않는다. */}
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <IconButton aria-label={`${cat.name} 이름 변경`} size="sm" onClick={() => startEdit(cat)}>
                  <Pencil size={12} />
                </IconButton>
                <IconButton aria-label={`${cat.name} 삭제`} size="sm" onClick={() => void handleDelete(cat)}>
                  <Trash2 size={12} />
                </IconButton>
              </span>
            </>
          )}
        </div>
      ))}
      {confirmDialog}
    </div>
  );
}

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <DetailCard>
        <DetailCardHeader title="케이블 그룹 관리" />
        <p className="text-xs text-content-faint">
          그룹 키는 변경할 수 없습니다. 이름·색상·노무유형·공량을 수정하고 저장 버튼을 누르세요.
        </p>
      </DetailCard>

      {catalog.cableGroups.length === 0 && <p className="text-xs text-content-faint">케이블 그룹이 없습니다.</p>}

      {catalog.cableGroups.map((group) => (
        <CableGroupRow key={group.id} group={group} />
      ))}
    </div>
  );
}
