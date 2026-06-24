import { useMemo } from 'react';
import { useCatalogStore, newCatalogId } from './catalogStore';
import type { CableCategory } from '../../types/cableCategory';
import { DetailCard, DetailCardHeader, Button } from '../../components/ui';
import { EditableField } from '../assets/components/EditableField';

/**
 * 케이블종류 탭 — 그룹(이름+색) → 케이블 종류(이름) 2단. 모두 사용자 정의.
 * 편집은 catalogStore 스테이징(저장 누를 때 원자 commit). 시스템 role 없음(전부 자유).
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
  const isNewGroup = (id: string) => !!useCatalogStore.getState().cgOverlay.creates[id];

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }));

  const addGroup = () => store().stageCreateCableGroup({ id: newCatalogId(), name: '새 그룹', color: '#6b7280', sortOrder: 0, isActive: true, kind: null, laborType: null, installHoursPerMeter: null, removeHoursPerMeter: null, relocateHoursPerMeter: null });
  const addCat = (groupId: string) => store().stageCreateCableCategory({
    id: newCatalogId(), name: '새 종류', groupId, code: '', description: null, displayColor: null,
    displayGroup: null, groupName: null, groupColor: null, iconName: null, unit: null, specTemplate: null, sortOrder: 0, isActive: true,
  } as CableCategory);

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h2 className="text-sm font-bold text-content">케이블 종류</h2>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={addGroup}>+ 그룹</Button>
      </div>

      {groups.map((g) => {
        const inGroup = cats.filter((c) => c.groupId === g.id);
        const empty = inGroup.length === 0;
        const color = g.color ?? '#6b7280';
        return (
          <DetailCard key={g.id}>
            <DetailCardHeader
              title={
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="그룹 색"
                    value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6b7280'}
                    onChange={(e) => store().stageUpdateCableGroup(g.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer border border-line"
                  />
                  <EditableField
                    value={g.name}
                    ariaLabel="그룹명"
                    valueClickEdits
                    onCommit={(v) => v.trim() && store().stageUpdateCableGroup(g.id, { name: v.trim() })}
                  />
                </span>
              }
              onDelete={empty ? () => store().stageDeleteCableGroup(g.id, isNewGroup(g.id)) : undefined}
            />
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
