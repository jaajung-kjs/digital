/** 자산 상태 어휘 — 표시·선택지는 이 상수만 읽는다 (추후 카탈로그 데이터로 승격 가능). */
export const ASSET_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  { value: 'standby', label: '예비', tone: 'neutral' },
  { value: 'fault', label: '고장', tone: 'danger' },
] as const;

export type AssetStatusValue = (typeof ASSET_STATUSES)[number]['value'];

/**
 * 새로 만든 자산의 상태.
 *
 * 프런트(임시 자산)와 백엔드(커밋)가 각각 `'normal'` 이라고 적고 있었다 — 한쪽만 바꾸면
 * 화면에 보이던 상태와 저장된 상태가 달라진다. 값은 여기 한 번만 적는다.
 */
export const DEFAULT_ASSET_STATUS: AssetStatusValue = 'normal';

export function assetStatusLabel(value: string): string {
  return ASSET_STATUSES.find((s) => s.value === value)?.label ?? value;
}

/* 포트 방향 어휘는 `catalog/types.ts` 에 있다 — 타입(`Direction`) 이 그 어휘에서 파생되므로
   값과 타입이 한 곳에 있어야 갈라지지 않는다. */
