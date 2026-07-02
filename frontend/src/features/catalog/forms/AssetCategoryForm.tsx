import { useMemo } from 'react';
import { useCatalogStore } from '../catalogStore';
import { DetailCard, DetailCardHeader, DetailRow } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';

/**
 * 설비분류 상세 폼 — 선택된 AssetCategory 를 표시/편집.
 * 삭제 가드: 이 분류를 사용하는 종류 수가 0 일 때만 삭제 버튼 노출.
 */
export function AssetCategoryForm({ id }: { id: string }) {
  const baseCategories = useCatalogStore((s) => s.baseCategories);
  const catOverlay = useCatalogStore((s) => s.catOverlay);
  const baseTypes = useCatalogStore((s) => s.baseTypes);
  const typeOverlay = useCatalogStore((s) => s.typeOverlay);

  const category = useMemo(
    () => useCatalogStore.getState().effectiveCategories().find((c) => c.id === id),
    [baseCategories, catOverlay, id],
  );

  const typeCount = useMemo(
    () => useCatalogStore.getState().effectiveTypes().filter((t) => t.categoryId === id).length,
    [baseTypes, typeOverlay, id],
  );

  const store = useCatalogStore.getState;
  const isNew = () => !!useCatalogStore.getState().catOverlay.creates[id];

  if (!category) return null;

  return (
    <DetailCard>
      <DetailCardHeader
        title={
          <EditableField
            value={category.name}
            ariaLabel="분류명"
            valueClickEdits
            onCommit={(v) => v.trim() && store().stageUpdateCategory(id, { name: v.trim() })}
          />
        }
        onDelete={typeCount === 0 ? () => store().stageDeleteCategory(id, isNew()) : undefined}
      />
      <DetailRow label="사용 종류">{typeCount}개</DetailRow>
    </DetailCard>
  );
}
