import { useMemo } from 'react';
import { useCatalogStore } from '../catalogStore';
import { DetailCard, DetailCardHeader, Badge } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';
import { FormRow } from '../../assets/components/detail/SectionShell';
import { HoursInput } from './HoursInput';

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
        onDelete={
          canDelete
            ? () => {
                store().stageDeleteType(id, isNew());
                store().selectAsset(null);
              }
            : undefined
        }
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

      {/* role 읽기전용 배지 — 시스템 종류만 배지 표시, 일반(device)은 — */}
      <FormRow label="역할">
        {assetType.role !== 'device' ? (
          <Badge>시스템</Badge>
        ) : (
          <span className="text-xs text-content-faint">—</span>
        )}
      </FormRow>

      {/* 노무규칙 — 개당 */}
      <HoursInput
        label="설치(개당)"
        ariaLabel="설치(개당)"
        value={assetType.installHoursPerUnit}
        onCommit={(n) => store().stageUpdateType(id, { installHoursPerUnit: n })}
      />
      <HoursInput
        label="철거(개당)"
        ariaLabel="철거(개당)"
        value={assetType.removeHoursPerUnit}
        onCommit={(n) => store().stageUpdateType(id, { removeHoursPerUnit: n })}
      />
      <HoursInput
        label="이설(개당)"
        ariaLabel="이설(개당)"
        value={assetType.relocateHoursPerUnit}
        onCommit={(n) => store().stageUpdateType(id, { relocateHoursPerUnit: n })}
      />
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
