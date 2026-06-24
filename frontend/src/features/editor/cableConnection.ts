import { useEditorStore } from './stores/editorStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { getCableDrawing, useInteractionStore } from './stores/interactionStore';
import type { SelectedCableCategory } from './stores/interactionStore';
import { endpointAssetId } from './cableEndpoint';
import type { EndpointRef } from './cableEndpoint';
import { getCableTypeFromMaterial } from '../../types/material';
import { calculatePathLength } from '../../utils/cable/pathLength';
import { generateTempId } from '../../utils/idHelpers';
import { useToastStore } from './stores/toastStore';

/**
 * 모든 케이블 생성 진입점의 단일 함수. source 를 주면 출발 자동주입(종류→도착만).
 *
 * 순서: setTool('cable') 이 FloorPlanEditor 의 tool↔mode 동기화 effect 를 큐잉하지만,
 * 곧바로 동기 실행되는 cableActivate(opts) 가 실제 상태(source/category)를 세팅한다.
 * effect 가 나중에 실행될 때 mode.kind==='cableDrawing' 이라 guard 에 걸려 빈 호출을
 * 건너뛰므로 source/category 가 보존된다.
 */
export function startCableConnection(opts?: {
  source?: EndpointRef;
  category?: SelectedCableCategory;
  /** 사용자 정의 케이블 그룹 id — 종류 선택 모달의 사전 필터. */
  group?: string;
}): void {
  const editor = useEditorStore.getState();
  // 케이블 그리기 진입 시 열려있던 우측 상세 패널을 닫는다 — 안 닫으면 컨테이너 pick 때
  // setSelectedAssetId 로 그 패널도 같은 뷰를 띄워 다이얼로그와 이중 picker 가 된다.
  editor.closeRightPanel();
  editor.setTool('cable');
  editor.setPreselectedCableGroupId(opts?.group ?? null);
  useInteractionStore.getState().cableActivate({ source: opts?.source, category: opts?.category });
}

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
