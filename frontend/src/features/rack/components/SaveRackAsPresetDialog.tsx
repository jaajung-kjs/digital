import { useMemo, useState } from 'react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useCreateRackPreset } from '../hooks/useRackPresets';
import type { CreateRackPresetInput, RackPresetModuleInput } from '../../../types/rackPreset';

interface SaveRackAsPresetDialogProps {
  rackEquipmentId: string;
  onClose: () => void;
}

/**
 * P10: snapshots the current working-copy rack (parent equipment +
 * its `localRackModules`) into a brand-new RackPreset row.
 *
 * Auto-extracted from the editor store:
 *   - totalU       ← Equipment.totalU (fallback 42)
 *   - canvasWidth  ← Equipment.width
 *   - canvasHeight ← Equipment.height
 *   - modules      ← localRackModules filtered to this rack, mapped to
 *                    `{ slotIndex, slotSpan, categoryCode, defaultName }`
 *
 * `code` is left undefined so the backend assigns USR-{shortId}.
 */
export function SaveRackAsPresetDialog({
  rackEquipmentId,
  onClose,
}: SaveRackAsPresetDialogProps) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localRackModules = useEditorStore((s) => s.localRackModules);
  const createPreset = useCreateRackPreset();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rack = useMemo(
    () => localEquipment.find((e) => e.id === rackEquipmentId),
    [localEquipment, rackEquipmentId],
  );

  const modules = useMemo(
    () =>
      localRackModules
        .filter((m) => m.rackEquipmentId === rackEquipmentId)
        .sort((a, b) => a.slotIndex - b.slotIndex),
    [localRackModules, rackEquipmentId],
  );

  const orphanModules = useMemo(
    () => modules.filter((m) => !m.categoryCode),
    [modules],
  );

  const totalU = rack?.totalU ?? 42;
  const canvasWidth = rack?.width ?? 0;
  const canvasHeight = rack?.height ?? 0;

  const canSave =
    !!rack &&
    name.trim().length > 0 &&
    canvasWidth > 0 &&
    canvasHeight > 0 &&
    orphanModules.length === 0 &&
    !createPreset.isPending;

  const handleSave = async () => {
    if (!rack) return;
    setError(null);

    const moduleInputs: RackPresetModuleInput[] = modules
      .filter((m) => !!m.categoryCode)
      .map((m) => ({
        slotIndex: m.slotIndex,
        slotSpan: m.slotSpan,
        categoryCode: m.categoryCode as string,
        defaultName: m.name || null,
      }));

    const payload: CreateRackPresetInput = {
      name: name.trim(),
      totalU,
      canvasWidth,
      canvasHeight,
      description: description.trim() || null,
      modules: moduleInputs,
    };

    try {
      await createPreset.mutateAsync(payload);
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        '프리셋 저장에 실패했습니다.';
      setError(msg);
    }
  };

  if (!rack) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-sm text-gray-500">랙 장비를 찾을 수 없습니다.</p>
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">프리셋으로 저장</h3>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            이름 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: 표준 네트워크 랙"
            autoFocus
          />
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={2}
            placeholder="(선택)"
          />
        </div>

        {/* snapshot summary */}
        <div className="mb-3 px-3 py-2 bg-gray-50 rounded-md border border-gray-100 text-xs text-gray-600 space-y-0.5">
          <div>
            <span className="font-medium text-gray-700">슬롯:</span> {totalU}U
          </div>
          <div>
            <span className="font-medium text-gray-700">캔버스:</span>{' '}
            {Math.round(canvasWidth)} × {Math.round(canvasHeight)}
          </div>
          <div>
            <span className="font-medium text-gray-700">모듈:</span> {modules.length}개 포함
          </div>
        </div>

        {orphanModules.length > 0 && (
          <p className="mb-3 text-xs text-amber-600">
            카테고리 코드가 없는 모듈이 {orphanModules.length}개 있어 저장할 수 없습니다.
          </p>
        )}

        {error && (
          <p className="mb-3 text-xs text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={createPreset.isPending}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {createPreset.isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
