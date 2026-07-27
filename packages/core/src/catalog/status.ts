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
