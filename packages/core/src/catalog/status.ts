/** 자산 상태 어휘 — 표시·선택지는 이 상수만 읽는다 (추후 카탈로그 데이터로 승격 가능). */
export const ASSET_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  { value: 'standby', label: '예비', tone: 'neutral' },
  { value: 'fault', label: '고장', tone: 'danger' },
] as const;

export type AssetStatusValue = (typeof ASSET_STATUSES)[number]['value'];

export function assetStatusLabel(value: string): string {
  return ASSET_STATUSES.find((s) => s.value === value)?.label ?? value;
}

/**
 * 포트 방향 어휘 — 화면에 `BI` 같은 내부 값이 그대로 나가지 않게 하는 단일 지점.
 * (자산 상세 포트 목록이 실제로 "포트 1 · BI · network" 를 그대로 보여주고 있었다.)
 */
export const PORT_DIRECTIONS = [
  { value: 'IN', label: '입력' },
  { value: 'OUT', label: '출력' },
  { value: 'BI', label: '양방향' },
] as const;

export function portDirectionLabel(value: string): string {
  return PORT_DIRECTIONS.find((d) => d.value === value)?.label ?? value;
}
