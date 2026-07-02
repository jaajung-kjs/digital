import { useMemo } from 'react';
import { useCatalogStore } from '../catalogStore';
import { DetailCard, DetailCardHeader } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';
import { FormRow } from '../../assets/components/detail/SectionShell';
import { HoursInput } from './HoursInput';

/**
 * 케이블그룹 상세 폼 — 선택된 CableGroup 을 표시/편집.
 * 색: native <input type="color"> + 스와치(기존 CableInspector ColorField 선례 — CONVENTIONS 예외 허용).
 * 삭제 가드: 이 그룹을 사용하는 케이블종류 수가 0 일 때만 삭제 버튼 노출.
 */
export function CableGroupForm({ id }: { id: string }) {
  const baseCableGroups = useCatalogStore((s) => s.baseCableGroups);
  const cgOverlay = useCatalogStore((s) => s.cgOverlay);
  const baseCableCategories = useCatalogStore((s) => s.baseCableCategories);
  const ccOverlay = useCatalogStore((s) => s.ccOverlay);

  const cableGroup = useMemo(
    () => useCatalogStore.getState().effectiveCableGroups().find((g) => g.id === id),
    [baseCableGroups, cgOverlay, id],
  );

  const catCount = useMemo(
    () => useCatalogStore.getState().effectiveCableCategories().filter((c) => c.groupId === id).length,
    [baseCableCategories, ccOverlay, id],
  );

  const store = useCatalogStore.getState;
  const isNew = () => !!useCatalogStore.getState().cgOverlay.creates[id];

  if (!cableGroup) return null;

  const color = cableGroup.color ?? '#6b7280';

  return (
    <DetailCard>
      <DetailCardHeader
        title={
          <EditableField
            value={cableGroup.name}
            ariaLabel="그룹명"
            valueClickEdits
            onCommit={(v) => v.trim() && store().stageUpdateCableGroup(id, { name: v.trim() })}
          />
        }
        onDelete={
          catCount === 0
            ? () => {
                store().stageDeleteCableGroup(id, isNew());
                store().selectCable(null);
              }
            : undefined
        }
      />

      {/* 색 편집 — native color picker + 스와치 */}
      <FormRow label="색">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded border border-line shrink-0"
            style={{ backgroundColor: color }}
          />
          <input
            type="color"
            aria-label="그룹 색"
            value={color}
            className="w-8 h-6 cursor-pointer rounded border border-line bg-surface p-0"
            onChange={(e) => store().stageUpdateCableGroup(id, { color: e.target.value })}
          />
        </div>
      </FormRow>

      {/* 노무규칙 — 미터당 */}
      <HoursInput
        label="설치(m당)"
        ariaLabel="설치(m당)"
        value={cableGroup.installHoursPerMeter}
        onCommit={(n) => store().stageUpdateCableGroup(id, { installHoursPerMeter: n })}
      />
      <HoursInput
        label="철거(m당)"
        ariaLabel="철거(m당)"
        value={cableGroup.removeHoursPerMeter}
        onCommit={(n) => store().stageUpdateCableGroup(id, { removeHoursPerMeter: n })}
      />
      <HoursInput
        label="이설(m당)"
        ariaLabel="이설(m당)"
        value={cableGroup.relocateHoursPerMeter}
        onCommit={(n) => store().stageUpdateCableGroup(id, { relocateHoursPerMeter: n })}
      />
      <FormRow label="노무">
        <EditableField
          value={cableGroup.laborType ?? ''}
          type="text"
          ariaLabel="노무종류"
          placeholder="예: 통신내선공"
          onCommit={(v) => v.trim() && store().stageUpdateCableGroup(id, { laborType: v.trim() })}
        />
      </FormRow>
    </DetailCard>
  );
}
