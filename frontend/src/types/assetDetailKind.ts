/**
 * 자산 상세 패널의 공간섹션 종류 + 끝점 피커 규칙.
 * 분류 자체는 `assetType.role` 단일 소스(이 파일에 더 이상 AssetKind enum 없음).
 */

export type DetailPanelKind = 'rack' | 'ofd' | 'distribution' | 'conduit-ports' | 'feeder-circuits';

/**
 * 케이블 그리기에서 설비 직결이 아닌 하위 endpoint 선택(picker)을 거쳐야 하는 role.
 * 컨테이너(rack→모듈, ofd→포트, panel→회로)만 해당.
 */
const PICKER_REQUIRED_ROLES = new Set(['rack', 'ofd', 'panel']);

export function needsEndpointPicker(role: string | null | undefined): boolean {
  return !!role && PICKER_REQUIRED_ROLES.has(role);
}
