import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { EQUIPMENT_KIND_INFO } from '../../../../types/equipmentKind';
import { toDateInputValue } from '../../../../utils/date';
import { useAsset } from '../../../assets/hooks/useAsset';
import { AssetAttributesView } from '../../../assets/components/AssetAttributesView';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../../workingCopy/hooks';
import { assetToEquipment } from '../../../workingCopy/assetToEquipment';
import type { Asset } from '../../../../types/asset';
import type { EquipmentDetail } from './types';

/* ================================================================
   Info Tab — P9: kind-driven, no MaterialPicker.
   ================================================================ */

export function InfoTab({ equipment, readOnly }: { equipment: EquipmentDetail; readOnly?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);

  // 통합 스토어 effective assets 에서 `kind` 를 조회(EquipmentDetail 은 kind 를 안 들고 옴).
  // assetType.placementKind → EquipmentKind 정규화는 assetToEquipment 가 처리.
  const effectiveAssets = useEffectiveAssets();
  const kindLabel = useMemo(() => {
    const a = effectiveAssets.find((x) => x.id === equipment.id);
    if (!a) return '-';
    const kind = assetToEquipment(a).kind;
    return EQUIPMENT_KIND_INFO[kind]?.label ?? kind;
  }, [effectiveAssets, equipment.id]);

  const { data: asset } = useAsset(equipment.id);

  if (isEditing && !readOnly) {
    return <EditForm equipment={equipment} asset={asset} onClose={() => setIsEditing(false)} />;
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
        <span className="text-sm font-bold text-content">설비 정보</span>
        {!readOnly && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary font-medium"
          >
            <Pencil size={14} />
            수정
          </button>
        )}
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="block text-xs text-content-faint mb-0.5">{f.label}</span>
            <span className="text-sm text-content">{f.value}</span>
          </div>
        ))}
      </div>
      {asset && (asset.assetType.fieldTemplate ?? []).length > 0 && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <AssetAttributesView fields={asset.assetType.fieldTemplate ?? []} attributes={asset.attributes} readOnly />
        </div>
      )}
    </div>
  );
}

/* --- Edit Form — P9: name/manager/description only. --- */

function EditForm({
  equipment,
  asset,
  onClose,
}: {
  equipment: EquipmentDetail;
  asset?: Asset;
  onClose: () => void;
}) {
  // 통합 스토어 stage 로 이관(2d-3a T4): 과거 editorStore 의 로컬 설비 교체 대신
  // stageEquipmentUpdate(id, patch) — 단일 설비 update overlay(단일 undo).
  const stageEquipmentUpdate = useSubstationWorkingCopy((s) => s.stageEquipmentUpdate);
  // 커스텀 속성은 attributes 로 직접 스테이징(equipmentToAssetPatch 우회 — properties 변환 불필요).
  const stageAssetUpdate = useSubstationWorkingCopy((s) => s.stageAssetUpdate);

  const [editName, setEditName] = useState(equipment.name);
  const [editManager, setEditManager] = useState(equipment.manager ?? '');
  const [editInstallDate, setEditInstallDate] = useState(toDateInputValue(equipment.installDate));
  const [editDescription, setEditDescription] = useState(equipment.description ?? '');

  // 커스텀 속성(대장 fieldTemplate). asset 이 로드된 경우에만 인라인 편집.
  const fields = asset?.assetType.fieldTemplate ?? [];
  const [attrs, setAttrs] = useState<Record<string, unknown>>({ ...(asset?.attributes ?? {}) });

  const handleApply = () => {
    stageEquipmentUpdate(equipment.id, {
      name: editName,
      manager: editManager || null,
      installDate: editInstallDate || null,
      description: editDescription || null,
    });
    if (asset && fields.length > 0) {
      stageAssetUpdate(equipment.id, { attributes: attrs });
    }
    onClose();
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-content-muted mb-1">이름 *</label>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full text-sm border border-line rounded px-2.5 py-2 focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-content-muted mb-1">담당자</label>
        <input
          type="text"
          value={editManager}
          onChange={(e) => setEditManager(e.target.value)}
          className="w-full text-sm border border-line rounded px-2.5 py-2 focus:outline-none focus:border-primary"
          placeholder="선택 사항"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-content-muted mb-1">설치일</label>
        <input
          type="date"
          value={editInstallDate}
          onChange={(e) => setEditInstallDate(e.target.value)}
          className="w-full text-sm border border-line rounded px-2.5 py-2 focus:outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-content-muted mb-1">설명</label>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full text-sm border border-line rounded px-2.5 py-2 focus:outline-none focus:border-primary resize-none"
          rows={3}
          placeholder="선택 사항"
        />
      </div>
      {fields.length > 0 && (
        <div className="pt-1 border-t border-line">
          <span className="block text-xs font-medium text-content-muted mb-1">속성</span>
          <AssetAttributesView
            fields={fields}
            attributes={attrs}
            readOnly={false}
            onChange={(key, v) => setAttrs((prev) => ({ ...prev, [key]: v }))}
          />
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleApply}
          disabled={!editName.trim()}
          className="flex-1 text-sm px-3 py-2 bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50"
        >
          적용
        </button>
        <button
          onClick={onClose}
          className="flex-1 text-sm px-3 py-2 border border-line text-content-muted rounded hover:bg-surface-2"
        >
          취소
        </button>
      </div>
    </div>
  );
}
