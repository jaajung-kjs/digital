import { useMemo, useState } from 'react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useRackPresets } from '../hooks/useRackPresets';
import { useRackModuleCategories } from '../hooks/useRackModuleCategories';
import { useIsAdmin } from '../../../stores/authStore';
import { generateTempId } from '../../../utils/idHelpers';
import type { RackPreset } from '../../../types/rackPreset';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import { SaveRackAsPresetDialog } from './SaveRackAsPresetDialog';

interface PresetActionsBarProps {
  rackEquipmentId: string;
}

/**
 * P10: action row injected at the top of the rack detail "내부 설비" tab.
 *
 *  ┌──────────────────────────────────────────────────┐
 *  │ [프리셋 적용 ▾]  [프리셋으로 저장]                  │
 *  └──────────────────────────────────────────────────┘
 *
 * - "프리셋 적용": replaces the rack's working modules with the chosen preset
 *    (also bumps `totalU` so the slot grid resizes immediately).
 * - "프리셋으로 저장": opens SaveRackAsPresetDialog which snapshots the
 *    current working copy into a brand-new RackPreset row.
 *
 * Note: writes ALL go through `useEditorStore` mutators, so the action only
 * touches the working copy — nothing is persisted until the user saves the
 * floor plan. The "프리셋으로 저장" path is the one exception: it POSTs a
 * new preset definition immediately (admin-only on the backend).
 */
export function PresetActionsBar({ rackEquipmentId }: PresetActionsBarProps) {
  const { data: presets } = useRackPresets();
  const { data: categories } = useRackModuleCategories();
  const isAdmin = useIsAdmin();
  const localEquipment = useEditorStore((s) => s.localEquipment);

  const [pendingPreset, setPendingPreset] = useState<RackPreset | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const activePresets = useMemo(
    () => (presets ?? []).filter((p) => p.isActive),
    [presets],
  );

  const rackEquipment = useMemo(
    () => localEquipment.find((e) => e.id === rackEquipmentId),
    [localEquipment, rackEquipmentId],
  );

  if (!rackEquipment) return null;

  const handlePickPreset = (preset: RackPreset) => {
    setDropdownOpen(false);
    setPendingPreset(preset);
  };

  const handleConfirmApply = () => {
    if (!pendingPreset) return;
    applyPresetToRack(rackEquipmentId, pendingPreset, categories ?? []);
    setPendingPreset(null);
  };

  return (
    <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
      {/* 프리셋 적용 ▾ */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
        >
          프리셋 적용
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
              dropdownOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {dropdownOpen && (
          <>
            {/* click-outside backdrop */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-40">
              {activePresets.length === 0 ? (
                <div className="px-3 py-3 text-xs text-gray-400">
                  사용 가능한 프리셋이 없습니다.
                </div>
              ) : (
                activePresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePickPreset(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.totalU}U · 모듈 {p.modules.length}개
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* 프리셋으로 저장 */}
      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        disabled={!isAdmin}
        title={
          isAdmin
            ? '현재 랙 구성을 새 프리셋으로 저장합니다.'
            : '관리자만 프리셋을 생성할 수 있습니다.'
        }
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        프리셋으로 저장
      </button>

      {/* 적용 confirmation modal */}
      {pendingPreset && (
        <ApplyPresetConfirmDialog
          preset={pendingPreset}
          onCancel={() => setPendingPreset(null)}
          onConfirm={handleConfirmApply}
        />
      )}

      {/* 저장 dialog */}
      {saveOpen && (
        <SaveRackAsPresetDialog
          rackEquipmentId={rackEquipmentId}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Apply preset to working copy
// ============================================================

/**
 * P10: replace the current rack's working modules with `preset.modules`
 * and update the parent rack's `totalU`. Canvas size (width/height) is
 * left untouched on purpose — the user may have already arranged the
 * physical rack on the floor plan and resizing it would shift other
 * equipment around.
 */
function applyPresetToRack(
  rackEquipmentId: string,
  preset: RackPreset,
  categories: RackModuleCategory[],
) {
  const store = useEditorStore.getState();

  // 1) drop all existing modules for this rack from the working copy
  const existing = store.localRackModules.filter(
    (m) => m.rackEquipmentId === rackEquipmentId,
  );
  for (const m of existing) {
    store.removeRackModule(m.id);
  }

  // 2) bump rack's totalU so the slot grid matches the preset
  store.setLocalEquipment((prev) =>
    prev.map((eq) =>
      eq.id === rackEquipmentId ? { ...eq, totalU: preset.totalU } : eq,
    ),
  );

  // 3) expand preset.modules into RackModule rows
  const codeToCategory = new Map<string, RackModuleCategory>(
    categories.map((c) => [c.code, c]),
  );
  const now = new Date().toISOString();
  preset.modules.forEach((mod, idx) => {
    const cat = codeToCategory.get(mod.categoryCode);
    if (!cat) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rack-preset] module category code '${mod.categoryCode}' not in rack-module-categories — skipped`,
      );
      return;
    }
    const newModule: RackModule = {
      id: generateTempId(),
      rackEquipmentId,
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      categoryDisplayColor: cat.displayColor,
      name: mod.defaultName ?? cat.name,
      startU: mod.slotU,
      heightU: mod.heightU,
      installDate: null,
      manager: null,
      description: null,
      properties: null,
      sortOrder: idx,
      createdAt: now,
      updatedAt: now,
    };
    store.addRackModule(newModule);
  });

  store.setHasChanges(true);
}

// ============================================================
// Apply confirmation
// ============================================================

function ApplyPresetConfirmDialog({
  preset,
  onCancel,
  onConfirm,
}: {
  preset: RackPreset;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-3">프리셋 적용</h3>
        <p className="text-sm text-gray-600 mb-2">
          현재 랙의 모든 모듈이 삭제되고{' '}
          <strong className="text-gray-900">{preset.name}</strong> 구성
          (모듈 {preset.modules.length}개, {preset.totalU}U)으로 교체됩니다.
        </p>
        <p className="text-xs text-gray-400 mb-4">
          저장 전까지는 작업 사본에만 반영되며, 플로어 플랜을 저장하면 확정됩니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
