import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { assetToRackModule } from '../../workingCopy/assetToRackModule';
import { useRackModuleCategories } from '../hooks/useRackModuleCategories';
import { toDateInputValue } from '../../../utils/date';
import type { RackModule } from '../../../types/rackModule';

/** effective 케이블의 읽기 전용 shape — 통합 스토어 케이블 endpoint 모양. */
interface CableEndpoint {
  equipmentId: string | null;
  moduleId: string | null;
  name: string;
}
interface EffectiveCable {
  id: string;
  source?: CableEndpoint;
  target?: CableEndpoint;
  cableType?: string;
  categoryName?: string | null;
}

/**
 * P9: centered modal for viewing / editing a single RackModule.
 *
 * Opened by setting `selectedRackModuleId` on the editor store (typically
 * from a slot click in `RackEquipmentPanel`). Closed via 닫기 / ESC / 저장.
 *
 * Shows: name (editable), category (read-only), slot position/span (read-only), install date,
 * manager, description, and small read-only lists of connected cables /
 * recent maintenance (placeholder until backend wires module-scoped logs).
 */
export function RackModuleDialog() {
  const moduleId = useEditorStore((s) => s.selectedRackModuleId);
  const setSelectedRackModuleId = useEditorStore(
    (s) => s.setSelectedRackModuleId,
  );
  // SSOT-2d3a Task 2 — 읽기/쓰기를 통합 스토어로. 모듈은 effective assets 에서
  // RackModule shape 으로 매핑, 케이블/설비도 effective 에서 조회.
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();
  const setHasChanges = useEditorStore((s) => s.setHasChanges);
  const { data: categories } = useRackModuleCategories();

  const mod = useMemo(() => {
    if (!moduleId) return null;
    const asset = effectiveAssets.find((a) => a.id === moduleId);
    return asset ? assetToRackModule(asset) : null;
  }, [moduleId, effectiveAssets]);

  // Local form state, synced when a different module is selected.
  const [draft, setDraft] = useState<Partial<RackModule>>({});
  useEffect(() => {
    if (!mod) {
      setDraft({});
      return;
    }
    setDraft({
      name: mod.name,
      slotIndex: mod.slotIndex,
      slotSpan: mod.slotSpan,
      installDate: mod.installDate,
      manager: mod.manager,
      description: mod.description,
    });
  }, [mod]);

  // ESC closes (only when dialog is open).
  useEffect(() => {
    if (!moduleId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRackModuleId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moduleId, setSelectedRackModuleId]);

  if (!mod) return null;

  const category = categories?.find((c) => c.id === mod.categoryId);
  const swatch = mod.categoryDisplayColor ?? category?.displayColor ?? '#6b7280';

  // Cables that reference this module — effective 케이블의 source/target 엔드포인트
  // ({equipmentId, moduleId, name}) 모양으로 조회한다.
  const connectedCables = (effectiveCables as unknown as EffectiveCable[]).filter(
    (c) => c.source?.moduleId === mod.id || c.target?.moduleId === mod.id,
  );

  const handleSave = () => {
    useSubstationWorkingCopy.getState().stageRackModuleUpdate(mod.id, {
      name: draft.name ?? mod.name,
      installDate: draft.installDate ?? null,
      manager: draft.manager ?? null,
      description: draft.description ?? null,
    });
    setHasChanges(true);
    setSelectedRackModuleId(null);
  };

  const handleDelete = () => {
    if (!confirm(`'${mod.name}' 모듈을 삭제하시겠습니까? 연결된 케이블도 함께 삭제됩니다.`)) {
      return;
    }
    // stageEquipmentDeleteCascade 가 모듈 asset + 닿는 케이블을 함께 스테이징 삭제.
    useSubstationWorkingCopy.getState().stageEquipmentDeleteCascade(mod.id);
    setHasChanges(true);
    setSelectedRackModuleId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/5"
              style={{ backgroundColor: swatch }}
            />
            <h3 className="text-sm font-bold text-gray-900 truncate">{mod.name}</h3>
            <span className="ml-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500 shrink-0">
              {mod.categoryName ?? category?.name ?? '-'}
            </span>
            <span className="ml-1 text-[11px] text-gray-400 shrink-0">
              슬롯 {mod.slotIndex}-{mod.slotIndex + mod.slotSpan - 1}
            </span>
          </div>
          <button
            onClick={() => setSelectedRackModuleId(null)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="닫기 (ESC)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
            <input
              type="text"
              value={draft.name ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">카테고리</label>
            <input
              type="text"
              readOnly
              value={mod.categoryName ?? category?.name ?? ''}
              className="w-full text-sm border border-gray-200 bg-gray-50 rounded px-2.5 py-1.5 text-gray-600"
            />
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">슬롯 위치 / 크기</div>
            <div className="flex items-baseline gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded">
              <span className="text-sm font-medium text-gray-700 tabular-nums">
                슬롯 {mod.slotIndex + 1}–{mod.slotIndex + mod.slotSpan}
              </span>
              <span className="text-xs text-gray-400">({mod.slotSpan}슬롯)</span>
              <span className="ml-auto text-[11px] text-gray-400">
                위치/크기는 그리드에서 드래그
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">설치일</label>
            <input
              type="date"
              value={toDateInputValue(draft.installDate)}
              onChange={(e) => setDraft((d) => ({ ...d, installDate: e.target.value || null }))}
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
            <input
              type="text"
              value={draft.manager ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, manager: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
              placeholder="선택 사항"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
            <textarea
              rows={3}
              value={draft.description ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400 resize-none"
              placeholder="선택 사항"
            />
          </div>

          {/* Connected cables (read-only) */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">
              연결된 케이블 ({connectedCables.length})
            </div>
            {connectedCables.length === 0 ? (
              <p className="text-xs text-gray-300">연결된 케이블이 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {connectedCables.map((c) => {
                  const isSource = c.source?.moduleId === mod.id;
                  const other = isSource ? c.target : c.source;
                  return (
                    <li
                      key={c.id}
                      className="text-xs text-gray-600 px-2 py-1 rounded bg-gray-50 flex items-center gap-2"
                    >
                      <span className="text-gray-400">
                        {isSource ? '→' : '←'}
                      </span>
                      <span className="flex-1 truncate">{other?.name ?? '?'}</span>
                      <span className="text-[10px] text-gray-400">
                        {c.categoryName ?? c.cableType}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent maintenance — placeholder; backend route is not yet
              module-scoped (P10/P11 will surface module-level logs). */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">최근 점검</div>
            <p className="text-xs text-gray-300">
              모듈 단위 점검 이력은 아직 지원하지 않습니다.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            삭제
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedRackModuleId(null)}
              className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
