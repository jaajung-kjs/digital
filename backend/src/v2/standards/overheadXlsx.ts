/**
 * 조달청 「간접공사비 적용기준」 XLSX → 제비율표.
 *
 * 왜 필요한가: 설계서의 간접노무비·경비·일반관리비·이윤은 **고정 상수가 아니다.**
 * (공사종류 × 공사규모 × 공사기간 × 계약방법) 구간으로 이 표에서 조회하는 값이라, 상수로
 * 박아 두면 공사 규모가 커질 때 조용히 틀린다.
 *
 * **올릴 때 표 전체를 펼쳐 둔다.** 조회 때마다 xlsx 를 다시 여는 대신, 등록 시점에 구간을
 * 모두 훑어 값만 남긴다 — 설계서는 그 뒤로 순수 데이터만 본다(엑셀 양식이 화면 코드에
 * 새어 들지 않는다).
 *
 * 읽는 규칙은 `~/0630 src/lookup.py`(골든 테스트로 조달청 원본과 대조된 코드)를 옮긴 것이다.
 * 좌표가 아니라 **앵커 라벨**(`[간접노무비]`)로 찾으므로 고시가 바뀌어 열이 밀려도 견딘다.
 */
import ExcelJS from 'exceljs';

export class OverheadFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverheadFormatError';
  }
}

/** 공사규모 구간 — 직접공사비 기준. */
export const SIZE_BANDS = ['10억미만', '10-50억', '50-300억', '300-1000억', '1000억이상'] as const;
/** 공사기간 구간 — 일(日) 기준. */
export const DURATION_BANDS = ['183', '365', '1095', '1096+'] as const;
/** 산업안전보건관리비 대상액 구간. */
export const SANAN_BANDS = ['2천만미만', '5억미만', '5-50억', '50억이상'] as const;

export type SizeBand = (typeof SIZE_BANDS)[number];
export type DurationBand = (typeof DURATION_BANDS)[number];
export type SananBand = (typeof SANAN_BANDS)[number];

export interface OverheadTable {
  /** 파일이 밝힌 적용시기 — 「2026. 4.30. 입찰공고분 부터」. */
  effective: string;
  /** 이 표를 읽은 공사종류. 우리 공사는 전기통신소방전문이다. */
  kind: string;
  /** 규모 × 기간 — 소수(19.1% → 0.191). */
  byDuration: Record<'간접노무비' | '기타경비', Record<SizeBand, Record<DurationBand, number>>>;
  /** 규모만 탄다(기간 무관). 이윤은 **경쟁계약** 값이다. */
  bySize: Record<'일반관리비' | '이윤', Record<SizeBand, number>>;
  /** 파일이 정하는 고정요율. */
  fixed: Record<'고용보험료' | '건강보험료' | '연금보험료' | '퇴직공제부금비' | '노인장기요양보험료', number>;
  /** 산안비 — 대상액 구간별 요율과 기초액(원). */
  sanan: Record<SananBand, { rate: number; base: number | null }>;
}

// ── 좌표 규칙 (lookup.py / mapping.py) ───────────────────────────────────────

/** 규모 구간 → 첫 데이터 행(183일 행). */
const SIZE_BASE_ROW: Record<SizeBand, number> = {
  '10억미만': 15,
  '10-50억': 23,
  '50-300억': 31,
  '300-1000억': 39,
  '1000억이상': 47,
};
const DURATION_OFFSET: Record<DurationBand, number> = { '183': 0, '365': 2, '1095': 4, '1096+': 6 };

/**
 * 일반관리비·이윤 전용 행.
 *
 * 이 둘은 공사기간과 무관하고, **공사원가(재+노+경)** 기준 규모 밴드를 쓴다. 직접공사비
 * 기준 밴드를 가장 가까운 공사원가 밴드 행에 대응시킨다(병합셀이라 중간 행은 비어 있다).
 */
const SIZE_BASE_ROW_ILBAN: Record<SizeBand, number> = {
  '10억미만': 15,
  '10-50억': 15,
  '50-300억': 31,
  '300-1000억': 39,
  '1000억이상': 43,
};

/** 간접노무비·기타경비의 데이터 열 — 토목 종합열(전기통신소방전문이 쓰는 열). */
const DATA_COL: Record<'간접노무비' | '기타경비', number> = { 간접노무비: 29, 기타경비: 38 };

const ANCHOR: Record<string, string> = {
  간접노무비: '[간접노무비]',
  기타경비: '[기타경비]',
  일반관리비: '[일반관리비]',
  이윤: '[이윤]',
  산업안전보건관리비: '[산업안전보건관리비]',
  고용보험료: '[고용보험료]',
  건강보험료: '[건강보험료]',
  연금보험료: '[연금보험료]',
  퇴직공제부금비: '[퇴직공제부금비]',
  노인장기요양보험료: '[노인장기요양보험료]',
};

/* 파일에 요율이 「(직노) x 3.595」 같은 **글자**로 적혀 있다. */
const X_NUM = /\bx\s+(\d+(?:\.\d+)?)/;

/**
 * 산안비 구간 이름 — 우리 어휘 → 파일 표기.
 *
 * 「2천만미만」은 파일에 행이 없다: 산안비는 총 공사금액 2천만 원 이상부터 적용된다.
 */
const SANAN_FILE_KEY: Record<SananBand, string | null> = {
  '2천만미만': null,
  '5억미만': '5억미만',
  '5-50억': '5억~50억미만',
  '50억이상': '50억이상',
};

// ── 시트 읽기 ────────────────────────────────────────────────────────────────

type Sheet = ExcelJS.Worksheet;

const cellText = (ws: Sheet, row: number, col: number): string | null => {
  const v = ws.getCell(row, col).value;
  if (typeof v === 'string') return v;
  if (v != null && typeof v === 'object' && 'richText' in v) {
    return (v.richText as { text: string }[]).map((t) => t.text).join('');
  }
  return null;
};

const cellNumber = (ws: Sheet, row: number, col: number): number | null => {
  const v = ws.getCell(row, col).value;
  if (typeof v === 'number') return v;
  /* 수식 셀은 계산된 값이 `result` 로 온다 — 파일에 저장된 값을 그대로 쓴다. */
  if (v != null && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result;
  return null;
};

/** 라벨로 시작하는 첫 셀의 (행, 열). 좌표를 박지 않기 위한 유일한 진입점이다. */
function findAnchor(ws: Sheet, label: string): { row: number; col: number } {
  let found: { row: number; col: number } | null = null;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found) return;
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (found) return;
      const t = cellText(ws, rowNumber, colNumber);
      if (t && t.trim().replace(/\n/g, ' ').startsWith(label)) found = { row: rowNumber, col: colNumber };
    });
  });
  if (!found) throw new OverheadFormatError(`앵커를 찾지 못했습니다: ${label}`);
  return found;
}

/** `[간접노무비]` 앵커가 있는 시트가 데이터 시트다. */
function findDataSheet(wb: ExcelJS.Workbook): Sheet {
  for (const ws of wb.worksheets) {
    try {
      findAnchor(ws, ANCHOR.간접노무비!);
      return ws;
    } catch {
      /* 다음 시트 */
    }
  }
  throw new OverheadFormatError('「[간접노무비]」 앵커가 있는 시트를 찾지 못했습니다 — 제비율 양식이 아닙니다');
}

/** 앵커 둘레에서 「x 3.595」 꼴 글자를 찾아 요율을 뽑는다. */
function rateNearAnchor(ws: Sheet, row: number, col: number, span = 8): number {
  for (let r = row; r < row + span; r += 1) {
    for (let c = col; c < col + span; c += 1) {
      const t = cellText(ws, r, c);
      const m = t ? X_NUM.exec(t) : null;
      if (m) return Number(m[1]);
    }
  }
  throw new OverheadFormatError(`요율 수식을 찾지 못했습니다 (앵커 ${row},${col})`);
}

/** 고용보험료는 등급표라 「[7등급]」 줄의 첫 숫자를 쓴다. */
function goyongGrade7(ws: Sheet, row: number, col: number): number {
  for (let r = row; r < row + 30; r += 1) {
    const t = cellText(ws, r, col);
    if (!t || !t.includes('[7등급]')) continue;
    for (let c = col; c < col + 50; c += 1) {
      const n = cellNumber(ws, r, c);
      if (n != null) return n;
    }
  }
  throw new OverheadFormatError('고용보험료 [7등급] 요율을 찾지 못했습니다');
}

/** 파일 값이 퍼센트(3.595)인지 소수(0.03595)인지 가려 소수로 맞춘다. */
const toRatio = (v: number) => (v > 1 ? v / 100 : v);

const normBand = (t: string) => t.trim().replace(/\n/g, '').replace(/\s/g, '');

function readSanan(ws: Sheet): OverheadTable['sanan'] {
  const anc = findAnchor(ws, ANCHOR.산업안전보건관리비!);

  // 머리행에서 구분·요율·기초액 열을 찾는다 — 앵커 **오른쪽**만 본다(다른 섹션과 섞이지 않게).
  let hdr: { row: number; type: number; rate: number; base: number | null } | null = null;
  for (let r = anc.row + 1; r < anc.row + 20 && !hdr; r += 1) {
    let type: number | null = null;
    let rate: number | null = null;
    let base: number | null = null;
    for (let c = anc.col + 1; c < anc.col + 80; c += 1) {
      const t = cellText(ws, r, c);
      if (!t) continue;
      if (t.includes('구분') && type === null) type = c;
      else if (t.includes('요율') && type !== null && rate === null) rate = c;
      else if (t.includes('기초액') && type !== null && base === null) base = c;
    }
    if (type !== null && rate !== null) hdr = { row: r, type, rate, base };
  }
  if (!hdr) throw new OverheadFormatError('[산업안전보건관리비] 머리행(구분/요율)을 찾지 못했습니다');

  const out = {} as OverheadTable['sanan'];
  for (const band of SANAN_BANDS) {
    const key = SANAN_FILE_KEY[band];
    if (key === null) {
      out[band] = { rate: 0, base: null }; // 2천만 미만은 적용 대상이 아니다
      continue;
    }
    let bandRow: number | null = null;
    for (let r = hdr.row + 1; r < anc.row + 60; r += 1) {
      const t = cellText(ws, r, anc.col);
      if (t && normBand(t) === key) {
        bandRow = r;
        break;
      }
    }
    if (bandRow === null) throw new OverheadFormatError(`산안비 구간 '${band}' 을 찾지 못했습니다`);

    /* 구간 안에서 토목공사 줄을 쓴다 — 전기통신소방전문이 따르는 줄이다. */
    let row: number | null = null;
    for (let r = bandRow; r < bandRow + 10; r += 1) {
      const t = cellText(ws, r, hdr.type);
      if (t && t.includes('토목')) {
        row = r;
        break;
      }
    }
    if (row === null) throw new OverheadFormatError(`산안비 구간 '${band}' 의 토목공사 줄을 찾지 못했습니다`);

    const raw = cellNumber(ws, row, hdr.rate);
    if (raw === null) throw new OverheadFormatError(`산안비 요율이 비어 있습니다 (${band})`);
    const baseRaw = hdr.base != null ? cellNumber(ws, row, hdr.base) : null;
    out[band] = { rate: toRatio(raw), base: baseRaw != null ? Math.round(baseRaw * 1000) : null };
  }
  return out;
}

/** 「※ 적용시기 : 2026. 4.30. 입찰공고분 부터」 — 파일이 스스로 밝히는 기준일. */
function readEffective(ws: Sheet): string {
  for (let r = 1; r <= 8; r += 1) {
    for (let c = 1; c <= 12; c += 1) {
      const t = cellText(ws, r, c);
      if (t && t.includes('적용시기')) {
        return t.replace(/^[※\s]*적용시기\s*[:：]?\s*/, '').trim() || t.trim();
      }
    }
  }
  throw new OverheadFormatError('적용시기를 찾지 못했습니다 — 제비율 양식이 아닙니다');
}

/**
 * 제비율 xlsx 를 읽어 **표 전체를 펼친다**.
 *
 * 우리 공사는 전기통신소방전문이다: 일반관리비만 전문 열(앵커 열)을 쓰고 나머지는 토목
 * 종합열을 따른다 — 조달청 기준이 그렇게 정하고 있다.
 */
export async function readOverheadXlsx(bytes: Buffer): Promise<OverheadTable> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new OverheadFormatError('엑셀 파일이 아닙니다');
  }
  const ws = findDataSheet(wb);

  const byDuration = { 간접노무비: {}, 기타경비: {} } as OverheadTable['byDuration'];
  for (const item of ['간접노무비', '기타경비'] as const) {
    const col = DATA_COL[item];
    for (const size of SIZE_BANDS) {
      const bucket = {} as Record<DurationBand, number>;
      for (const dur of DURATION_BANDS) {
        const raw = cellNumber(ws, SIZE_BASE_ROW[size] + DURATION_OFFSET[dur], col);
        if (raw === null) throw new OverheadFormatError(`${item} ${size}/${dur} 값이 비어 있습니다`);
        bucket[dur] = raw / 100;
      }
      byDuration[item][size] = bucket;
    }
  }

  const bySize = { 일반관리비: {}, 이윤: {} } as OverheadTable['bySize'];
  for (const item of ['일반관리비', '이윤'] as const) {
    const col = findAnchor(ws, ANCHOR[item]!).col;
    for (const size of SIZE_BANDS) {
      const raw = cellNumber(ws, SIZE_BASE_ROW_ILBAN[size], col);
      if (raw === null) throw new OverheadFormatError(`${item} ${size} 값이 비어 있습니다`);
      bySize[item][size] = raw / 100;
    }
  }

  const fixed = {} as OverheadTable['fixed'];
  for (const item of ['고용보험료', '건강보험료', '연금보험료', '퇴직공제부금비', '노인장기요양보험료'] as const) {
    const anc = findAnchor(ws, ANCHOR[item]!);
    const raw = item === '고용보험료' ? goyongGrade7(ws, anc.row, anc.col) : rateNearAnchor(ws, anc.row, anc.col);
    fixed[item] = toRatio(raw);
  }

  return {
    effective: readEffective(ws),
    kind: '전기통신소방전문',
    byDuration,
    bySize,
    fixed,
    sanan: readSanan(ws),
  };
}
