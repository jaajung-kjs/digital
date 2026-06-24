import { useMemo } from 'react';
import { useCatalogStore, newCatalogId } from './catalogStore';
import type { CableCategory } from '../../types/cableCategory';
import { DetailCard, DetailCardHeader, Button } from '../../components/ui';
import { EditableField } from '../assets/components/EditableField';
import { FormRow, fieldClass } from '../assets/components/detail/SectionShell';

/**
 * 케이블종류 탭 — 고정 5분류(읽기전용 헤더+색 스와치) + 분류별 노무규칙 편집
 * + 분류 아래 케이블 이름(CableCategory) CRUD.
 * 그룹 추가/삭제/색 편집은 없음(고정 5분류).
 */
export function CableTypesTab() {
  const baseGroups = useCatalogStore((s) => s.baseCableGroups);
  const cgOverlay = useCatalogStore((s) => s.cgOverlay);
  const baseCats = useCatalogStore((s) => s.baseCableCategories);
  const ccOverlay = useCatalogStore((s) => s.ccOverlay);

  const groups = useMemo(() => useCatalogStore.getState().effectiveCableGroups(), [baseGroups, cgOverlay]);
  const cats = useMemo(() => useCatalogStore.getState().effectiveCableCategories(), [baseCats, ccOverlay]);

  const store = useCatalogStore.getState;
  const isNewCat = (id: string) => !!useCatalogStore.getState().ccOverlay.creates[id];

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }));

  const addCat = (groupId: string) => store().stageCreateCableCategory({
    id: newCatalogId(), name: '새 종류', groupId, code: '', description: null, displayColor: null,
    displayGroup: null, groupName: null, groupColor: null, iconName: null, unit: null, specTemplate: null, sortOrder: 0, isActive: true,
  } as CableCategory);

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h2 className="text-sm font-bold text-content">케이블 종류</h2>
      </div>

      {groups.map((g) => {
        const inGroup = cats.filter((c) => c.groupId === g.id);
        const color = g.color ?? '#6b7280';
        return (
          <DetailCard key={g.id}>
            <DetailCardHeader
              title={
                <span className="flex items-center gap-2">
                  {/* 읽기전용 색 스와치 */}
                  <div
                    data-color-swatch
                    style={{ backgroundColor: color }}
                    className="w-5 h-5 rounded border border-line shrink-0"
                  />
                  <span className="text-sm font-semibold text-content">{g.name}</span>
                </span>
              }
            />
            {/* 노무규칙 편집 */}
            <div className="px-1 py-1 space-y-1">
              <FormRow label="설치">
                <input
                  type="number"
                  aria-label="설치(m당)"
                  className={fieldClass}
                  placeholder="0.000"
                  step="0.001"
                  value={g.installHoursPerMeter ?? ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) store().stageUpdateCableGroup(g.id, { installHoursPerMeter: n });
                  }}
                />
              </FormRow>
              <FormRow label="철거">
                <input
                  type="number"
                  aria-label="철거(m당)"
                  className={fieldClass}
                  placeholder="0.000"
                  step="0.001"
                  value={g.removeHoursPerMeter ?? ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) store().stageUpdateCableGroup(g.id, { removeHoursPerMeter: n });
                  }}
                />
              </FormRow>
              <FormRow label="노무">
                <EditableField
                  value={g.laborType ?? ''}
                  type="text"
                  ariaLabel="노무종류"
                  placeholder="예: 통신내선공"
                  onCommit={(v) => v.trim() && store().stageUpdateCableGroup(g.id, { laborType: v.trim() })}
                />
              </FormRow>
            </div>
            {/* 케이블 이름(CableCategory) CRUD */}
            <div className="space-y-1">
              {inGroup.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-1 py-0.5">
                  <div className="flex-1 min-w-0">
                    <EditableField
                      value={c.name}
                      ariaLabel="종류명"
                      valueClickEdits
                      onCommit={(v) => v.trim() && store().stageUpdateCableCategory(c.id, { name: v.trim() })}
                    />
                  </div>
                  <div className="w-28">
                    <EditableField
                      value={c.groupId ?? ''}
                      type="select"
                      ariaLabel="그룹"
                      options={groupOptions}
                      valueClickEdits
                      display={(v) => groupOptions.find((o) => o.value === v)?.label ?? '—'}
                      onCommit={(v) => v && store().stageUpdateCableCategory(c.id, { groupId: v })}
                    />
                  </div>
                  <button
                    type="button"
                    className="px-1 text-xs text-danger hover:opacity-80"
                    onClick={() => store().stageDeleteCableCategory(c.id, isNewCat(c.id))}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => addCat(g.id)}>+ 종류</Button>
            </div>
          </DetailCard>
        );
      })}
    </div>
  );
}
