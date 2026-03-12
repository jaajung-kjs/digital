import { useState } from 'react';
import type { CableType } from '../../../types/connection';
import type { ViewMode } from '../../../types/floorPlan';
import { useEditorStore } from '../../editor/stores/editorStore';
import { generateTempId } from '../../../utils/idHelpers';
import { RemoteEquipmentSelector } from './RemoteEquipmentSelector';

const CABLE_TYPE_OPTIONS: { value: CableType; label: string }[] = [
  { value: 'LAN', label: 'LAN' },
  { value: 'FIBER', label: 'FIBER' },
  { value: 'AC', label: 'AC 전원' },
  { value: 'DC', label: 'DC 전원' },
  { value: 'GROUND', label: '접지' },
];

const CABLE_TYPES_BY_VIEW: Partial<Record<ViewMode, CableType[]>> = {
  'connection-network': ['LAN', 'FIBER'],
  'connection-power': ['AC', 'DC'],
  'connection-ground': ['GROUND'],
};

interface EquipmentOption {
  id: string;
  name: string;
}

interface ConnectionEditorProps {
  roomId: string;
  equipmentList: EquipmentOption[];
  defaultSourceId?: string;
  defaultTargetId?: string;
  editingCable?: {
    id: string;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: CableType;
    label?: string;
    length?: number;
    color?: string;
  };
  onClose: () => void;
}

export function ConnectionEditor({
  equipmentList,
  defaultSourceId,
  defaultTargetId,
  editingCable,
  onClose,
}: ConnectionEditorProps) {
  const addChange = useEditorStore((s) => s.addChange);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);
  const viewMode = useEditorStore((s) => s.viewMode);

  const allowedTypes = CABLE_TYPES_BY_VIEW[viewMode];
  const filteredOptions = allowedTypes
    ? CABLE_TYPE_OPTIONS.filter((o) => allowedTypes.includes(o.value))
    : CABLE_TYPE_OPTIONS;

  const [sourceEquipmentId, setSourceEquipmentId] = useState(editingCable?.sourceEquipmentId ?? defaultSourceId ?? '');
  const [targetEquipmentId, setTargetEquipmentId] = useState(editingCable?.targetEquipmentId ?? defaultTargetId ?? '');
  const [cableType, setCableType] = useState<CableType>(editingCable?.cableType ?? (allowedTypes?.[0] ?? 'LAN'));
  const [label, setLabel] = useState(editingCable?.label ?? '');
  const [length, setLength] = useState(editingCable?.length?.toString() ?? '');
  const isEditing = !!editingCable;

  const handleSave = () => {
    if (!sourceEquipmentId || !targetEquipmentId) return;

    if (isEditing && editingCable) {
      addChange({
        type: 'cable:update',
        id: editingCable.id,
        sourceEquipmentId,
        targetEquipmentId,
        cableType,
        label: label || undefined,
        length: length ? Number(length) : undefined,
      });
    } else {
      addChange({
        type: 'cable:create',
        localId: generateTempId(),
        sourceEquipmentId,
        targetEquipmentId,
        cableType,
        label: label || undefined,
        length: length ? Number(length) : undefined,
      });
    }

    setHasChanges(true);
    onClose();
  };

  const handleDelete = () => {
    if (!editingCable) return;
    if (confirm('이 케이블을 삭제하시겠습니까?')) {
      addChange({ type: 'cable:delete', cableId: editingCable.id });
      setHasChanges(true);
      onClose();
    }
  };

  const isValid = sourceEquipmentId && targetEquipmentId && sourceEquipmentId !== targetEquipmentId;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        {isEditing ? '케이블 수정' : '케이블 추가'}
      </h3>

      {/* Source Equipment */}
      <RemoteEquipmentSelector
        label="출발 설비"
        selectedEquipmentId={sourceEquipmentId}
        onSelect={(id) => setSourceEquipmentId(id)}
        localEquipmentList={equipmentList}
      />

      {/* Target Equipment */}
      <RemoteEquipmentSelector
        label="도착 설비"
        selectedEquipmentId={targetEquipmentId}
        onSelect={(id) => setTargetEquipmentId(id)}
        localEquipmentList={equipmentList}
        excludeId={sourceEquipmentId}
      />

      {/* Cable Type */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">케이블 타입</label>
        <select
          value={cableType}
          onChange={(e) => setCableType(e.target.value as CableType)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        >
          {filteredOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">라벨</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="선택 사항"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Length */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">길이 (m)</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="선택 사항"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          min={0}
          step={0.1}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!isValid}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          적용
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        {isEditing && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
