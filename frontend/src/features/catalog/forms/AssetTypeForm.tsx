import { useMemo } from 'react';
import { useCatalogStore } from '../catalogStore';
import { DetailCard, DetailCardHeader, Badge } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';
import { FormRow, fieldClass } from '../../assets/components/detail/SectionShell';

/**
 * 설비종류 상세 폼 — 선택된 AssetType 을 표시/편집.
 * 삭제 가드: role === 'device' 일 때만 삭제 버튼 노출(사용 중이면 서버가 막음).
 */
export function AssetTypeForm({ id }: { id: string }) {
  const baseTypes = useCatalogStore((s) => s.baseTypes);
  const typeOverlay = useCatalogStore((s) => s.typeOverlay);
  const baseCategories = useCatalogStore((s) => s.baseCategories);
  const catOverlay = useCatalogStore((s) => s.catOverlay);

  const assetType = useMemo(
    () => useCatalogStore.getState().effectiveTypes().find((t) => t.id === id),
    [baseTypes, typeOverlay, id],
  );

  const categories = useMemo(
    () => useCatalogStore.getState().effectiveCategories(),
    [baseCategories, catOverlay],
  );

  const store = useCatalogStore.getState;
  const isNew = () => !!useCatalogStore.getState().typeOverlay.creates[id];

  if (!assetType) return null;

  const catOptions = [
    { value: '', label: '— 미분류 —' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const canDelete = assetType.role === 'device';

  return (
    <DetailCard>
      <DetailCardHeader
        title={
          <EditableField
            value={assetType.name}
            ariaLabel="종류명"
            valueClickEdits
            onCommit={(v) => v.trim() && store().stageUpdateType(id, { name: v.trim() })}
          />
        }
        onDelete={canDelete ? () => store().stageDeleteType(id, isNew()) : undefined}
      />

      {/* 분류 Select */}
      <FormRow label="분류">
        <EditableField
          value={assetType.categoryId ?? ''}
          type="select"
          ariaLabel="분류"
          options={catOptions}
          valueClickEdits
          display={(v) => catOptions.find((o) => o.value === v)?.label ?? '— 미분류 —'}
          onCommit={(v) => store().stageUpdateType(id, { categoryId: v || null })}
        />
      </FormRow>

      {/* role 읽기전용 배지 */}
      <FormRow label="역할">
        <Badge>{assetType.role}</Badge>
      </FormRow>

      {/* 노무규칙 — 개당 */}
      <FormRow label="설치">
        <input
          type="number"
          aria-label="설치(개당)"
          className={fieldClass}
          placeholder="0.000"
          step="0.001"
          value={assetType.installHoursPerUnit ?? ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) store().stageUpdateType(id, { installHoursPerUnit: n });
          }}
        />
      </FormRow>
      <FormRow label="철거">
        <input
          type="number"
          aria-label="철거(개당)"
          className={fieldClass}
          placeholder="0.000"
          step="0.001"
          value={assetType.removeHoursPerUnit ?? ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) store().stageUpdateType(id, { removeHoursPerUnit: n });
          }}
        />
      </FormRow>
      <FormRow label="이설">
        <input
          type="number"
          aria-label="이설(개당)"
          className={fieldClass}
          placeholder="0.000"
          step="0.001"
          value={assetType.relocateHoursPerUnit ?? ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) store().stageUpdateType(id, { relocateHoursPerUnit: n });
          }}
        />
      </FormRow>
      <FormRow label="노무">
        <EditableField
          value={assetType.laborType ?? ''}
          type="text"
          ariaLabel="노무종류"
          placeholder="예: 통신내선공"
          onCommit={(v) => v.trim() && store().stageUpdateType(id, { laborType: v.trim() })}
        />
      </FormRow>
    </DetailCard>
  );
}
