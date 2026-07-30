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
import { DetailCard, DetailCardHeader, Input, IconButton, Badge } from '../../../components/ui';
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
    <div className="rounded border border-line bg-surface-2 p-2 space-y-1.5">
      {error && (
        <div className="flex items-center gap-1">
          <span className="flex-1 text-xs text-danger">{error}</span>
          <IconButton aria-label="오류 닫기" onClick={() => setError(null)}>
            <X size={11} />
          </IconButton>
        </div>
      )}

      {/* key — 표시만 */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">키</span>
        <Badge status="neutral">{group.key}</Badge>
      </div>

      {/* name */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">이름</span>
        <Input
          aria-label={`그룹 ${group.key} 이름`}
          value={editName}
          onChange={(e) => setEditName(e.currentTarget.value)}
        />
      </div>

      {/* color */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">색상</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={editColor}
            aria-label={`그룹 ${group.key} 색상`}
            onChange={(e) => setEditColor(e.currentTarget.value)}
            className="h-7 w-10 cursor-pointer rounded border border-line"
          />
          <span className="text-xs text-content-muted">{editColor}</span>
        </div>
      </div>

      {/* laborType */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">노무유형</span>
        <Input
          aria-label={`그룹 ${group.key} 노무유형`}
          value={editLaborType}
          placeholder="예: 통신내선공"
          onChange={(e) => setEditLaborType(e.currentTarget.value)}
        />
      </div>

      {/* installHoursPerM */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">신설(h/m)</span>
        <Input
          aria-label={`그룹 ${group.key} 신설 공량`}
          type="number"
          value={editInstall}
          onChange={(e) => setEditInstall(e.currentTarget.value)}
        />
      </div>

      {/* removeHoursPerM */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-content-muted">철거(h/m)</span>
        <Input
          aria-label={`그룹 ${group.key} 철거 공량`}
          type="number"
          value={editRemove}
          onChange={(e) => setEditRemove(e.currentTarget.value)}
        />
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex items-center gap-1 rounded border border-primary px-2 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <Check size={12} />
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      )}

      {/* 카테고리 리스트 */}
      <CableCategoryList group={group} />
    </div>
  );
}

/** 그룹 내 카테고리 관리 */
function CableCategoryList({ group }: { group: V2CableGroup }) {
  const mutations = useCatalogMutations();
  const [catError, setCatError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function handleAdd() {
    const name = window.prompt('새 케이블 종류 이름');
    if (!name?.trim()) return;
    setCatError(null);
    const maxOrder = Math.max(0, ...group.categories.map((c) => c.sortOrder));
    try {
      await mutations.createCableCategory.mutateAsync({
        groupId: group.id,
        name: name.trim(),
        sortOrder: maxOrder + 1,
      });
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
      await mutations.patchCableCategory.mutateAsync({
        id: cat.id,
        body: { name: editingName.trim() },
      });
      setEditingId(null);
    } catch (err: unknown) {
      setCatError(apiErrorMessage(err, '이름 변경 실패'));
    }
  }

  async function handleDelete(cat: V2CableCategory) {
    if (!window.confirm(`'${cat.name}' 케이블 종류를 삭제할까요?`)) return;
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
        <button
          type="button"
          onClick={() => void handleAdd()}
          className="flex items-center gap-0.5 text-xs text-primary hover:underline focus-visible:outline-none rounded"
        >
          <Plus size={11} />
          추가
        </button>
      </div>

      {catError && (
        <div className="flex items-center gap-1">
          <span className="flex-1 text-xs text-danger">{catError}</span>
          <IconButton aria-label="카테고리 오류 닫기" onClick={() => setCatError(null)}>
            <X size={11} />
          </IconButton>
        </div>
      )}

      {group.categories.length === 0 && (
        <p className="text-xs text-content-faint">종류가 없습니다.</p>
      )}

      {group.categories.map((cat) => (
        <div key={cat.id} className="flex items-center gap-1.5">
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
              <IconButton
                aria-label="저장"
                onClick={() => void commitEdit(cat)}
              >
                <Check size={12} />
              </IconButton>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-content">{cat.name}</span>
              <IconButton
                aria-label={`${cat.name} 이름 변경`}
                onClick={() => startEdit(cat)}
              >
                <Pencil size={12} />
              </IconButton>
              <IconButton
                aria-label={`${cat.name} 삭제`}
                onClick={() => void handleDelete(cat)}
              >
                <Trash2 size={12} />
              </IconButton>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function CableCatalogPanel({ catalog }: CableCatalogPanelProps) {
  return (
    <div className="space-y-4 p-4">
      <DetailCard>
        <DetailCardHeader title="케이블 그룹 관리" />
        <p className="text-xs text-content-faint">
          그룹 키는 변경할 수 없습니다. 이름·색상·노무유형·공량을 수정하고 저장 버튼을 누르세요.
        </p>
      </DetailCard>

      {catalog.cableGroups.length === 0 && (
        <p className="text-sm text-content-faint">케이블 그룹이 없습니다.</p>
      )}

      {catalog.cableGroups.map((group) => (
        <CableGroupRow key={group.id} group={group} />
      ))}
    </div>
  );
}
