/**
 * 임금실태조사 HWP → 직종별 노임단가.
 *
 * 왜 HWP 를 직접 읽나: **직종 코드가 여기에만 있다.** 설계서에 붙는 노임 시트는 일련번호만
 * 갖고 있어서(69·70·74…) 판마다 달라지지만, 원본 보고서는 `1086`(통신내선공)·`2001`
 * (광케이블설치사) 같은 조사 코드를 준다. 카탈로그가 그 코드를 들고 있으면 **직종 이름이
 * 바뀌어도 따라간다** — 매체 키(`fiber`)를 저장하고 이름은 어휘에서 읽는 것과 같은 규칙이다.
 *
 * 위치·문단 인덱스에 기대지 않는다: 표 셀의 (행,열)을 HWP 레코드에서 복원하므로 분기마다
 * 직종 수나 페이지 분할이 달라져도 동작한다.
 */
import { inflateRawSync } from 'node:zlib';
import * as CFB from 'cfb';

/** 양식이 기대와 달라 안전하게 읽을 수 없을 때. */
export class HwpFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HwpFormatError';
  }
}

/**
 * 직종 한 줄 — **회차별 값을 전부** 들고 온다.
 *
 * 최신 열만 읽으면 그 반기에 조사되지 않은 직종(값이 `-`)을 만났을 때 「그럼 이전 걸 쓰자」는
 * 판단을 코드가 해야 한다. 있는 값을 다 담아 두면 그 판단은 조회가 대신한다.
 */
export interface WageRow {
  /** 조사 코드 — 이름이 바뀌어도 이것으로 잇는다. */
  code: string;
  name: string;
  /** 부문(일반공사·광전자…) — 코드 첫 자리가 정한다. */
  sector: string;
  /** 각주 표시(`*`·`**`) — 원문이 붙여 둔 것. */
  marker: string;
  /** **값이 있는 회차만.** 최신 우선. 비어 있으면 이 직종은 어느 회차에도 값이 없다. */
  values: { date: string; wage: number }[];
}

export interface WageReport {
  /** 표의 기준일들, **최신 우선**. */
  dates: string[];
  /** 사람이 읽는 적용시기 — 「2026년도 상반기」. */
  half: string;
  rows: WageRow[];
  /**
   * 각주 표시의 뜻 — **원문 문장 그대로**.
   *
   * 「**」가 왜 단가가 없는지는 보고서가 스스로 설명한다(「조사되지 않은 직종…」). 그 문장을
   * 우리가 지어내면 보고서가 기준을 바꿀 때 화면만 옛말을 하게 된다.
   */
  markerNotes: Record<string, string>;
}

// HWP BodyText 레코드 태그
const PARA_TEXT = 67;
const CTRL_HEADER = 71;
const LIST_HEADER = 72;

const SECTOR_BY_PREFIX: Record<string, string> = {
  '1': '일반공사',
  '2': '광전자',
  '3': '국가유산',
  '4': '원자력',
  '5': '기타',
};

const DATE_RE = /^\d{4}\.\d{1,2}\.\d{1,2}$/;
const CODE_RE = /^(\*{0,2})(\d{4})$/;
const WAGE_RE = /^-?[\d,]+/;

/** 레코드 헤더 = tag(10) + level(10) + size(12). size 가 0xFFF 면 다음 4바이트가 실제 크기. */
function* records(buf: Buffer): Generator<{ tag: number; payload: Buffer }> {
  let i = 0;
  while (i + 4 <= buf.length) {
    const h = buf.readUInt32LE(i);
    const tag = h & 0x3ff;
    let size = (h >> 20) & 0xfff;
    i += 4;
    if (size === 0xfff) {
      size = buf.readUInt32LE(i);
      i += 4;
    }
    yield { tag, payload: buf.subarray(i, i + size) };
    i += size;
  }
}

/** PARA_TEXT 는 utf-16le — 제어문자를 걷어낸다. */
function cleanText(payload: Buffer): string {
  const s = payload.toString('utf16le');
  let out = '';
  for (const ch of s) if (ch.codePointAt(0)! >= 32) out += ch;
  return out;
}

/** 표 한 장 = (행,열) → 글자. */
type Grid = Map<string, string>;

const cellKey = (row: number, col: number) => `${row},${col}`;

function sectionBuffers(cfb: CFB.CFB$Container): Buffer[] {
  const out: { name: string; buf: Buffer }[] = [];
  for (const entry of cfb.FullPaths.map((p, i) => ({ p, e: cfb.FileIndex[i]! }))) {
    const m = /^[^/]+\/BodyText\/(Section\d+)$/.exec(entry.p);
    if (!m || entry.e.type !== 2) continue;
    const raw = Buffer.from(entry.e.content as Uint8Array);
    let buf: Buffer;
    try {
      buf = inflateRawSync(raw);
    } catch {
      buf = raw; // 비압축 문서
    }
    out.push({ name: m[1]!, buf });
  }
  out.sort((a, b) => a.name.localeCompare(b.name)); // Section0, Section1 …
  return out.map((x) => x.buf);
}

/** 표 밖 문단까지 포함한 본문 글줄 — 각주를 읽는 데 쓴다. */
function readParagraphs(cfb: CFB.CFB$Container): string[] {
  const out: string[] = [];
  for (const buf of sectionBuffers(cfb)) {
    for (const { tag, payload } of records(buf)) {
      if (tag === PARA_TEXT) out.push(cleanText(payload));
    }
  }
  return out;
}

/**
 * 각주 문장을 원문에서 집는다.
 *
 * 「*」만 든 줄과 「**」만 든 줄을 따로 고른다 — 둘 다 든 통합 안내문은 어느 쪽 설명도 아니다.
 */
function markerLegends(paragraphs: string[]): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const raw of paragraphs) {
    const t = raw.trim();
    const one = t.includes('「*」');
    const two = t.includes('「**」');
    if (two && !one && !notes['**']) notes['**'] = t;
    else if (one && !two && !notes['*']) notes['*'] = t;
  }
  return notes;
}

/** 문서를 한 번 열어 표(grid)와 본문 글줄을 함께 돌려준다. */
function readDocument(bytes: Buffer): { grids: Grid[]; paragraphs: string[] } {
  /* 엉뚱한 파일을 고른 것도 「양식 불일치」다 — 컨테이너 파서가 던지는 날것을 그대로
     올려보내면 500 이 되고, 사용자는 무엇을 잘못했는지 알 수 없다. */
  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(bytes, { type: 'buffer' });
  } catch {
    throw new HwpFormatError('HWP 파일이 아닙니다');
  }
  const header = cfb.FileIndex.find((e, i) => /^[^/]+\/FileHeader$/.test(cfb.FullPaths[i]!) && e.type === 2);
  if (!header || !Buffer.from(header.content as Uint8Array).subarray(0, 17).equals(Buffer.from('HWP Document File'))) {
    throw new HwpFormatError('HWP 5.x 문서가 아닙니다 (FileHeader 서명 불일치)');
  }

  const grids: Grid[] = [];
  for (const buf of sectionBuffers(cfb)) {
    let cur: Grid | null = null;
    let pos: { row: number; col: number } | null = null;
    for (const { tag, payload } of records(buf)) {
      if (tag === CTRL_HEADER && payload.length >= 4 && payload.subarray(0, 4).reverse().toString('latin1') === 'tbl ') {
        cur = new Map();
        pos = null;
        grids.push(cur);
      } else if (tag === LIST_HEADER && cur && payload.length >= 12) {
        pos = { row: payload.readUInt16LE(10), col: payload.readUInt16LE(8) };
      } else if (tag === PARA_TEXT && cur && pos) {
        const k = cellKey(pos.row, pos.col);
        cur.set(k, (cur.get(k) ?? '') + cleanText(payload));
      }
    }
  }
  return { grids, paragraphs: readParagraphs(cfb) };
}

function gridRows(grid: Grid): number[] {
  const rows = new Set<number>();
  for (const k of grid.keys()) rows.add(Number(k.split(',')[0]));
  return [...rows].sort((a, b) => a - b);
}

function rowCells(grid: Grid, row: number): string[] {
  let maxCol = -1;
  for (const k of grid.keys()) {
    const [r, c] = k.split(',').map(Number);
    if (r === row && c! > maxCol) maxCol = c!;
  }
  const out: string[] = [];
  for (let c = 0; c <= maxCol; c += 1) out.push((grid.get(cellKey(row, c)) ?? '').trim());
  return out;
}

/** 머리행에 기준일이 있고 데이터행이 코드로 시작하면 노임표다. */
function isWageGrid(grid: Grid): boolean {
  let hasDate = false;
  let hasCode = false;
  for (const r of gridRows(grid)) {
    const cells = rowCells(grid, r);
    if (cells.some((x) => DATE_RE.test(x))) hasDate = true;
    if (cells[0] && CODE_RE.test(cells[0])) hasCode = true;
  }
  return hasDate && hasCode;
}

/* 표 마지막 칸에는 표 뒤 각주 단락이 이어 붙는다(레코드 스트림 특성) — 숫자 앞부분만 취한다. */
function parseWage(text: string): number | null {
  const t = text.trim();
  if (t === '' || t === '-') return null;
  const m = WAGE_RE.exec(t);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function halfOf(newestDate: string): string {
  const [y, m] = newestDate.split('.');
  return `${y}년도 ${Number(m) <= 6 ? '상반기' : '하반기'}`;
}

/** 임금실태조사 HWP 를 읽어 직종표를 돌려준다. */
export function readWageHwp(bytes: Buffer): WageReport {
  const doc = readDocument(bytes);
  const grids = doc.grids.filter(isWageGrid);
  if (grids.length === 0) throw new HwpFormatError('개별직종 노임단가 표를 찾지 못했습니다 — 양식 불일치');

  let dates: string[] | null = null;
  const rows: WageRow[] = [];
  const seen = new Set<string>();

  for (const grid of grids) {
    for (const r of gridRows(grid)) {
      const cells = rowCells(grid, r);
      const dateCols = cells.filter((x) => DATE_RE.test(x));
      if (dateCols.length > 0) {
        // 머리행은 페이지마다 되풀이된다 — 기준일만 챙기고 넘긴다.
        if (dates === null) dates = dateCols; // 최신 우선(왼→오)
        continue;
      }
      const m = cells[0] ? CODE_RE.exec(cells[0]) : null;
      if (!m) continue;
      const name = (cells[1] ?? '').trim();
      if (!name || seen.has(m[2]!)) continue;
      seen.add(m[2]!);
      /* 기준일 열 수만큼 오른쪽으로 읽는다 — 회차 수는 분기마다 달라질 수 있다. */
      const values: { date: string; wage: number }[] = [];
      for (const [i, date] of (dates ?? []).entries()) {
        const wage = parseWage(cells[2 + i] ?? '');
        if (wage != null) values.push({ date, wage });
      }
      rows.push({
        code: m[2]!,
        name,
        sector: SECTOR_BY_PREFIX[m[2]![0]!] ?? '기타',
        marker: m[1]!,
        values,
      });
    }
  }

  if (dates === null || rows.length === 0) {
    throw new HwpFormatError('노임표를 읽었지만 기준일이나 직종이 없습니다 — 양식 불일치');
  }
  return { dates, half: halfOf(dates[0]!), rows, markerNotes: markerLegends(doc.paragraphs) };
}
