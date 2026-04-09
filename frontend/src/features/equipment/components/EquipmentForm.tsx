import { useState, useEffect, useMemo } from 'react';
import { useUpdateEquipment } from '../hooks/useEquipment';
import {
  EQUIPMENT_CATEGORIES,
  CATEGORY_LABELS,
  buildEquipmentCategoriesFromAPI,
} from '../types/equipment';
import type { EquipmentFormData } from '../types/equipment';
import type { EquipmentItem } from '../../../types/floorPlan';
import { useEquipmentCategories } from '../../../hooks/useMaterialCategories';

interface EquipmentFormProps {
  equipment?: EquipmentItem | null;
  onSuccess: () => void;
  onCancel: () => void;
  onSubmitCreate?: (data: EquipmentFormData) => void;
  isCreatePending?: boolean;
}

export function EquipmentForm({
  equipment,
  onSuccess,
  onCancel,
  onSubmitCreate,
  isCreatePending,
}: EquipmentFormProps) {
  const updateEquipment = useUpdateEquipment();
  const isEdit = !!equipment;

  const { data: equipmentCategoryData } = useEquipmentCategories();
  const dynamicCategories = useMemo(
    () => equipmentCategoryData ? buildEquipmentCategoriesFromAPI(equipmentCategoryData) : null,
    [equipmentCategoryData]
  );

  const [formData, setFormData] = useState<EquipmentFormData>({
    name: '',
    model: '',
    manufacturer: '',
    serialNumber: '',
    category: 'NETWORK',
    manager: '',
    description: '',
    positionX: 0,
    positionY: 0,
    width2d: 60,
    height2d: 60,
    rotation: 0,
    height3d: 100,
  });

  useEffect(() => {
    if (equipment) {
      setFormData({
        name: equipment.name,
        model: equipment.model || '',
        manufacturer: equipment.manufacturer || '',
        serialNumber: '',
        category: equipment.category,
        materialCategoryId: equipment.materialCategoryId,
        manager: equipment.manager || '',
        description: equipment.description || '',
        positionX: equipment.positionX,
        positionY: equipment.positionY,
        width2d: equipment.width2d,
        height2d: equipment.height2d,
        rotation: equipment.rotation,
        height3d: equipment.height3d,
      });
    }
  }, [equipment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (isEdit && equipment) {
      await updateEquipment.mutateAsync({ id: equipment.id, ...formData });
      onSuccess();
    } else if (onSubmitCreate) {
      onSubmitCreate(formData);
    }
  };

  const isPending =
    updateEquipment.isPending || (isCreatePending ?? false);

  const updateField = <K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          장비명 *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="장비명을 입력하세요"
          required
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Category */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          카테고리
        </label>
        <select
          value={dynamicCategories
            ? (dynamicCategories.list.find(c => c.materialCategoryId === formData.materialCategoryId)?.code ?? formData.category)
            : formData.category
          }
          onChange={(e) => {
            const selectedValue = e.target.value;
            if (dynamicCategories) {
              const selected = dynamicCategories.list.find(c => c.code === selectedValue);
              if (selected) {
                setFormData(prev => ({
                  ...prev,
                  category: selected.legacyCategory,
                  materialCategoryId: selected.materialCategoryId,
                }));
                return;
              }
            }
            updateField('category', selectedValue);
          }}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        >
          {dynamicCategories ? (
            dynamicCategories.list.map((cat) => (
              <option key={cat.code} value={cat.code}>
                {cat.icon} {cat.name}
              </option>
            ))
          ) : (
            EQUIPMENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Model */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          모델
        </label>
        <input
          type="text"
          value={formData.model || ''}
          onChange={(e) => updateField('model', e.target.value)}
          placeholder="모델명"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Manufacturer */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          제조사
        </label>
        <input
          type="text"
          value={formData.manufacturer || ''}
          onChange={(e) => updateField('manufacturer', e.target.value)}
          placeholder="제조사"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Serial Number */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          시리얼 번호
        </label>
        <input
          type="text"
          value={formData.serialNumber || ''}
          onChange={(e) => updateField('serialNumber', e.target.value)}
          placeholder="시리얼 번호"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Manager */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          담당자
        </label>
        <input
          type="text"
          value={formData.manager || ''}
          onChange={(e) => updateField('manager', e.target.value)}
          placeholder="담당자"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          설명
        </label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="설명"
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Position fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            X 좌표
          </label>
          <input
            type="number"
            value={formData.positionX}
            onChange={(e) => updateField('positionX', Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Y 좌표
          </label>
          <input
            type="number"
            value={formData.positionY}
            onChange={(e) => updateField('positionY', Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            너비 (2D)
          </label>
          <input
            type="number"
            value={formData.width2d}
            onChange={(e) => updateField('width2d', Number(e.target.value))}
            min={10}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            높이 (2D)
          </label>
          <input
            type="number"
            value={formData.height2d}
            onChange={(e) => updateField('height2d', Number(e.target.value))}
            min={10}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Rotation & 3D Height */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            회전 (도)
          </label>
          <input
            type="number"
            value={formData.rotation ?? 0}
            onChange={(e) => updateField('rotation', Number(e.target.value))}
            min={0}
            max={360}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            3D 높이
          </label>
          <input
            type="number"
            value={formData.height3d ?? 100}
            onChange={(e) => updateField('height3d', Number(e.target.value))}
            min={0}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending || !formData.name.trim()}
          className="flex-1 rounded bg-blue-500 py-1.5 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isPending ? '저장 중...' : isEdit ? '수정' : '등록'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-gray-300 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
