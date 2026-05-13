import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useRackPresets } from '../hooks/useRackPresets';
import { useRackModuleCategories } from '../hooks/useRackModuleCategories';
import { useIsAdmin } from '../../../stores/authStore';
import { generateTempId } from '../../../utils/idHelpers';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { RackPreset } from '../../../types/rackPreset';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import { SaveRackAsPresetDialog } from './SaveRackAsPresetDialog';

// ============================================================
// Source-preset tracking on Equipment.properties
// ============================================================
// 랙이 어느 프리셋에서 왔는지 (또는 마지막으로 저장한 프리셋이 무엇인지) 를
// rack equipment 의 properties JSON 에 기록한다. 이렇게 하면 도면을 닫았다가
// 다시 열어도, 다른 랙을 선택했다가 돌아와도 드롭다운에 그 프리셋이
// 자동으로 선택돼있다. (모듈 구성 비교 같은 휴리스틱이 아니라 명시적 추적.)
//
// Equipment.properties 는 kind 별 임의 도메인 데이터를 담는 Json? 필드 —
// RACK kind 는 거의 비어있다는 스키마 주석이 있어 여기 metadata 를 얹어도
// 다른 kind 와 충돌하지 않는다.

interface RackProperties {
  sourcePresetId?: string;
  [key: string]: unknown;
}

function readSourcePresetId(eq: FloorPlanEquipment | undefined): string | null {
  if (!eq) return null;
  const props = (eq.properties as RackProperties | null | undefined) ?? null;
  const id = props?.sourcePresetId;
  return typeof id === 'string' ? id : null;
}

function withSourcePresetId(eq: FloorPlanEquipment, presetId: string | null): FloorPlanEquipment {
  const prev = (eq.properties as RackProperties | null | undefined) ?? {};
  const next: RackProperties = { ...prev };
  if (presetId) {
    next.sourcePresetId = presetId;
  } else {
    delete next.sourcePresetId;
  }
  // 빈 객체면 null 로 — DB JSON 컬럼이 noise 안 쌓이게.
  const hasKeys = Object.keys(next).length > 0;
  return { ...eq, properties: hasKeys ? next : null };
}

function updateRackSourcePreset(rackEquipmentId: string, presetId: string | null) {
  const store = useEditorStore.getState();
  const next = store.localEquipment.map((eq) =>
    eq.id === rackEquipmentId ? withSourcePresetId(eq, presetId) : eq,
  );
  store.setLocalEquipment(next);
  store.setHasChanges(true);
}

interface PresetActionsBarProps {
  rackEquipmentId: string;
}

/**
 * 랙 detail 의 "내부 설비" 탭 상단 액션 행.
 *
 *  ┌──────────────────────────────────────────────────┐
 *  │ [프리셋 선택 ▾]  [불러오기]  [저장]               │
 *  └──────────────────────────────────────────────────┘
 *
 * 문서 편집 패턴 (load / save):
 * - **프리셋 선택**: 활성 프리셋 리스트 + "(새 프리셋…)". 즉시 apply 안 함.
 * - **불러오기**: 선택된 프리셋의 모듈을 현재 랙에 복제 (기존 모듈 있으면 confirm).
 * - **저장**: 이름 입력 다이얼로그를 띄움. 다이얼로그에서 이름이
 *   선택된 프리셋의 이름과 같으면 → 그 프리셋 덮어쓰기(PATCH).
 *   이름을 바꿨거나 "(새 프리셋…)" 이었으면 → 새 프리셋 생성(POST).
 *
 * Note: 불러오기는 working copy 만 건드림 (floor plan 저장 전까진 미확정).
 *       저장은 즉시 백엔드에 반영 (admin 전용).
 */
export function PresetActionsBar({ rackEquipmentId }: PresetActionsBarProps) {
  const { data: presets } = useRackPresets();
  const { data: categories } = useRackModuleCategories();
  const isAdmin = useIsAdmin();
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localRackModules = useEditorStore((s) => s.localRackModules);

  const activePresets = useMemo(
    () => (presets ?? []).filter((p) => p.isActive),
    [presets],
  );

  const rackEquipment = useMemo(
    () => localEquipment.find((e) => e.id === rackEquipmentId),
    [localEquipment, rackEquipmentId],
  );

  // 랙의 sourcePresetId 가 활성 프리셋 중 하나면 그것을 default 선택값으로.
  // 프리셋이 삭제됐거나 (orphan) 한 번도 적용 안 한 랙이면 null → (새 프리셋…).
  const trackedPresetId = useMemo(() => {
    const id = readSourcePresetId(rackEquipment);
    if (!id) return null;
    return activePresets.some((p) => p.id === id) ? id : null;
  }, [rackEquipment, activePresets]);

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(trackedPresetId);
  const [pendingApply, setPendingApply] = useState<RackPreset | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  // 랙이 바뀌거나 (다른 rackEquipmentId), 백엔드 응답으로 properties 가
  // 갱신되면 드롭다운을 그 source 로 재동기화.
  useEffect(() => {
    setSelectedPresetId(trackedPresetId);
  }, [trackedPresetId]);

  const existingModuleCount = useMemo(
    () => localRackModules.filter((m) => m.rackEquipmentId === rackEquipmentId).length,
    [localRackModules, rackEquipmentId],
  );

  const selectedPreset = useMemo(
    () => (selectedPresetId ? activePresets.find((p) => p.id === selectedPresetId) ?? null : null),
    [selectedPresetId, activePresets],
  );

  if (!rackEquipment) return null;

  const handleLoadClick = () => {
    if (!selectedPreset) return;
    if (existingModuleCount > 0) {
      setPendingApply(selectedPreset);
    } else {
      applyPresetToRack(rackEquipmentId, selectedPreset, categories ?? []);
      updateRackSourcePreset(rackEquipmentId, selectedPreset.id);
    }
  };

  const handleConfirmApply = () => {
    if (!pendingApply) return;
    applyPresetToRack(rackEquipmentId, pendingApply, categories ?? []);
    updateRackSourcePreset(rackEquipmentId, pendingApply.id);
    setPendingApply(null);
  };

  return (
    <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
      {/* 프리셋 선택 */}
      <select
        value={selectedPresetId ?? ''}
        onChange={(e) => setSelectedPresetId(e.target.value || null)}
        className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        aria-label="프리셋 선택"
      >
        <option value="">(새 프리셋…)</option>
        {activePresets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · 모듈 {p.modules.length}개
          </option>
        ))}
      </select>

      {/* 불러오기 */}
      <button
        type="button"
        onClick={handleLoadClick}
        disabled={!selectedPreset}
        title={
          selectedPreset
            ? `'${selectedPreset.name}' 을 현재 랙에 적용`
            : '프리셋을 먼저 선택하세요'
        }
        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        불러오기
      </button>

      {/* 저장 */}
      <button
        type="button"
        onClick={() => setSaveOpen(true)}
        disabled={!isAdmin}
        title={
          !isAdmin
            ? '관리자만 프리셋을 저장할 수 있습니다.'
            : selectedPreset
              ? `'${selectedPreset.name}' 덮어쓰기 (이름 바꾸면 새 프리셋)`
              : '현재 랙 구성을 새 프리셋으로 저장'
        }
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        저장
      </button>

      {/* 적용 confirmation modal — 기존 모듈이 있을 때만 호출됨 */}
      {pendingApply && (
        <ApplyPresetConfirmDialog
          preset={pendingApply}
          existingModuleCount={existingModuleCount}
          onCancel={() => setPendingApply(null)}
          onConfirm={handleConfirmApply}
        />
      )}

      {/* 저장 dialog — selectedPreset 이 있으면 덮어쓰기 흐름, 없으면 새로 저장 */}
      {saveOpen && (
        <SaveRackAsPresetDialog
          rackEquipmentId={rackEquipmentId}
          originalPreset={selectedPreset}
          onClose={() => setSaveOpen(false)}
          onSaved={(savedId) => {
            // 저장된 프리셋을 이 랙의 source 로 기록 → 닫았다 열어도 유지.
            updateRackSourcePreset(rackEquipmentId, savedId);
            setSelectedPresetId(savedId);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Apply preset to working copy
// ============================================================

/**
 * P10/12-slot: replace the current rack's working modules with `preset.modules`.
 * 12-슬롯 고정 시스템에서 슬롯 수는 totalU 와 무관하므로 totalU 는 건드리지 않는다.
 * (totalU 는 인벤토리 메타데이터로 남아있되 레이아웃에 영향 없음.)
 * Canvas size (width/height) is left untouched on purpose — the user may have
 * already arranged the physical rack on the floor plan and resizing it would
 * shift other equipment around.
 */
function applyPresetToRack(
  rackEquipmentId: string,
  preset: RackPreset,
  categories: RackModuleCategory[],
) {
  const store = useEditorStore.getState();

  // Snapshot pre-apply so Ctrl+Z restores prior arrangement.
  store.pushHistory(store.localEquipment, store.localCables, store.localRackModules);

  // 1) drop all existing modules for this rack from the working copy
  const existing = store.localRackModules.filter(
    (m) => m.rackEquipmentId === rackEquipmentId,
  );
  for (const m of existing) {
    store.removeRackModule(m.id);
  }

  // 2) expand preset.modules into RackModule rows
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
      categoryDefaultSlotSpan: cat.defaultSlotSpan,
      name: mod.defaultName ?? cat.name,
      slotIndex: mod.slotIndex,
      slotSpan: mod.slotSpan,
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
  existingModuleCount,
  onCancel,
  onConfirm,
}: {
  preset: RackPreset;
  existingModuleCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-3">프리셋 적용</h3>
        <p className="text-sm text-gray-600 mb-2">
          현재 {existingModuleCount}개 모듈이 모두 삭제되고 프리셋{' '}
          <strong className="text-gray-900">'{preset.name}'</strong> 의{' '}
          {preset.modules.length}개 모듈로 교체됩니다.
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
