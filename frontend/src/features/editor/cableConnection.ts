import { useEditorStore } from './stores/editorStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { getCableDrawing } from './stores/interactionStore';
import { endpointAssetId } from './cableEndpoint';
import { getCableTypeFromMaterial } from '../../types/material';
import { calculatePathLength } from '../../utils/cable/pathLength';
import { generateTempId } from '../../utils/idHelpers';
import { useToastStore } from './stores/toastStore';

/**
 * 도착 endpoint 확정(phase==='ready') 시 케이블을 생성한다.
 * category/role/number 는 모두 endpoint(EndpointRef)에서 읽는다 — 모달에서
 * 더 이상 역할을 고르지 않는다(1.4). 생성 후 그리기 종료 + 토스트.
 */
export function commitCable(): void {
  const data = getCableDrawing();
  if (!data || data.phase !== 'ready' || !data.category || !data.source || !data.target) return;
  const pathPoints: [number, number][] = [
    [data.source.position.x, data.source.position.y],
    ...data.waypoints,
    [data.target.position.x, data.target.position.y],
  ];
  const { pathLength, bufferLength, totalLength } = calculatePathLength(pathPoints);
  const id = generateTempId();
  const number =
    data.target.number ?? data.source.number ?? data.target.coreNumber ?? data.source.coreNumber ?? null;
  useSubstationWorkingCopy.getState().stageCableCreate({
    id,
    sourceAssetId: endpointAssetId(data.source),
    targetAssetId: endpointAssetId(data.target),
    cableType: getCableTypeFromMaterial(data.category.code),
    categoryId: data.category.id,
    categoryCode: data.category.code,
    categoryName: data.category.name,
    displayColor: data.category.displayColor,
    specParams: {},
    specification: data.category.name,
    pathPoints,
    pathLength,
    bufferLength,
    totalLength,
    number,
    sourceRole: data.source.role ?? null,
    targetRole: data.target.role ?? null,
  });
  useEditorStore.getState().cancelCableDrawing();
  useEditorStore.getState().setSelectedCableId(id);
  useToastStore.getState().showToast('케이블을 연결했습니다');
}
