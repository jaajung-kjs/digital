import { useMemo, useState, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
import {
  useCableDrawing,
  useInteractionStore,
  getCableDrawing,
} from '../../stores/interactionStore';
import { useCableCategories } from '../../../cables/hooks/useCableCategories';
import { getCableTypeFromMaterial } from '../../../../types/material';
import type { CableCategory } from '../../../../types/cableCategory';
import { calculatePathLength } from '../../../../utils/cable/pathLength';
import { generateTempId } from '../../../../utils/idHelpers';
import { MaterialSelectionModal } from '../MaterialSelectionModal';
import { useToastStore } from '../../stores/toastStore';
import { useEffectiveAssets } from '../../../workingCopy/hooks';

type EndpointRole = 'IN' | 'OUT' | null;

export function CableSpecModalWrapper() {
  return <CableSpecModal />;
}

/**
 * P9: cable category picker shown after the user finishes drawing source →
 * waypoints → target. Categories filtered by `preselectedCableDisplayGroup`
 * (sidebar pill), or all categories when no group is preselected.
 *
 * CM-B: pathPoints 자체가 cm 단위이므로 scaleRatio 인자 없이 길이 계산.
 */
function CableSpecModal() {
  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const preselectedGroup = useEditorStore(
    (s) => s.preselectedCableDisplayGroup,
  );
  const { data: cableCategories } = useCableCategories();
  const effectiveAssets = useEffectiveAssets();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // 전원계통 방향성 — distributor 끝점이면 IN/OUT 을 지정한다.
  // endpoint asset = INNER pick(분기/모듈) 우선, 없으면 CONTAINER asset.
  const sourceEndpointId = cable?.sourceInnerAssetId ?? cable?.sourceContainerAssetId ?? null;
  const targetEndpointId = cable?.targetInnerAssetId ?? cable?.targetContainerAssetId ?? null;
  const isDistributor = (assetId: string | null): boolean => {
    if (!assetId) return false;
    const a = effectiveAssets.find((x) => x.id === assetId);
    return a?.assetType?.connectionKind === 'distributor';
  };
  const sourceIsDist = isDistributor(sourceEndpointId);
  const targetIsDist = isDistributor(targetEndpointId);

  // distributor 끝점은 기본 '출력'(OUT), 비-distributor 끝점은 null.
  const [sourceRole, setSourceRole] = useState<EndpointRole>(null);
  const [targetRole, setTargetRole] = useState<EndpointRole>(null);

  // Reset selection when the modal opens.
  useEffect(() => {
    if (phase === 'selectingSpec') {
      setSelectedCategoryId(null);
      setSourceRole(sourceIsDist ? 'OUT' : null);
      setTargetRole(targetIsDist ? 'OUT' : null);
    }
    // sourceIsDist/targetIsDist 는 phase 전환 시점의 끝점으로 결정 — phase 의존만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const visibleCategories = useMemo<CableCategory[]>(() => {
    const all = (cableCategories ?? []).filter((c) => c.isActive);
    if (!preselectedGroup) return all;
    return all.filter((c) => c.displayGroup === preselectedGroup);
  }, [cableCategories, preselectedGroup]);

  if (phase !== 'selectingSpec') return null;

  const selectedCat = selectedCategoryId
    ? visibleCategories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedCat) return;
    const data = getCableDrawing();
    if (!data) return;
    const pathPoints: [number, number][] = [];
    if (data.sourcePosition) pathPoints.push([data.sourcePosition.x, data.sourcePosition.y]);
    pathPoints.push(...data.waypoints);
    if (data.targetPosition) pathPoints.push([data.targetPosition.x, data.targetPosition.y]);
    const cableType = getCableTypeFromMaterial(selectedCat.code);

    // pathPoints 가 cm 좌표 — calculatePathLength 가 cm 길이를 직접 돌려준다.
    const { pathLength, bufferLength, totalLength } = calculatePathLength(pathPoints);

    // For OFD ports we attach the fiberPath via either side. The model uses
    // single `fiberPathId / fiberPortNumber` fields so target-side wins when
    // both endpoints are OFDs (rare; usually only one side is fiber-tracked).
    const fiberPathId = data.targetFiberPathId ?? data.sourceFiberPathId ?? null;
    const fiberPortNumber = data.targetPortNumber ?? data.sourcePortNumber ?? null;

    const newCableId = generateTempId();
    // 단계4b — endpoint 는 단일 assetId. INNER pick(랙 모듈 / 분전반 분기 asset)이 있으면
    //   그게 정밀 endpoint, 없으면 CONTAINER asset 자체가 endpoint.
    //   READ 는 floorAnchor 가 branch→feeder→분전반 / module→랙 으로 해소해 시각화.
    const sourceAssetId = data.sourceInnerAssetId ?? data.sourceContainerAssetId ?? null;
    const targetAssetId = data.targetInnerAssetId ?? data.targetContainerAssetId ?? null;
    // SSOT-2d Task 4 — 케이블 생성을 통합 스토어 stage 액션으로.
    useSubstationWorkingCopy.getState().stageCableCreate({
      id: newCableId,
      sourceAssetId,
      targetAssetId,
      cableType,
      categoryId: selectedCat.id,
      categoryCode: selectedCat.code,
      categoryName: selectedCat.name,
      displayColor: selectedCat.displayColor,
      specParams: {},
      specification: selectedCat.name,
      pathPoints,
      pathLength,
      bufferLength,
      totalLength,
      fiberPathId,
      fiberPortNumber,
      // 전원계통 방향성 — distributor 끝점만 role 을 가진다(아니면 null).
      sourceRole: sourceIsDist ? sourceRole : null,
      targetRole: targetIsDist ? targetRole : null,
    });

    useInteractionStore.getState().cancel();
    useEditorStore.getState().setSelectedCableId(newCableId);
    useEditorStore.getState().setTool('select');
    useToastStore.getState().showToast('케이블을 연결했습니다');
  };

  const handleCancel = () => {
    useInteractionStore.getState().cancel();
    useEditorStore.getState().setTool('select');
  };

  return (
    <MaterialSelectionModal
      title={
        preselectedGroup
          ? `케이블 — ${preselectedGroup}`
          : '케이블 카테고리 선택'
      }
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmDisabled={!selectedCat}
      selectedLabel={selectedCat?.name}
    >
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {visibleCategories.length === 0 ? (
          <p className="text-sm text-content-faint text-center py-6">
            사용 가능한 카테고리가 없습니다.
          </p>
        ) : (
          visibleCategories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            const swatch = cat.displayColor ?? '#9ca3af';
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  active
                    ? 'border-primary bg-info-bg ring-1 ring-primary/30'
                    : 'border-line hover:bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: swatch }}
                />
                <span className="text-sm text-content text-left flex-1 truncate">
                  {cat.name}
                </span>
                {cat.displayGroup && (
                  <span className="text-[11px] text-content-faint">
                    {cat.displayGroup}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {(sourceIsDist || targetIsDist) && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          <p className="text-[11px] text-content-faint">
            방향성 설비 연결 — 입력/출력을 지정하세요.
          </p>
          {sourceIsDist && (
            <RoleSelector
              label="출발"
              value={sourceRole}
              onChange={setSourceRole}
            />
          )}
          {targetIsDist && (
            <RoleSelector
              label="도착"
              value={targetRole}
              onChange={setTargetRole}
            />
          )}
        </div>
      )}
    </MaterialSelectionModal>
  );
}

/** distributor 끝점의 IN(입력)/OUT(출력) 선택기. 기본 OUT. */
function RoleSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EndpointRole;
  onChange: (r: EndpointRole) => void;
}) {
  const options: { role: 'IN' | 'OUT'; text: string }[] = [
    { role: 'IN', text: '입력' },
    { role: 'OUT', text: '출력' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-faint w-8">{label}</span>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const active = value === o.role;
          return (
            <button
              key={o.role}
              type="button"
              onClick={() => onChange(o.role)}
              className={`px-3 py-1 rounded-md border text-sm transition-colors ${
                active
                  ? 'border-primary bg-info-bg ring-1 ring-primary/30 text-content'
                  : 'border-line hover:bg-surface-2 text-content-faint'
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
