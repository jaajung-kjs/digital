/** 자산 상태 어휘 — 표시·선택지는 이 상수만 읽는다 (추후 카탈로그 데이터로 승격 가능). */
export const ASSET_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  /* 예비는 **노랑**이다 — 회색이면 「아무것도 아님」과 같아 보인다. 판을 훑는 사람이
     알고 싶은 것은 셋 중 어느 것이냐이고, 그 셋은 신호등의 셋과 같다. */
  { value: 'standby', label: '예비', tone: 'warning' },
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

/** 이 상태를 무슨 빛으로 보일 것인가 — 배지도 구성 격자의 표시등도 이걸 읽는다. */
export function assetStatusTone(value: string): AssetStatusTone | null {
  return ASSET_STATUSES.find((s) => s.value === value)?.tone ?? null;
}

export type AssetStatusTone = (typeof ASSET_STATUSES)[number]['tone'];

/**
 * 여럿의 상태를 하나로 — **나쁜 쪽이 이긴다**.
 *
 * 설비를 한 줄로 접으면 그 줄은 안에 든 것들을 대신해 말한다. 접기는 정보를 **줄이는**
 * 장치이지 **바꾸는** 장치가 아니므로, 접힌 줄이 「정상」인데 펴면 「고장」이 들어 있으면
 * 안 된다 — 변전소 대장을 여는 첫째 이유가 「고장난 게 있나」인데 그때 초록 점을 보게 된다.
 *
 * 심각도는 **어휘의 선언 순서**다(정상 → 예비 → 고장, 뒤로 갈수록 나쁘다). 순서를 여기
 * 따로 적지 않는 이유는 그것이 곧 두 번째 진실이 되기 때문이다 — 어휘에 하나를 끼워 넣고
 * 이 함수를 안 고치면 조용히 어긋난다.
 *
 * 어휘에 없는 값은 순위를 매길 근거가 없으므로 겨루지 않는다(다 모르는 값이면 첫 값 그대로).
 */
export function worstAssetStatus(values: Iterable<string>): string | null {
  const rank = (v: string) => ASSET_STATUSES.findIndex((s) => s.value === v);
  let best: string | null = null;
  let bestRank = -1;
  for (const v of values) {
    if (best === null) best = v;
    const r = rank(v);
    if (r > bestRank) {
      bestRank = r;
      best = v;
    }
  }
  return best;
}

/* 포트 방향 어휘는 `catalog/types.ts` 에 있다 — 타입(`Direction`) 이 그 어휘에서 파생되므로
   값과 타입이 한 곳에 있어야 갈라지지 않는다. */
