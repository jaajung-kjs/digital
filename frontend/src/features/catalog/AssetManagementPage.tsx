import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCatalogStore, newCatalogId } from './catalogStore';
import { CatalogSaveBar } from './CatalogSaveBar';
import { CatalogListPane } from './CatalogListPane';
import { CatalogDetailPane } from './CatalogDetailPane';

type Segment = 'asset' | 'cable';

/**
 * 자산관리 — 전역 마스터데이터(종류·분류) 관리 화면. 관리자 전용.
 * 카탈로그 워킹카피(스테이징 → 원자적 저장/취소). 변전소 워킹카피와 분리.
 * 2-pane: 좌=CatalogListPane, 우=CatalogDetailPane. 세그먼트 설비/케이블.
 */
export function AssetManagementPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const load = useCatalogStore((s) => s.load);
  const discard = useCatalogStore((s) => s.discard);
  const [seg, setSeg] = useState<Segment>('asset');

  // 원시 슬라이스 구독 (effectiveXxx()는 매 호출마다 새 배열 — selector 에서 직접 쓰면 무한 루프)
  const baseCategories = useCatalogStore((s) => s.baseCategories);
  const catOverlay = useCatalogStore((s) => s.catOverlay);
  const baseTypes = useCatalogStore((s) => s.baseTypes);
  const typeOverlay = useCatalogStore((s) => s.typeOverlay);
  const baseCableGroups = useCatalogStore((s) => s.baseCableGroups);
  const cgOverlay = useCatalogStore((s) => s.cgOverlay);
  const baseCableCategories = useCatalogStore((s) => s.baseCableCategories);
  const ccOverlay = useCatalogStore((s) => s.ccOverlay);
  const selectedAsset = useCatalogStore((s) => s.selectedAsset);
  const selectedCable = useCatalogStore((s) => s.selectedCable);

  // effective 파생 — 원시 슬라이스 변경 시에만 재계산
  const categories = useMemo(
    () => useCatalogStore.getState().effectiveCategories(),
    [baseCategories, catOverlay],
  );
  const types = useMemo(
    () => useCatalogStore.getState().effectiveTypes(),
    [baseTypes, typeOverlay],
  );
  const cableGroups = useMemo(
    () => useCatalogStore.getState().effectiveCableGroups(),
    [baseCableGroups, cgOverlay],
  );
  const cableCategories = useMemo(
    () => useCatalogStore.getState().effectiveCableCategories(),
    [baseCableCategories, ccOverlay],
  );

  // ── 설비 그룹·아이템 파생 ─────────────────────────────────────────────────────
  // categoryId=null 종류가 하나라도 있으면 미분류 sentinel 추가
  const assetGroups = useMemo(() => [
    ...categories.map((c) => ({ id: c.id, name: c.name })),
    ...(types.some((t) => t.categoryId === null) ? [{ id: '__none__', name: '미분류' }] : []),
  ], [categories, types]);

  const assetItems = useMemo(() => types.map((t) => ({
    id: t.id,
    parentId: t.categoryId ?? '__none__',
    name: t.name,
    system: t.role !== 'device',
  })), [types]);

  // ── 케이블 그룹·아이템 파생 ───────────────────────────────────────────────────
  const cableListGroups = useMemo(() => cableGroups.map((g) => ({
    id: g.id,
    name: g.name,
    accent: g.color,
  })), [cableGroups]);

  const cableListItems = useMemo(() => cableCategories.map((c) => ({
    id: c.id,
    parentId: c.groupId,
    name: c.name,
  })), [cableCategories]);

  useEffect(() => {
    load();
    return () => discard(); // 화면 이탈 시 미저장 스테이징 폐기
  }, [load, discard]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const store = useCatalogStore.getState;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 세그먼트 컨트롤 (탭바 대체) */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-line">
        {(['asset', 'cable'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeg(s)}
            className={`px-3 py-1 text-sm rounded ${
              seg === s
                ? 'bg-info-bg text-primary font-medium'
                : 'text-content hover:bg-surface-2'
            }`}
          >
            {s === 'asset' ? '설비' : '케이블'}
          </button>
        ))}
      </div>

      {/* 2-pane 본문 */}
      <div className="flex-1 min-h-0 flex">
        {seg === 'asset' ? (
          <>
            <CatalogListPane
              groups={assetGroups}
              items={assetItems}
              selectedId={selectedAsset?.id ?? null}
              onSelect={(kind, id) => {
                // 미분류 sentinel(__none__)은 실제 카테고리가 아니므로 선택 해제
                if (kind === 'group' && id === '__none__') {
                  store().selectAsset(null);
                } else {
                  store().selectAsset({ kind: kind === 'group' ? 'category' : 'type', id });
                }
              }}
              onAddGroup={() =>
                store().stageCreateCategory({ id: newCatalogId(), name: '새 분류', sortOrder: 0 })
              }
              onAddItem={(cid) =>
                store().stageCreateType({
                  id: newCatalogId(),
                  name: '새 종류',
                  role: 'device',
                  categoryId: cid === '__none__' ? null : cid,
                  sortOrder: 0,
                  laborType: null,
                  installHoursPerUnit: null,
                  removeHoursPerUnit: null,
                  relocateHoursPerUnit: null,
                })
              }
              addGroupLabel="+ 분류"
              addItemLabel="+ 종류"
              onReorder={(kind, _parentId, orderedIds) => {
                if (kind === 'group') {
                  // sentinel(__none__)은 정렬 대상 아님
                  orderedIds.forEach((id, i) => {
                    if (id !== '__none__') store().stageUpdateCategory(id, { sortOrder: i });
                  });
                } else if (_parentId !== '__none__') {
                  orderedIds.forEach((id, i) => store().stageUpdateType(id, { sortOrder: i }));
                }
              }}
            />
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <CatalogDetailPane segment="asset" />
            </div>
          </>
        ) : (
          <>
            <CatalogListPane
              groups={cableListGroups}
              items={cableListItems}
              selectedId={selectedCable?.id ?? null}
              onSelect={(kind, id) =>
                store().selectCable({ kind: kind === 'group' ? 'group' : 'category', id })
              }
              onAddGroup={() =>
                store().stageCreateCableGroup({
                  id: newCatalogId(),
                  name: '새 그룹',
                  sortOrder: 0,
                  color: null,
                  laborType: null,
                  installHoursPerMeter: null,
                  removeHoursPerMeter: null,
                  relocateHoursPerMeter: null,
                })
              }
              onAddItem={(gid) =>
                store().stageCreateCableCategory({
                  id: newCatalogId(),
                  name: '새 종류',
                  groupId: gid,
                  sortOrder: 0,
                  groupName: null,
                  groupColor: null,
                })
              }
              addGroupLabel="+ 그룹"
              addItemLabel="+ 종류"
              onReorder={(kind, _parentId, orderedIds) => {
                if (kind === 'group') {
                  orderedIds.forEach((id, i) =>
                    store().stageUpdateCableGroup(id, { sortOrder: i }),
                  );
                } else {
                  orderedIds.forEach((id, i) =>
                    store().stageUpdateCableCategory(id, { sortOrder: i }),
                  );
                }
              }}
            />
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <CatalogDetailPane segment="cable" />
            </div>
          </>
        )}
      </div>

      <CatalogSaveBar />
    </div>
  );
}
