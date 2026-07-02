import { useMemo } from 'react';
import { useCatalogStore } from '../catalogStore';
import { DetailCard, DetailCardHeader } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';
import { FormRow } from '../../assets/components/detail/SectionShell';

/**
 * 케이블종류 상세 폼 — 선택된 CableCategory 를 표시/편집.
 * 삭제 가드: 없음(항상 삭제 가능 — 사용 중이면 서버가 막음).
 */
export function CableCategoryForm({ id }: { id: string }) {
  const baseCableCategories = useCatalogStore((s) => s.baseCableCategories);
  const ccOverlay = useCatalogStore((s) => s.ccOverlay);
  const baseCableGroups = useCatalogStore((s) => s.baseCableGroups);
  const cgOverlay = useCatalogStore((s) => s.cgOverlay);

  const cableCategory = useMemo(
    () => useCatalogStore.getState().effectiveCableCategories().find((c) => c.id === id),
    [baseCableCategories, ccOverlay, id],
  );

  const groups = useMemo(
    () => useCatalogStore.getState().effectiveCableGroups(),
    [baseCableGroups, cgOverlay],
  );

  const store = useCatalogStore.getState;
  const isNew = () => !!useCatalogStore.getState().ccOverlay.creates[id];

  if (!cableCategory) return null;

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }));

  return (
    <DetailCard>
      <DetailCardHeader
        title={
          <EditableField
            value={cableCategory.name}
            ariaLabel="종류명"
            valueClickEdits
            onCommit={(v) => v.trim() && store().stageUpdateCableCategory(id, { name: v.trim() })}
          />
        }
        onDelete={() => {
          store().stageDeleteCableCategory(id, isNew());
          store().selectCable(null);
        }}
      />

      {/* 그룹 Select */}
      <FormRow label="그룹">
        <EditableField
          value={cableCategory.groupId ?? ''}
          type="select"
          ariaLabel="그룹"
          options={groupOptions}
          valueClickEdits
          display={(v) => groupOptions.find((o) => o.value === v)?.label ?? '—'}
          onCommit={(v) => v && store().stageUpdateCableCategory(id, { groupId: v })}
        />
      </FormRow>
    </DetailCard>
  );
}
