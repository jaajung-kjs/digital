import { useState } from 'react';
import type { CableType } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { generateTempId } from '../../../utils/idHelpers';
import { useFiberPaths } from '../../fiber/hooks/useFiberPaths';
import type { EditingCable } from '../hooks/useConnectionEditor';

const CABLE_TYPE_OPTIONS: { value: CableType; label: string; color: string }[] = [
  { value: 'LAN', label: 'LAN', color: '#3b82f6' },
  { value: 'FIBER', label: 'FIBER', color: '#22c55e' },
  { value: 'AC', label: 'AC 전원', color: '#ef4444' },
  { value: 'DC', label: 'DC 전원', color: '#f97316' },
  { value: 'GROUND', label: '접지', color: '#eab308' },
];

interface EquipmentOption {
  id: string;
  name: string;
  category?: string;
}

/** --- CREATE POPOVER (compact, after 2 clicks) --- */

interface CreatePopoverProps {
  sourceEquipmentId: string;
  targetEquipmentId: string;
  equipmentList: EquipmentOption[];
  onClose: () => void;
}

export function ConnectionCreatePopover({
  sourceEquipmentId,
  targetEquipmentId,
  equipmentList,
  onClose,
}: CreatePopoverProps) {
  const addChange = useEditorStore((s) => s.addChange);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const [cableType, setCableType] = useState<CableType>('LAN');

  const handleCreate = () => {
    addChange({
      type: 'cable:create',
      localId: generateTempId(),
      sourceEquipmentId,
      targetEquipmentId,
      cableType,
    });
    setHasChanges(true);
    onClose();
  };

  const sourceName = equipmentList.find((eq) => eq.id === sourceEquipmentId)?.name ?? '?';
  const targetName = equipmentList.find((eq) => eq.id === targetEquipmentId)?.name ?? '?';

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64">
      {/* Source -> Target display */}
      <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500">
        <span className="font-medium text-gray-700 truncate max-w-[90px]">{sourceName}</span>
        <span>&rarr;</span>
        <span className="font-medium text-gray-700 truncate max-w-[90px]">{targetName}</span>
      </div>

      {/* Cable type as radio buttons */}
      <div className="mb-3">
        <div className="grid grid-cols-3 gap-1">
          {CABLE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCableType(opt.value)}
              className={`px-2 py-1.5 text-xs rounded font-medium transition-colors ${
                cableType === opt.value
                  ? 'text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={cableType === opt.value ? { backgroundColor: opt.color } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
        >
          연결
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}

/** --- EDIT DIALOG (full, after double-click on cable) --- */

interface EditDialogProps {
  cable: EditingCable;
  equipmentList: EquipmentOption[];
  onClose: () => void;
}

export function ConnectionEditDialog({
  cable,
  equipmentList,
  onClose,
}: EditDialogProps) {
  const addChange = useEditorStore((s) => s.addChange);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const [cableType, setCableType] = useState<CableType>(cable.cableType);
  const [label, setLabel] = useState(cable.label ?? '');
  const [length, setLength] = useState(cable.length?.toString() ?? '');
  const [fiberPathId, setFiberPathId] = useState<string | undefined>(cable.fiberPathId ?? undefined);
  const [fiberPortNumber, setFiberPortNumber] = useState<number | undefined>(cable.fiberPortNumber ?? undefined);

  const sourceEq = equipmentList.find((eq) => eq.id === cable.sourceEquipmentId);
  const targetEq = equipmentList.find((eq) => eq.id === cable.targetEquipmentId);
  const ofdEquipmentId = sourceEq?.category === 'OFD' ? cable.sourceEquipmentId
    : targetEq?.category === 'OFD' ? cable.targetEquipmentId
    : null;
  const showFiber = cableType === 'FIBER' && !!ofdEquipmentId;
  const { data: fiberPaths } = useFiberPaths(ofdEquipmentId ?? '', showFiber);

  const selectedFiberPath = fiberPaths?.find((p) => p.id === fiberPathId);
  const availablePorts = selectedFiberPath?.ports.filter((p) => {
    const isLocalA = selectedFiberPath.ofdA.id === ofdEquipmentId;
    const localSide = isLocalA ? p.sideA : p.sideB;
    // Show current port as available + unoccupied ports
    return !localSide || p.portNumber === cable.fiberPortNumber;
  }) ?? [];

  const handleSave = () => {
    addChange({
      type: 'cable:update',
      id: cable.id,
      sourceEquipmentId: cable.sourceEquipmentId,
      targetEquipmentId: cable.targetEquipmentId,
      cableType,
      label: label || undefined,
      length: length ? Number(length) : undefined,
      fiberPathId: fiberPathId || undefined,
      fiberPortNumber: fiberPortNumber ?? undefined,
    });
    setHasChanges(true);
    onClose();
  };

  const handleDelete = () => {
    if (!confirm('이 케이블을 삭제하시겠습니까?')) return;
    addChange({ type: 'cable:delete', cableId: cable.id });
    setHasChanges(true);
    onClose();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-80">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">케이블 수정</h3>

      {/* Source -> Target (read-only) */}
      <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-gray-50 rounded text-sm">
        <span className="font-medium text-gray-700 truncate">{sourceEq?.name ?? '?'}</span>
        <span className="text-gray-400">&rarr;</span>
        <span className="font-medium text-gray-700 truncate">{targetEq?.name ?? '?'}</span>
      </div>

      {/* Cable Type */}
      <div className="mb-2">
        <label className="block text-xs text-gray-500 mb-1">타입</label>
        <select
          value={cableType}
          onChange={(e) => {
            setCableType(e.target.value as CableType);
            if (e.target.value !== 'FIBER') {
              setFiberPathId(undefined);
              setFiberPortNumber(undefined);
            }
          }}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
        >
          {CABLE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
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

      {/* Fiber Path / Port (OFD + FIBER) */}
      {showFiber && fiberPaths && fiberPaths.length > 0 && (
        <div className="mb-2 border-t border-gray-100 pt-2">
          <label className="block text-xs text-gray-500 mb-1">광경로</label>
          <select
            value={fiberPathId ?? ''}
            onChange={(e) => {
              setFiberPathId(e.target.value || undefined);
              setFiberPortNumber(undefined);
            }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          >
            <option value="">선택 안함</option>
            {fiberPaths.map((fp) => {
              const remote = fp.ofdA.id === ofdEquipmentId ? fp.ofdB : fp.ofdA;
              return (
                <option key={fp.id} value={fp.id}>
                  {remote.substationName} ({fp.portCount}코어)
                </option>
              );
            })}
          </select>

          {fiberPathId && availablePorts.length > 0 && (
            <div className="mt-1.5">
              <label className="block text-xs text-gray-500 mb-1">포트</label>
              <select
                value={fiberPortNumber ?? ''}
                onChange={(e) => setFiberPortNumber(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              >
                <option value="">선택 안함</option>
                {availablePorts.map((port) => (
                  <option key={port.portNumber} value={port.portNumber}>
                    포트 {port.portNumber}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {showFiber && (!fiberPaths || fiberPaths.length === 0) && (
        <p className="text-xs text-amber-600 mb-2">
          설비 상세에서 먼저 광경로를 추가하세요
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
        >
          삭제
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
        >
          저장
        </button>
      </div>
    </div>
  );
}
