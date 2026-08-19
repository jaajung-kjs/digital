/**
 * 공량·단가의 **유일한 선언** — 장비 품목·설비 품목·케이블 품목이 이것을 함께 쓴다.
 *
 * 왜 한 곳인가: 예전에는 셋이 각자 스키마를 갖고 있었다. 케이블에만 이설이 없고, 설비에만
 * 자재단가가 없고, 케이블 필드만 이름에 단위가 박혀 있었다(`…PerM`). 이름이
 * 다르면 공용 폼도 공용 계산도 만들 수 없어서, 결국 세 곳에 손으로 적게 되고 하나만
 * 고쳐지는 것이 시간 문제가 된다.
 *
 * 이제 칸을 늘리거나 줄이려면 **여기만** 고친다 — 세 화면과 설계서가 함께 따라온다.
 */

/** 작업 종류 — 설계서가 한 줄로 세는 단위. */
export const WORK_KINDS = [
  { key: 'install', label: '신설' },
  { key: 'remove', label: '철거' },
  /* 케이블 이설은 현장에서 철거+신설로 잡지만, 칸을 없애지는 않는다 — 담체마다 칸이 다르면
     그 차이를 화면·계산·스키마 세 곳이 각자 기억해야 한다. 안 쓰면 비워 두면 그만이다. */
  { key: 'relocate', label: '이설' },
] as const;

export type WorkKind = (typeof WORK_KINDS)[number]['key'];

/**
 * 공량을 갖는 것들과 그 단위. 단위는 **담체**가 정한다 — 필드 이름에 박지 않는다.
 *
 * `emptyManDays` 는 품 칸을 **비워 뒀을 때의 뜻**이다. 담체마다 다르다: 설비만 안에 든
 * 장비의 공량을 합쳐 세고(`reportSelectors.assemblyLabor`), 자산·케이블은 합칠 것이 없어
 * 0 으로 잡힌다(`assetReportItem`·`cableReportItem` 의 `?? 0`). 담체가 선언하므로 화면이
 * `carrier === 'assembly'` 를 알 필요가 없다.
 */
export const LABOR_CARRIERS = {
  asset: { label: '장비 품목', unit: '대', emptyManDays: '품 0' },
  assembly: { label: '설비 품목', unit: '식', emptyManDays: '장비 합산' },
  cable: { label: '케이블 품목', unit: 'm', emptyManDays: '품 0' },
} as const;

export type LaborCarrier = keyof typeof LABOR_CARRIERS;

/**
 * 한 종류의 공량·단가.
 *
 * **전부 nullable 이고 뜻이 하나다**: `null` = 「안 적었다」(안에 든 것을 합쳐 센다, 없으면
 * 0), `0` = 「품이 안 든다」. 둘을 구별해야 설비 1식 공량과 장비 합계가 갈린다.
 */
export interface LaborSpec {
  /** 직종 코드 — 노임단가는 적산 기준가 갖는다. */
  laborCode: string | null;
  /** 자재단가(원/단위). */
  unitPrice: number | null;
  /** 작업 종류별 품(인/단위). */
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
}

/** `WorkKind` → `LaborSpec` 의 필드 이름. 화면·계산이 이 표로만 필드를 찾는다. */
export const MAN_DAY_FIELD = {
  install: 'installManDays',
  remove: 'removeManDays',
  relocate: 'relocateManDays',
} as const satisfies Record<WorkKind, keyof LaborSpec>;

/** 이 작업에 드는 품 — 안 적었으면 null(합쳐 세라는 뜻). */
export function manDaysOf(spec: LaborSpec, kind: WorkKind): number | null {
  return spec[MAN_DAY_FIELD[kind]];
}

/**
 * 표의 열 이름 — 「신설(인/m)」처럼 단위까지. 표는 폭이 넉넉하다.
 *
 * 상세 폼에서는 라벨 자리가 좁아 줄이 접히므로 단위를 값 쪽에 둔다(`manDayUnit`).
 */
export function laborFieldLabel(kind: WorkKind, carrier: LaborCarrier): string {
  const work = WORK_KINDS.find((w) => w.key === kind)!;
  return `${work.label}(인/${LABOR_CARRIERS[carrier].unit})`;
}

/** 품의 단위 — 「인/m」. 폼이 값 옆에 한 번만 적는다. */
export const manDayUnit = (carrier: LaborCarrier) => `인/${LABOR_CARRIERS[carrier].unit}`;
/** 자재단가의 단위 — 「원/m」. */
export const unitPriceUnit = (carrier: LaborCarrier) => `원/${LABOR_CARRIERS[carrier].unit}`;

/** 자재단가를 안 적었을 때의 뜻 — 담체를 가리지 않는다(`ReportItem.unitPrice`: 재료비 0). */
const EMPTY_UNIT_PRICE = '재료비 0';

/**
 * **비워 두면 무슨 뜻인가** — 화면이 그 칸의 빈칸 안내(placeholder)로 그대로 적는다.
 *
 * `null`(안 적었다)과 `0`(품이 안 든다)은 뜻이 정반대인데, 화면에서는 빈 상자와 `0` 이 든
 * 상자라 거의 같아 보였다. 게다가 0 을 지워 null 로 되돌릴 수 있는지조차 알 수 없었다 —
 * 지워 보고 나서야 알 수 있는 것은 알려 준 것이 아니다. 자료가 3-상태면 화면도 3-상태여야
 * 하고, **빈 칸이 스스로 제 뜻을 말하는 것**이 가장 싼 3-상태다.
 */
export function emptyMeaning(carrier: LaborCarrier, kind: 'price' | 'manDays'): string {
  return `미입력 (${kind === 'price' ? EMPTY_UNIT_PRICE : LABOR_CARRIERS[carrier].emptyManDays})`;
}

/**
 * 직종과 노임단가는 **다른 데이터**다 — 화면이 붙여 놓으면 한 칸에 둘 다 저장되는 것으로 읽힌다.
 *
 * - `laborCode` 는 **카탈로그가 저장**한다(사용자가 고른다).
 * - 노임단가는 **적산 기준가 정한다**(임포트가 SSOT). 골라 놓으면 따라오고, 고칠 수 없다.
 *
 * 그래서 화면도 두 칸으로 나눈다: 고르는 칸과 따라오는 칸.
 */
export const LABOR_CODE_LABEL = '노무유형';
export const LABOR_WAGE_LABEL = '노임단가';
/** 노임단가의 단위 — 폼은 값에, 표는 열 이름에 붙인다. */
export const WAGE_UNIT = '원/일';

/** 자재단가 라벨 — 「자재단가(원/m)」. */
export function unitPriceLabel(carrier: LaborCarrier): string {
  return `자재단가(원/${LABOR_CARRIERS[carrier].unit})`;
}

/**
 * 이 담체가 보여 주는 **숫자 칸 전부** — 폼도 표도 이 목록으로만 칸을 만든다.
 *
 * 폼과 표가 각자 칸을 적으면 반드시 어긋난다(실제로 케이블 표에만 자재단가가 빠져 있었다).
 * 칸을 늘리려면 여기 한 곳이다.
 */
export function laborSpecColumns(carrier: LaborCarrier): {
  field: keyof LaborSpec;
  label: string;
  unit: string;
  kind: 'price' | 'manDays';
  /** 이 칸을 비워 뒀을 때의 뜻 — 폼이 빈칸 안내로 적는다(`emptyMeaning`). */
  empty: string;
}[] {
  /* 이름과 단위를 **따로** 준다 — 붙여 두면 표 머리글이 「자재단가(원/」 처럼 토큰
     한가운데서 접힌다. 폼은 값 옆에, 표는 이름 옆에 흐리게 단다. */
  return [
    {
      field: 'unitPrice',
      label: '자재단가',
      unit: unitPriceUnit(carrier),
      kind: 'price',
      empty: emptyMeaning(carrier, 'price'),
    },
    ...WORK_KINDS.map((w) => ({
      field: MAN_DAY_FIELD[w.key] as keyof LaborSpec,
      label: w.label,
      unit: manDayUnit(carrier),
      kind: 'manDays' as const,
      empty: emptyMeaning(carrier, 'manDays'),
    })),
  ];
}

/** 아무것도 안 적힌 공량 — 새로 만들 때의 시작점. */
export const EMPTY_LABOR_SPEC: LaborSpec = {
  laborCode: null,
  unitPrice: null,
  installManDays: null,
  removeManDays: null,
  relocateManDays: null,
};
