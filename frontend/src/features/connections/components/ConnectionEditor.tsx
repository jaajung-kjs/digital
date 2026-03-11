import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableType } from '../../../types/connection';

const CABLE_TYPE_OPTIONS: { value: CableType; label: string }[] = [
  { value: 'LAN', label: 'LAN' },
  { value: 'FIBER', label: 'FIBER' },
  { value: 'AC', label: 'AC 전원' },
  { value: 'DC', label: 'DC 전원' },
  { value: 'GROUND', label: '접지' },
];

interface EquipmentOption {
  id: string;
  name: string;
}

interface ConnectionEditorProps {
  roomId: string;
  /** Available equipment list */
  equipmentList: EquipmentOption[];
  /** Pre-selected source equipment id */
  defaultSourceId?: string;
  /** Pre-selected target equipment id */
  defaultTargetId?: string;
  /** Existing cable to edit */
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
  roomId,
  equipmentList,
  defaultSourceId,
  defaultTargetId,
  editingCable,
  onClose,
}: ConnectionEditorProps) {
  const queryClient = useQueryClient();

  const [sourceEquipmentId, setSourceEquipmentId] = useState(editingCable?.sourceEquipmentId ?? defaultSourceId ?? '');
  const [targetEquipmentId, setTargetEquipmentId] = useState(editingCable?.targetEquipmentId ?? defaultTargetId ?? '');
  const [cableType, setCableType] = useState<CableType>(editingCable?.cableType ?? 'LAN');
  const [label, setLabel] = useState(editingCable?.label ?? '');
  const [length, setLength] = useState(editingCable?.length?.toString() ?? '');
  const [color, setColor] = useState(editingCable?.color ?? '');

  const isEditing = !!editingCable;

  const invalidateConnections = () => {
    void queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post('/cables', payload);
      return data;
    },
    onSuccess: () => {
      invalidateConnections();
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await api.put(`/cables/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      invalidateConnections();
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cables/${id}`);
    },
    onSuccess: () => {
      invalidateConnections();
      onClose();
    },
  });

  const handleSave = () => {
    if (!sourceEquipmentId || !targetEquipmentId) return;

    const payload = {
      sourceEquipmentId,
      targetEquipmentId,
      cableType,
      label: label || undefined,
      length: length ? Number(length) : undefined,
      color: color || undefined,
    };

    if (isEditing && editingCable) {
      updateMutation.mutate({ id: editingCable.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (!editingCable) return;
    if (confirm('이 케이블을 삭제하시겠습니까?')) {
      deleteMutation.mutate(editingCable.id);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isValid = sourceEquipmentId && targetEquipmentId && sourceEquipmentId !== targetEquipmentId;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">
        {isEditing ? '케이블 수정' : '케이블 추가'}
      </h3>

      {/* Source Equipment */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">출발 설비</label>
        <select
          value={sourceEquipmentId}
          onChange={(e) => setSourceEquipmentId(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        >
          <option value="">선택...</option>
          {equipmentList.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}
            </option>
          ))}
        </select>
      </div>

      {/* Target Equipment */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">도착 설비</label>
        <select
          value={targetEquipmentId}
          onChange={(e) => setTargetEquipmentId(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        >
          <option value="">선택...</option>
          {equipmentList
            .filter((eq) => eq.id !== sourceEquipmentId)
            .map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
        </select>
      </div>

      {/* Cable Type */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">케이블 타입</label>
        <select
          value={cableType}
          onChange={(e) => setCableType(e.target.value as CableType)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        >
          {CABLE_TYPE_OPTIONS.map((opt) => (
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

      {/* Color */}
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">색상</label>
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="기본 색상 사용"
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? '저장 중...' : '저장'}
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
            disabled={deleteMutation.isPending}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
