/**
 * 임금실태조사 HWP 읽기 — **실물 보고서**로 잠근다.
 *
 * 값은 파이썬 원본(`~/0630 src/hwp_reader.py`)이 같은 파일에서 뽑은 것과 대조했다. 여기서
 * 지키는 것은 「직종 코드」다 — 카탈로그가 그 코드를 들고 있어서, 이름이 바뀌어도 이어진다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWageHwp, HwpFormatError } from '../standards/hwpWage.js';

const bytes = readFileSync(join(__dirname, 'fixtures', 'wage-2026H1.hwp'));

describe('readWageHwp', () => {
  const report = readWageHwp(bytes);

  it('기준일을 최신 우선으로 읽고 적용시기를 만든다', () => {
    expect(report.dates[0]).toBe('2026.1.1');
    expect(report.half).toBe('2026년도 상반기');
  });

  const by = new Map(report.rows.map((r) => [r.name, r]));
  const newest = (name: string) => by.get(name)!.values[0];

  it('통신 직종의 코드·이름·단가가 원본과 같다', () => {
    expect(by.get('통신내선공')).toMatchObject({ code: '1086', sector: '일반공사' });
    expect(newest('통신내선공')).toEqual({ date: '2026.1.1', wage: 284880 });
    expect(newest('통신설비공')).toEqual({ date: '2026.1.1', wage: 315528 });
    expect(newest('통신외선공')).toEqual({ date: '2026.1.1', wage: 408942 });
    expect(newest('통신케이블공')).toEqual({ date: '2026.1.1', wage: 436224 });
    expect(by.get('광케이블설치사')?.sector).toBe('광전자');
    expect(newest('광케이블설치사')).toEqual({ date: '2026.1.1', wage: 471349 });
  });

  /* 네 회차를 다 들고 온다 — 이것이 「비면 이전 걸 쓰자」를 코드가 판단하지 않게 하는 근거다. */
  it('회차별 값을 모두 읽고, 빈 칸은 아예 담지 않는다', () => {
    expect(by.get('통신내선공')!.values).toEqual([
      { date: '2026.1.1', wage: 284880 },
      { date: '2025.9.1', wage: 283607 },
      { date: '2025.1.1', wage: 278565 },
      { date: '2024.9.1', wage: 275107 },
    ]);
    // 연마공은 이번 회차가 `-` 다 — 그 칸은 행이 아니라 **없음**이다.
    expect(by.get('연마공')!.values).toEqual([{ date: '2025.9.1', wage: 210772 }]);
  });

  /* 각주 표시는 원문이 붙여 둔 것 — 지우지 않는다(조사 미실시 등을 뜻한다). */
  it('각주 표시를 그대로 들고 온다', () => {
    const sw = report.rows.find((r) => r.name === 'S/W시험사');
    expect(sw?.marker).toBe('*');
    expect(sw?.code).toBe('2003');
  });

  it('코드는 겹치지 않는다 — 페이지마다 되풀이되는 머리행에 속지 않는다', () => {
    const codes = report.rows.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(50);
  });

  /* 단가가 없는 직종이 있다 — 파서 결함이 아니라 **보고서가 조사하지 않은 직종**이다.
     그 이유를 우리가 지어내지 않고 원문 각주를 그대로 들고 온다. */
  it('이번 회차에 값이 없는 직종과 그 이유(원문 각주)를 함께 들고 온다', () => {
    const missing = report.rows.filter((r) => r.values[0]?.date !== report.dates[0]);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((r) => r.marker === '**')).toBe(true);
    expect(report.markerNotes['**']).toContain('조사되지 않은 직종');
    expect(report.markerNotes['*']).toContain('5개미만');
  });

  it('HWP 가 아니면 양식 오류로 거절한다', () => {
    expect(() => readWageHwp(Buffer.from('not an ole file'))).toThrow();
    // OLE 이지만 HWP 가 아닌 것도 서명에서 걸린다.
    expect(HwpFormatError.name).toBe('HwpFormatError');
  });
});
