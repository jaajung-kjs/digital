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

  it('통신 직종의 코드·이름·단가가 원본과 같다', () => {
    const by = new Map(report.rows.map((r) => [r.name, r]));
    expect(by.get('통신내선공')).toMatchObject({ code: '1086', wage: 284880, sector: '일반공사' });
    expect(by.get('통신설비공')).toMatchObject({ code: '1087', wage: 315528 });
    expect(by.get('통신외선공')).toMatchObject({ code: '1088', wage: 408942 });
    expect(by.get('통신케이블공')).toMatchObject({ code: '1089', wage: 436224 });
    expect(by.get('광케이블설치사')).toMatchObject({ code: '2001', wage: 471349, sector: '광전자' });
    expect(by.get('보통인부')).toMatchObject({ code: '1002', wage: 172068 });
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

  it('HWP 가 아니면 양식 오류로 거절한다', () => {
    expect(() => readWageHwp(Buffer.from('not an ole file'))).toThrow();
    // OLE 이지만 HWP 가 아닌 것도 서명에서 걸린다.
    expect(HwpFormatError.name).toBe('HwpFormatError');
  });
});
