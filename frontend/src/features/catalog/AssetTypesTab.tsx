import { useMemo } from 'react';
import { useCatalogStore, newCatalogId } from './catalogStore';
import type { AssetType } from '../../types/asset';
import { DetailCard, DetailCardHeader, Badge, Button } from '../../components/ui';
import { EditableField } from '../assets/components/EditableField';

/**
 * 설비종류 탭 — 분류(AssetCategory) → 종류(AssetType) 2단. 모든 편집은 catalogStore 스테이징
 * (저장 누를 때 원자 commit). role 보유 종류(시스템)는 이름만 수정·삭제불가.
 */
export function AssetTypesTab() {
  const baseTypes = useCatalogStore((s) => s.baseTypes);
  const typeOverlay = useCatalogStore((s) => s.typeOverlay);
  const baseCategories = useCatalogStore((s) => s.baseCategories);
  const catOverlay = useCatalogStore((s) => s.catOverlay);

  const types = useMemo(() => useCatalogStore.getState().effectiveTypes(), [baseTypes, typeOverlay]);
  const categories = useMemo(() => useCatalogStore.getState().effectiveCategories(), [baseCategories, catOverlay]);

  const store = useCatalogStore.getState;
  const isNewType = (id: string) => !!useCatalogStore.getState().typeOverlay.creates[id];
  const isNewCat = (id: string) => !!useCatalogStore.getState().catOverlay.creates[id];

  const catOptions = [
    { value: '', label: '— 미분류 —' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  // 분류별 그룹 + 미분류
  const groups: { id: string | null; name: string }[] = [
    ...categories.map((c) => ({ id: c.id as string | null, name: c.name })),
    { id: null, name: '미분류' },
  ];

  const addCategory = () => store().stageCreateCategory({ id: newCatalogId(), name: '새 분류', sortOrder: 0, isActive: true });
  const addType = (categoryId: string | null) =>
    store().stageCreateType({
      id: newCatalogId(), code: '', name: '새 종류', group: null, role: 'device', categoryId,
      isContainer: false, fieldTemplate: null, requiredToCreate: null, iconName: null,
      displayColor: null, placementKind: null, connectionKind: null, sortOrder: 0, isActive: true,
    } as AssetType);

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h2 className="text-sm font-bold text-content">설비 종류</h2>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={addCategory}>+ 분류</Button>
      </div>

      {groups.map((g) => {
        const inGroup = types.filter((t) => (t.categoryId ?? null) === g.id);
        const empty = inGroup.length === 0;
        return (
          <DetailCard key={g.id ?? '__none__'}>
            <DetailCardHeader
              title={
                g.id ? (
                  <EditableField
                    value={g.name}
                    ariaLabel="분류명"
                    valueClickEdits
                    onCommit={(v) => v.trim() && store().stageUpdateCategory(g.id!, { name: v.trim() })}
                  />
                ) : '미분류'
              }
              onDelete={g.id && empty ? () => store().stageDeleteCategory(g.id!, isNewCat(g.id!)) : undefined}
            />
            <div className="space-y-1">
              {inGroup.map((t) => {
                const system = t.role !== 'device';
                return (
                  <div key={t.id} className="flex items-center gap-2 px-1 py-0.5">
                    <div className="flex-1 min-w-0">
                      <EditableField
                        value={t.name}
                        ariaLabel="종류명"
                        valueClickEdits
                        onCommit={(v) => v.trim() && store().stageUpdateType(t.id, { name: v.trim() })}
                      />
                    </div>
                    {system ? (
                      <Badge>시스템</Badge>
                    ) : (
                      <>
                        <div className="w-28">
                          <EditableField
                            value={t.categoryId ?? ''}
                            type="select"
                            ariaLabel="분류"
                            options={catOptions}
                            valueClickEdits
                            display={(v) => catOptions.find((o) => o.value === v)?.label ?? '— 미분류 —'}
                            onCommit={(v) => store().stageUpdateType(t.id, { categoryId: v || null })}
                          />
                        </div>
                        <button
                          type="button"
                          className="px-1 text-xs text-danger hover:opacity-80"
                          onClick={() => store().stageDeleteType(t.id, isNewType(t.id))}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              <Button variant="secondary" size="sm" onClick={() => addType(g.id)}>+ 종류</Button>
            </div>
          </DetailCard>
        );
      })}
    </div>
  );
}
