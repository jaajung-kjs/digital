/**
 * 공량·단가의 **유일한 선언** — 자산 종류·설비 종류·케이블 종류가 이것을 함께 쓴다.
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

/** 공량을 갖는 것들과 그 단위. 단위는 **담체**가 정한다 — 필드 이름에 박지 않는다. */
export const LABOR_CARRIERS = {
  asset: { label: '자산 종류', unit: '대' },
  assembly: { label: '설비 종류', unit: '식' },
  cable: { label: '케이블 종류', unit: 'm' },
} as const;

export type LaborCarrier = keyof typeof LABOR_CARRIERS;

/**
 * 한 종류의 공량·단가.
 *
 * **전부 nullable 이고 뜻이 하나다**: `null` = 「안 적었다」(안에 든 것을 합쳐 센다, 없으면
 * 0), `0` = 「품이 안 든다」. 둘을 구별해야 설비 1식 공량과 부품 합계가 갈린다.
 */
export interface LaborSpec {
  /** 직종 코드 — 노임단가는 기준자료가 갖는다. */
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

/** 화면이 쓰는 라벨 — 「신설(인/m)」처럼 단위까지. 한 곳에서 만든다. */
export function laborFieldLabel(kind: WorkKind, carrier: LaborCarrier): string {
  const work = WORK_KINDS.find((w) => w.key === kind)!;
  return `${work.label}(인/${LABOR_CARRIERS[carrier].unit})`;
}

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
export function laborSpecColumns(
  carrier: LaborCarrier,
): { field: keyof LaborSpec; label: string; kind: 'price' | 'manDays' }[] {
  return [
    { field: 'unitPrice', label: unitPriceLabel(carrier), kind: 'price' },
    ...WORK_KINDS.map((w) => ({
      field: MAN_DAY_FIELD[w.key] as keyof LaborSpec,
      label: laborFieldLabel(w.key, carrier),
      kind: 'manDays' as const,
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
