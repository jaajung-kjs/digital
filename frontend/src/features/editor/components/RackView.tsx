import { useState, useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useRackModuleCategories } from '../../rack/hooks/useRackModuleCategories';
import { generateTempId } from '../../../utils/idHelpers';
import type { RackModule } from '../../../types/rackModule';

interface RackViewProps {
  equipmentId: string;  // the EQP-RACK equipment ID (can be temp ID)
}

/**
 * P9: RackView for the detail-panel "내부 설비" tab.
 *
 * Renders the U-slot grid + module list backed by `localRackModules`. Slot
 * clicks open the central RackModuleDialog (set on the editor store via
 * `selectedRackModuleId`), so this component never owns its own modal.
 */
export function RackView({ equipmentId }: RackViewProps) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localRackModules = useEditorStore((s) => s.localRackModules);
  const setSelectedRackModuleId = useEditorStore((s) => s.setSelectedRackModuleId);
  const addRackModule = useEditorStore((s) => s.addRackModule);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const rackEquipment = useMemo(
    () => localEquipment.find((e) => e.id === equipmentId),
    [localEquipment, equipmentId]
  );
  const modules = useMemo(
    () =>
      localRackModules
        .filter((m) => m.rackEquipmentId === equipmentId)
        .sort((a, b) => a.startU - b.startU),
    [localRackModules, equipmentId],
  );

  const [showAddForm, setShowAddForm] = useState(false);

  const totalU = rackEquipment?.totalU ?? 42;

  const usedU = useMemo(() => modules.reduce((sum, m) => sum + m.heightU, 0), [modules]);
  const usagePercent = totalU > 0 ? Math.round((usedU / totalU) * 100) : 0;

  const slotMap = useMemo(() => {
    const map = new Map<number, RackModule>();
    for (const m of modules) {
      for (let u = m.startU; u < m.startU + m.heightU; u++) {
        map.set(u, m);
      }
    }
    return map;
  }, [modules]);

  if (!rackEquipment) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">랙 장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const handleSlotClick = (mod: RackModule) => {
    setSelectedRackModuleId(mod.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* U-slot + module list body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: U-slot visualization */}
        <div className="w-[200px] border-r overflow-y-auto p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">전면 뷰</div>
          <div className="border border-gray-300 rounded">
            {Array.from({ length: totalU }, (_, i) => {
              const uNumber = totalU - i;
              const mod = slotMap.get(uNumber);
              if (mod) {
                if (uNumber === mod.startU + mod.heightU - 1) {
                  const color = mod.categoryDisplayColor ?? '#95A5A6';
                  return (
                    <div
                      key={uNumber}
                      className="flex cursor-pointer hover:brightness-110 transition-all"
                      style={{ height: `${mod.heightU * 20}px` }}
                      onClick={() => handleSlotClick(mod)}
                      title={`${mod.name} (${mod.startU}-${mod.startU + mod.heightU - 1}U)`}
                    >
                      <div className="w-8 flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-200 bg-gray-50 shrink-0">
                        {uNumber}U
                      </div>
                      <div
                        className="flex-1 flex items-center justify-center text-xs font-medium text-white border-b border-gray-200 px-1"
                        style={{ backgroundColor: color }}
                      >
                        <span className="truncate">{mod.name}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }

              return (
                <div key={uNumber} className="flex" style={{ height: '20px' }}>
                  <div className="w-8 flex items-center justify-center text-[10px] text-gray-400 border-r border-gray-200 bg-gray-50 shrink-0">
                    {uNumber}U
                  </div>
                  <div className="flex-1 border-b border-gray-100" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: module list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">
            모듈 ({modules.length}개)
          </div>

          {modules.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">모듈이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {modules.map((m) => (
                <button
                  key={m.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors"
                  onClick={() => handleSlotClick(m)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: m.categoryDisplayColor ?? '#95A5A6' }}
                    />
                    <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 ml-4">
                    {m.startU}-{m.startU + m.heightU - 1}U
                    {m.categoryName && ` | ${m.categoryName}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3 bg-gray-50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            사용: {usedU}/{totalU}U ({usagePercent}%)
          </span>
          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${usagePercent}%`,
                backgroundColor: usagePercent > 80 ? '#ef4444' : usagePercent > 50 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          모듈 추가
        </button>
      </div>

      {showAddForm && (
        <RackModuleAddDialog
          rackEquipmentId={equipmentId}
          totalU={totalU}
          occupiedSlots={slotMap}
          onCancel={() => setShowAddForm(false)}
          onAdd={(input) => {
            addRackModule(input);
            setHasChanges(true);
            setShowAddForm(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * P9: lightweight dialog used by "모듈 추가" button. Not the main edit dialog
 * (RackModuleDialog handles edits) — this only collects the minimum fields
 * needed to add a new module.
 */
function RackModuleAddDialog({
  rackEquipmentId,
  totalU,
  occupiedSlots,
  onCancel,
  onAdd,
}: {
  rackEquipmentId: string;
  totalU: number;
  occupiedSlots: Map<number, RackModule>;
  onCancel: () => void;
  onAdd: (m: RackModule) => void;
}) {
  const { data: categories } = useRackModuleCategories();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [heightU, setHeightU] = useState(1);
  const [startU, setStartU] = useState<number | null>(null);

  const availablePositions = useMemo(() => {
    const positions: number[] = [];
    for (let u = 1; u <= totalU - heightU + 1; u++) {
      let canFit = true;
      for (let offset = 0; offset < heightU; offset++) {
        if (occupiedSlots.has(u + offset)) {
          canFit = false;
          break;
        }
      }
      if (canFit) positions.push(u);
    }
    return positions;
  }, [totalU, heightU, occupiedSlots]);

  const effectiveStartU =
    startU != null && availablePositions.includes(startU)
      ? startU
      : availablePositions[0] ?? null;

  const selectedCat = (categories ?? []).find((c) => c.id === categoryId);

  const handleSubmit = () => {
    if (!name.trim() || !selectedCat || effectiveStartU == null) return;
    const now = new Date().toISOString();
    onAdd({
      id: generateTempId(),
      rackEquipmentId,
      categoryId: selectedCat.id,
      categoryCode: selectedCat.code,
      categoryName: selectedCat.name,
      categoryDisplayColor: selectedCat.displayColor,
      name: name.trim(),
      startU: effectiveStartU,
      heightU,
      installDate: null,
      manager: null,
      description: null,
      properties: null,
      sortOrder: effectiveStartU,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">모듈 추가</h3>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: SW-01"
            autoFocus
          />
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">카테고리 선택</option>
            {(categories ?? [])
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">크기 (U)</label>
            <input
              type="number"
              min={1}
              max={totalU}
              value={heightU}
              onChange={(e) => {
                const val = Math.max(1, Math.min(totalU, parseInt(e.target.value, 10) || 1));
                setHeightU(val);
                setStartU(null);
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              시작 U
              <span className="text-gray-400 font-normal ml-1">
                ({availablePositions.length}개 가능)
              </span>
            </label>
            {availablePositions.length === 0 ? (
              <p className="text-sm text-red-500">빈 슬롯이 없습니다</p>
            ) : (
              <select
                value={effectiveStartU ?? ''}
                onChange={(e) => setStartU(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {availablePositions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}U ~ {pos + heightU - 1}U
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !categoryId || effectiveStartU == null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
