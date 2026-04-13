import { useState, useMemo } from 'react';
import { generateTempId } from '../../../utils/idHelpers';
import { getEquipmentCategoryFromMaterial } from '../../../types/material';
import { useEditorStore } from '../stores/editorStore';
import { MaterialPicker } from '../../materials/components/MaterialPicker';
import { useRecentMaterialsStore } from '../../materials/stores/recentMaterialsStore';

interface RackEquipmentFormProps {
  rackEquipmentId: string;  // the parent EQP-RACK equipment ID
  totalU: number;
  occupiedSlots: Map<number, unknown>;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RackEquipmentForm({
  rackEquipmentId,
  totalU,
  occupiedSlots,
  onSuccess,
  onCancel,
}: RackEquipmentFormProps) {
  const [name, setName] = useState('');
  const [heightU, setHeightU] = useState(1);
  const [startU, setStartU] = useState<number | null>(null);
  const [materialCategoryId, setMaterialCategoryId] = useState<string | null>(null);
  const [materialCategoryCode, setMaterialCategoryCode] = useState<string | null>(null);
  const [materialCategoryName, setMaterialCategoryName] = useState<string | null>(null);
  const [displayColor, setDisplayColor] = useState<string | null>(null);
  const [specification, setSpecification] = useState<string | null>(null);
  const [specParams, setSpecParams] = useState<Record<string, unknown> | null>(null);
  const recentEquipment = useRecentMaterialsStore((s) => s.recentEquipment);

  // Calculate available start positions based on equipment height
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
      if (canFit) {
        positions.push(u);
      }
    }
    return positions;
  }, [totalU, heightU, occupiedSlots]);

  // Auto-select first available position when height changes
  const effectiveStartU = startU != null && availablePositions.includes(startU)
    ? startU
    : availablePositions[0] ?? null;

  const handleSubmit = () => {
    if (!name.trim() || effectiveStartU == null) return;

    const category = materialCategoryCode
      ? getEquipmentCategoryFromMaterial(materialCategoryCode)
      : 'NETWORK';

    useEditorStore.getState().setLocalEquipment((prev) => [...prev, {
      id: generateTempId(),
      name: name.trim(),
      category,
      positionX: 0,
      positionY: 0,
      width: 0,
      height: 0,
      rotation: 0,
      materialCategoryId,
      materialCategoryCode,
      materialCategoryName,
      displayColor,
      specification,
      specParams,
      parentEquipmentId: rackEquipmentId,
      startU: effectiveStartU,
      heightU,
    }]);
    useEditorStore.getState().setHasChanges(true);

    // C1: Track recent material usage
    if (materialCategoryId && materialCategoryCode && specification) {
      useRecentMaterialsStore.getState().addRecent('equipment', {
        categoryId: materialCategoryId,
        categoryCode: materialCategoryCode,
        categoryName: materialCategoryName ?? specification,
        specParams: specParams ?? {},
        specification,
      });
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">설비 추가</h3>

        {/* Name */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: L2 스위치-1"
            autoFocus
          />
        </div>

        {/* Material picker */}
        <div className="mb-3">
          <MaterialPicker
            categoryType="EQUIPMENT"
            value={materialCategoryId ? { categoryId: materialCategoryId, specParams: specParams ?? {} } : null}
            onChange={({ categoryId, categoryCode, categoryName, displayColor: dc, specParams: sp, specification: spec }) => {
              setMaterialCategoryId(categoryId);
              setMaterialCategoryCode(categoryCode ?? null);
              setMaterialCategoryName(categoryName ?? null);
              setDisplayColor(dc ?? null);
              setSpecification(spec ?? null);
              setSpecParams(sp);
            }}
            recentItems={recentEquipment}
          />
        </div>

        {/* Height */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">크기 (U)</label>
          <input
            type="number"
            min={1}
            max={totalU}
            value={heightU}
            onChange={(e) => {
              const val = Math.max(1, Math.min(totalU, parseInt(e.target.value) || 1));
              setHeightU(val);
              setStartU(null); // reset position when height changes
            }}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Start position */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            시작 위치 (U)
            <span className="text-gray-400 font-normal ml-1">
              빈 슬롯 {availablePositions.length}개
            </span>
          </label>
          {availablePositions.length === 0 ? (
            <p className="text-sm text-red-500">빈 슬롯이 없습니다. 크기를 줄여주세요.</p>
          ) : (
            <select
              value={effectiveStartU ?? ''}
              onChange={(e) => setStartU(parseInt(e.target.value))}
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

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || effectiveStartU == null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
