import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../editor/stores/editorStore';
import { EQUIPMENT_KIND_INFO } from '../../../../types/equipmentKind';
import { toDateInputValue } from '../../../../utils/date';
import { useAsset } from '../../../assets/hooks/useAsset';
import { AssetAttributesView } from '../../../assets/components/AssetAttributesView';
import { AssetLifecycleView } from '../../../assets/components/AssetLifecycleView';
import { registerUrl } from '../../../assets/navUrls';
import { useWorkspaceNav } from '../../../workspace/WorkspaceNavContext';
import type { EquipmentDetail } from './types';

/* ================================================================
   Info Tab — P9: kind-driven, no MaterialPicker.
   ================================================================ */

export function InfoTab({ equipment, readOnly }: { equipment: EquipmentDetail; readOnly?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);

  // Lookup the local store's row to get `kind` (EquipmentDetail doesn't carry it).
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localEq = localEquipment.find((e) => e.id === equipment.id);
  const kindLabel = localEq ? EQUIPMENT_KIND_INFO[localEq.kind]?.label ?? localEq.kind : '-';

  const { data: asset } = useAsset(equipment.id);
  const today = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const ws = useWorkspaceNav();

  if (isEditing && !readOnly) {
    return <EditForm equipment={equipment} onClose={() => setIsEditing(false)} />;
  }

  const widthCm = equipment.width2d != null ? Math.round(equipment.width2d) : '-';
  const heightCm = equipment.height2d != null ? Math.round(equipment.height2d) : '-';

  const fields: { label: string; value: string }[] = [
    { label: '이름', value: equipment.name },
    { label: '종류', value: kindLabel },
    { label: '담당자', value: equipment.manager || '-' },
    {
      label: '설치일',
      value: equipment.installDate
        ? new Date(equipment.installDate).toLocaleDateString('ko-KR')
        : '-',
    },
    { label: '크기 (px)', value: `${widthCm} x ${heightCm}` },
    { label: '설명', value: equipment.description || '-' },
  ];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-gray-800">설비 정보</span>
        {!readOnly && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            수정
          </button>
        )}
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="block text-xs text-gray-400 mb-0.5">{f.label}</span>
            <span className="text-sm text-gray-900">{f.value}</span>
          </div>
        ))}
      </div>
      {asset && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <AssetAttributesView fields={asset.assetType.fieldTemplate ?? []} attributes={asset.attributes} readOnly />
          <AssetLifecycleView asset={asset} today={today} readOnly />
          <button
            onClick={() => (ws ? ws.gotoRegister(asset.id) : navigate(registerUrl(asset.substationId, asset.id)))}
            className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            대장에서 편집
          </button>
        </div>
      )}
    </div>
  );
}

/* --- Edit Form — P9: name/manager/description only. --- */

function EditForm({ equipment, onClose }: { equipment: EquipmentDetail; onClose: () => void }) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const setLocalEquipment = useEditorStore((s) => s.setLocalEquipment);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const [editName, setEditName] = useState(equipment.name);
  const [editManager, setEditManager] = useState(equipment.manager ?? '');
  const [editInstallDate, setEditInstallDate] = useState(toDateInputValue(equipment.installDate));
  const [editDescription, setEditDescription] = useState(equipment.description ?? '');

  const handleApply = () => {
    const updated = localEquipment.map((eq) =>
      eq.id === equipment.id
        ? {
            ...eq,
            name: editName,
            manager: editManager || null,
            installDate: editInstallDate || null,
            description: editDescription || null,
          }
        : eq,
    );
    setLocalEquipment(updated);
    setHasChanges(true);
    onClose();
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">이름 *</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
        <input
          type="text"
          value={editManager}
          onChange={(e) => setEditManager(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400"
          placeholder="선택 사항"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">설치일</label>
        <input
          type="date"
          value={editInstallDate}
          onChange={(e) => setEditInstallDate(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 resize-none"
          rows={3}
          placeholder="선택 사항"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleApply}
          disabled={!editName.trim()}
          className="flex-1 text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          적용
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-sm px-3 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
