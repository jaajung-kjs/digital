import { useEditorStore } from '../../stores/editorStore';
import { useRecentMaterialsStore } from '../../../materials/stores/recentMaterialsStore';
import { MaterialPicker } from '../../../materials/components/MaterialPicker';

interface EquipmentMaterialModalProps {
  onAdd: () => void;
}

/**
 * Modal shown after the user drags out an equipment rectangle on the canvas.
 * Lets the user pick the material category and name, then commits via `onAdd`.
 */
export function EquipmentMaterialModal({ onAdd }: EquipmentMaterialModalProps) {
  const open = useEditorStore((s) => s.equipmentModalOpen);
  const setOpen = useEditorStore((s) => s.setEquipmentModalOpen);
  const newEquipmentName = useEditorStore((s) => s.newEquipmentName);
  const setNewEquipmentName = useEditorStore((s) => s.setNewEquipmentName);
  const setNewEquipmentCategory = useEditorStore((s) => s.setNewEquipmentCategory);
  const newEquipmentMaterialCategoryId = useEditorStore((s) => s.newEquipmentMaterialCategoryId);
  const newEquipmentSpecParams = useEditorStore((s) => s.newEquipmentSpecParams);
  const setNewEquipmentMaterial = useEditorStore((s) => s.setNewEquipmentMaterial);
  const resetNewEquipmentMaterial = useEditorStore((s) => s.resetNewEquipmentMaterial);
  const recentEquipment = useRecentMaterialsStore((s) => s.recentEquipment);

  if (!open) return null;

  const handleCancel = () => {
    setOpen(false);
    setNewEquipmentName('');
    setNewEquipmentCategory('NETWORK');
    resetNewEquipmentMaterial();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">설비 추가</h3>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">설비 이름</label>
          <input
            type="text"
            value={newEquipmentName}
            onChange={(e) => setNewEquipmentName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="예: UPS-01"
            autoFocus
          />
        </div>
        <div className="mb-4">
          <MaterialPicker
            categoryType="EQUIPMENT"
            value={newEquipmentMaterialCategoryId ? { categoryId: newEquipmentMaterialCategoryId, specParams: newEquipmentSpecParams ?? {} } : null}
            onChange={({ categoryId, categoryCode, categoryName, displayColor, specParams, specification }) => {
              setNewEquipmentMaterial(categoryId, categoryCode, categoryName, displayColor, specParams, specification);
            }}
            recentItems={recentEquipment}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={handleCancel} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">취소</button>
          <button onClick={onAdd} disabled={!newEquipmentName} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">추가</button>
        </div>
      </div>
    </div>
  );
}
