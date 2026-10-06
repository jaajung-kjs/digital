/**
 * 공량·단가의 **유일한 선언** — 랙 품목·설비 품목·케이블 품목이 같은 칸을 쓴다.
 *
 * 칸을 늘리거나 줄이려면 **여기만** 고친다 — 품목 표와 설계서(`report/*`)가 함께 따라온다.
 *
 * **전부 nullable 이고 뜻이 하나다**: `null` = 「안 적었다」, `0` = 「품이 안 든다」.
 */
export interface LaborSpec {
  /** 직종 코드 — 노임단가는 기준정보가 갖는다. */
  laborCode: string | null;
  /** 자재단가(원/단위). */
  unitPrice: number | null;
  /** 작업 종류별 품(인/단위). */
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
}

/** 설계서가 한 줄의 공량을 셀 때 읽는 칸 — `LaborSpec` 그대로다. */
export type LaborRules = LaborSpec;
