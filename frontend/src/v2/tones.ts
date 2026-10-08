import { CORE_STATUSES, EQUIPMENT_STATUSES } from '@twin/core';
import type { BadgeStatus } from '../components/ui';

/**
 * **배지·점 색의 뜻 — 한 곳**(CONVENTIONS §2.1 「배지·색의 뜻」). 화면이 색을 다시 정하지 않고 여기서 읽는다.
 *
 * | 톤 | 뜻 |
 * |---|---|
 * | danger | 지금 고장이거나 쓸 수 없음 — 설비 고장 · 코어 단선 · 저장을 막는 오류 |
 * | warning | 손봐야 함(잘못은 아님) — 코어 사용불가 · 경로 미완결 · 미입력/미등록 · 이중화 경고 |
 * | success | 정상이 **대조될 때만** — 「적용 중」(평상시 정상은 색 없음) |
 * | info | 고른 것·주의를 끄는 참조 — 주회선 · 예비회선(점선 테) |
 * | neutral | 범주(좋고 나쁨이 없음) — 신설·철거·이설 · 설비 상태 예비·철거예정·교체예정 · 주/예비 미지정 · 판 버전 · 「값 반영됨」·「미적용」 |
 *
 * 상태 어휘의 톤은 core(`EQUIPMENT_STATUSES`·`CORE_STATUSES` 의 `tone`)가 원천이다.
 */
export const TONE = {
  /** 지금 고장·쓸 수 없음 · 저장을 막는 오류. */
  error: 'danger',
  /** 손봐야 함 — 미입력·미등록·경로 미완결·이중화 경고. */
  warning: 'warning',
  /** 범주 — 신설·철거·이설, 버전, 미지정. */
  category: 'neutral',
  /** 회선 주/예비. */
  duty: 'info',
  /** 정상이 대조될 때(적용 중). */
  contrastOk: 'success',
} as const satisfies Record<string, BadgeStatus>;

/** 설비 상태 → 톤(core 어휘). 모르는 값은 neutral. */
export function equipmentStatusTone(value: string): BadgeStatus {
  return EQUIPMENT_STATUSES.find((s) => s.value === value)?.tone ?? TONE.category;
}

/** 코어 상태 → 톤 — 단선 danger, 사용불가 warning, 정상 neutral(core 어휘). */
export function coreStatusTone(value: string): BadgeStatus {
  return CORE_STATUSES.find((s) => s.value === value)?.tone ?? TONE.category;
}

/** 공사 구분(신설·철거·이설) — 범주라 셋 다 neutral, 글자로 가른다(결정 7). 「철거」가 빨강이면 오류처럼 읽힌다. */
export const WORK_KIND_TONE: BadgeStatus = TONE.category;
